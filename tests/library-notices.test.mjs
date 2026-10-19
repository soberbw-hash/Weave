import test from "node:test";
import assert from "node:assert/strict";
import {
  createLibraryNoticeStore,
  deliverLibraryNotices,
  noticeGroups,
} from "../src/services/libraryNotices.ts";
import { sendBrowserNotification } from "../src/services/browserNotifications.ts";
import { readFile } from "node:fs/promises";
function storage() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}
function update(
  id,
  clientId = "coworker",
  category = "character",
  assetIds = [id],
) {
  return {
    id,
    clientId,
    category,
    count: assetIds.length,
    assetIds,
    createdAt: "2026-10-16T01:00:00.000Z",
  };
}

test("first connection is silent, later foreign additions persist while own additions stay out", () => {
  const disk = storage(),
    store = createLibraryNoticeStore("library", "me", disk);
  assert.deepEqual(store.observe([update("old")]).added, []);
  assert.deepEqual(
    store
      .observe([update("old"), update("own", "me"), update("new")])
      .added.map((x) => x.id),
    ["new"],
  );
  assert.equal(store.read().entries.length, 1);
  assert.equal(
    createLibraryNoticeStore("library", "me", disk).observe([update("new")])
      .added.length,
    0,
  );
  assert.equal(
    createLibraryNoticeStore("other-library", "me", disk).observe([
      update("new"),
    ]).state.entries.length,
    0,
  );
  assert.equal(
    createLibraryNoticeStore("library", "other-client", disk).observe([
      update("new"),
    ]).state.entries.length,
    0,
  );
});

test("legacy read cursors migrate once without replaying history, and source records stay untouched", () => {
  const disk = storage();
  disk.setItem("weave.library-baseline.library", "1");
  disk.setItem("weave.library-seen.library", '["old"]');
  const store = createLibraryNoticeStore("library", "me", disk);
  assert.deepEqual(
    store
      .observe([update("old"), update("unread")])
      .state.entries.map((x) => x.id),
    ["unread"],
  );
  assert.equal(disk.getItem("weave.library-seen.library"), '["old"]');
  store.markRead();
  assert.ok(store.read().entries[0].readAt);
  assert.equal(
    store.observe([update("old"), update("unread")]).added.length,
    0,
  );
});

test("tabs read the latest cursor before mutation, deleted source history remains and read/unread persists", () => {
  const disk = storage(),
    tabA = createLibraryNoticeStore("library", "me", disk),
    tabB = createLibraryNoticeStore("library", "me", disk);
  tabA.observe([]);
  tabA.observe([update("a")]);
  tabB.markRead(["a"]);
  tabA.observe([update("a"), update("b")]);
  assert.ok(tabA.read().entries.find((x) => x.id === "a").readAt);
  tabA.observe([]);
  assert.equal(tabB.read().entries.length, 2);
  tabB.markRead(["a"], false);
  assert.equal(tabA.read().entries.find((x) => x.id === "a").readAt, undefined);
});

test("only an actually submitted system notification consumes delivery; foreground/disabled/blocked/failure keep it pending", async () => {
  for (const outcome of ["foreground", "disabled", "unavailable", "failed"]) {
    const store = createLibraryNoticeStore("library", "me", storage());
    store.observe([]);
    store.observe([update("new")]);
    assert.equal(await deliverLibraryNotices(store, () => outcome), outcome);
    assert.equal(store.read().entries[0].notifiedAt, undefined);
    await deliverLibraryNotices(store, () => "submitted");
    assert.ok(store.read().entries[0].notifiedAt);
    assert.equal(
      await deliverLibraryNotices(store, () =>
        assert.fail("must not duplicate"),
      ),
      undefined,
    );
    store.markRead(["new"], false);
    assert.equal(
      await deliverLibraryNotices(store, () =>
        assert.fail("manual unread must not replay system alert"),
      ),
      undefined,
    );
  }
});

test("same-origin delivery lock serializes two tabs and avoids duplicate system alerts", async () => {
  const disk = storage(),
    a = createLibraryNoticeStore("library", "me", disk),
    b = createLibraryNoticeStore("library", "me", disk);
  a.observe([]);
  a.observe([update("new")]);
  let queue = Promise.resolve(),
    delivered = 0;
  const lock = (_key, work) => {
    const next = queue.then(work);
    queue = next;
    return next;
  };
  await Promise.all(
    [a, b].map((store) =>
      deliverLibraryNotices(
        store,
        () => {
          delivered++;
          return "submitted";
        },
        lock,
      ),
    ),
  );
  assert.equal(delivered, 1);
});

test("category batches share a stable visible count and retain separate read cursors", () => {
  const store = createLibraryNoticeStore("library", "me", storage());
  store.observe([]);
  store.observe(
    [update("a"), update("b"), update("c", "coworker", "scene")],
    "2026-10-16T02:00:05Z",
  );
  const groups = noticeGroups(store.read().entries);
  assert.equal(groups.length, 2);
  assert.equal(groups.find((x) => x.category === "character").count, 2);
  store.markRead(["a"]);
  assert.equal(
    noticeGroups(store.read().entries).find((x) => x.category === "character")
      .unread,
    true,
  );
});

test("corrupt/future state and denied storage never silently reset or report read success", () => {
  const disk = storage(),
    store = createLibraryNoticeStore("library", "me", disk);
  disk.setItem(store.key, '{"version":99}');
  assert.throws(() => store.observe([]), /不兼容/);
  assert.equal(disk.getItem(store.key), '{"version":99}');
  disk.values.delete(store.key);
  store.observe([]);
  store.observe([update("a")]);
  disk.setItem = () => {
    throw new Error("quota");
  };
  assert.throws(() => store.markRead(), /未能保存/);
  assert.equal(store.read().entries[0].readAt, undefined);
});

test("system alert click reaches the app action without granting permission or transmitting media", () => {
  let clicked = 0,
    callback;
  const env = {
    secure: true,
    supported: true,
    hidden: () => true,
    permission: () => "granted",
    request: () => assert.fail("no automatic permission"),
    send: (_title, _body, _tag, onClick) => {
      callback = onClick;
    },
  };
  sendBrowserNotification(
    {
      enabled: true,
      title: "Weave",
      body: "角色库新增 2 个素材",
      tag: "library",
      onClick: () => clicked++,
    },
    env,
  );
  callback();
  assert.equal(clicked, 1);
});

test("notification UI wires persistent groups, immediate preferences, click-through and in-app announcement", async () => {
  const source = async (p) =>
    readFile(new URL(`../src/${p}`, import.meta.url), "utf8");
  const [app, view, list, hook] = await Promise.all(
    [
      "App.tsx",
      "features/SharedLibraryView.tsx",
      "features/LibraryNotificationList.tsx",
      "features/useLibraryNotices.ts",
    ].map(source),
  );
  assert.match(app, /library-notice-toast/);
  assert.match(app, /onNotificationsChange/);
  assert.match(view, /BrowserNotificationSettings[\s\S]*immediate/);
  assert.match(list, /标为未读/);
  assert.match(list, /onRead\(update\.entryIds, update\.unread\)/);
  assert.match(list, /disabled=\{!available.length\}/);
  assert.match(hook, /addEventListener\("storage", sync\)/);
  assert.match(hook, /navigator\.locks\.request/);
});
