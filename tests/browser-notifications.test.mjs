import test from "node:test";
import assert from "node:assert/strict";
import {
  browserNotificationStatus,
  requestBrowserNotifications,
  sendBrowserNotification,
  notifyBrowserTask,
} from "../src/services/browserNotifications.ts";

function setup(patch = {}) {
  const calls = [];
  const env = {
    secure: true,
    supported: true,
    permission: () => "granted",
    request: async () => {
      calls.push("permission");
      return "granted";
    },
    hidden: () => true,
    send: (...args) => calls.push(args),
    ...patch,
  };
  return { env, calls };
}
const message = { enabled: true, title: "Weave", body: "test", tag: "test" };

test("reading notification status never requests permission", () => {
  for (const permission of ["default", "granted", "denied"]) {
    const { env, calls } = setup({ permission: () => permission });
    assert.equal(browserNotificationStatus(env), permission);
    assert.deepEqual(calls, []);
  }
});
test("unsupported and insecure origins never prompt or send", async () => {
  for (const [patch, status] of [
    [{ secure: false }, "insecure"],
    [{ supported: false }, "unsupported"],
  ]) {
    const { env, calls } = setup(patch);
    assert.equal(await requestBrowserNotifications(env), status);
    assert.equal(sendBrowserNotification(message, env), "unavailable");
    assert.deepEqual(calls, []);
  }
});
test("explicit request invokes native prompt synchronously before yielding", async () => {
  const { env, calls } = setup({ permission: () => "default" });
  const pending = requestBrowserNotifications(env);
  assert.deepEqual(calls, ["permission"]);
  assert.equal(await pending, "granted");
});
test("denied or already granted permissions are not requested again", async () => {
  for (const permission of ["denied", "granted"]) {
    const { env, calls } = setup({ permission: () => permission });
    assert.equal(await requestBrowserNotifications(env), permission);
    assert.deepEqual(calls, []);
  }
});
test("foreground completion stays silent while explicit test can submit", () => {
  const { env, calls } = setup({ hidden: () => false });
  assert.equal(sendBrowserNotification(message, env), "foreground");
  assert.equal(
    sendBrowserNotification({ ...message, test: true }, env),
    "submitted",
  );
  assert.equal(calls.length, 1);
});
test("disabled and revoked notifications stay silent without prompting", () => {
  const { env, calls } = setup();
  assert.equal(
    sendBrowserNotification({ ...message, enabled: false }, env),
    "disabled",
  );
  env.permission = () => "denied";
  assert.equal(sendBrowserNotification(message, env), "unavailable");
  assert.deepEqual(calls, []);
});
test("system submission failures never fail a successful project operation", () => {
  const { env } = setup({
    send: () => {
      throw new Error("Policy blocked");
    },
  });
  assert.equal(
    notifyBrowserTask("importFiles", {}, true, false, env),
    "failed",
  );
});
test("only import and export results notify; canceled actions and ordinary edits stay silent", () => {
  const { env, calls } = setup();
  for (const method of [
    "bootstrap",
    "saveSettings",
    "trashAssets",
    "updateAssets",
    "createShot",
  ]) {
    assert.equal(notifyBrowserTask(method, {}, true, false, env), undefined);
  }
  notifyBrowserTask("exportProject", { canceled: true }, true, false, env);
  assert.equal(calls.length, 0);
  notifyBrowserTask("importFiles", {}, true, false, env);
  notifyBrowserTask("exportProject", {}, true, false, env);
  notifyBrowserTask("exportProject", undefined, true, true, env);
  assert.equal(calls.length, 3);
  assert.match(calls[1][1], /请求浏览器下载/);
  assert.match(calls[2][0], /未完成/);
  assert.equal(calls[1][2], calls[2][2]);
});
