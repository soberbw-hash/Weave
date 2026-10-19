import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import "fake-indexeddb/auto";
import {
  applyStackEdit,
  stackMembers,
  expandStackIds,
  groupAssets,
  validateAssetStacks,
  syncStackLinks,
} from "../shared/asset-stacks.mjs";
import { applyEditing } from "../shared/editing.mjs";
import {
  browserInvoke,
  browserProjectData,
} from "../src/services/browserRepository.ts";
import {
  buildBackup,
  parseProjectArchive,
} from "../src/services/projectArchive.ts";
import {
  writeVideoFileDrag,
  writeAssetDrag,
} from "../src/services/assetOutbound.ts";
import { importFileName, splitFileName } from "../src/services/importNames.ts";
const nativeChannel = globalThis.BroadcastChannel;
globalThis.BroadcastChannel = undefined;
after(() => {
  globalThis.BroadcastChannel = nativeChannel;
});
const revisions = (assets) =>
  Object.fromEntries(assets.map((asset) => [asset.id, asset.revision]));
function asset(name, date = "2026-10-16T00:00:00.000Z") {
  return {
    id: randomUUID(),
    name,
    kind: "video",
    category: "video",
    status: "candidate",
    hash: "a".repeat(64),
    relativePath: `media/${randomUUID()}.mp4`,
    size: 16,
    mime: "video/mp4",
    revision: 1,
    createdAt: date,
    updatedAt: date,
    tags: [],
    prompt: "",
    source: "test",
  };
}
function movie(value) {
  const bytes = new Uint8Array([
    0,
    0,
    0,
    24,
    102,
    116,
    121,
    112,
    105,
    115,
    111,
    109,
    0,
    0,
    0,
    value,
  ]);
  return new Blob([bytes], { type: "video/mp4" });
}
test("stack merge keeps bytes/identity, latest first and one deliberate final pinned", () => {
  const inputs = [asset("旧.mp4"), asset("新.mp4", "2026-10-16T00:00:01.000Z")];
  const merged = applyStackEdit(
    inputs,
    { type: "merge", id: inputs[0].id, assetIds: [inputs[1].id] },
    revisions(inputs),
  ).assets;
  assert.equal(groupAssets(merged).length, 1);
  assert.equal(stackMembers(merged[0], merged)[0].id, inputs[1].id);
  assert.deepEqual(
    merged.map((asset) => [asset.id, asset.hash, asset.name]),
    inputs.map((asset) => [asset.id, asset.hash, asset.name]),
  );
  const pinned = applyStackEdit(
    merged,
    { type: "final", id: inputs[0].id },
    revisions(merged),
  ).assets;
  assert.equal(stackMembers(pinned[0], pinned)[0].id, inputs[0].id);
  const changed = applyStackEdit(
    pinned,
    { type: "final", id: inputs[1].id },
    revisions(pinned),
  ).assets;
  assert.equal(changed.filter((asset) => asset.status === "final").length, 1);
  assert.throws(
    () =>
      applyStackEdit(
        changed,
        { type: "detach", id: changed[0].id },
        revisions(merged),
      ),
    /已有变化/,
  );
  const detached = applyStackEdit(
    changed,
    { type: "detach", id: changed[0].id },
    revisions(changed),
  ).assets;
  assert.equal(groupAssets(detached).length, 2);
  assert.equal(detached[0].stackId, undefined);
  assert.equal(detached[0].stackOrder, undefined);
});
test("same-millisecond versions have stable persisted ordering and reject malformed or mixed stacks", () => {
  const inputs = [asset("1.mp4"), asset("2.mp4"), asset("3.mp4")];
  const merged = applyStackEdit(
    inputs,
    {
      type: "merge",
      id: inputs[0].id,
      assetIds: inputs.slice(1).map((asset) => asset.id),
    },
    revisions(inputs),
  ).assets;
  assert.equal(
    stackMembers(merged[0], [...merged].reverse())[0].id,
    inputs[2].id,
  );
  assert.equal(expandStackIds([merged[0].id], merged).length, 3);
  assert.throws(
    () => validateAssetStacks([{ ...merged[0], stackId: "bad" }]),
    /记录无效/,
  );
  assert.throws(
    () =>
      applyStackEdit(
        [inputs[0], { ...inputs[1], kind: "image" }],
        { type: "merge", id: inputs[0].id, assetIds: [inputs[1].id] },
        revisions(inputs),
      ),
    /只能堆叠/,
  );
});
test("paragraph links travel as a group, follow later additions and preserve paragraph primary", () => {
  const inputs = [asset("1.mp4"), asset("2.mp4")];
  const merged = applyStackEdit(
    inputs,
    { type: "merge", id: inputs[0].id, assetIds: [inputs[1].id] },
    revisions(inputs),
  ).assets;
  let doc = applyEditing(
    undefined,
    { type: "import", text: "文字", mode: "blank" },
    merged,
    [],
    0,
  );
  doc = applyEditing(
    doc,
    { type: "link", id: doc.paragraphs[0].id, assetIds: [merged[0].id] },
    merged,
    [],
    doc.revision,
  );
  assert.equal(doc.paragraphs[0].links.length, 2);
  doc = applyEditing(
    doc,
    { type: "primary", id: doc.paragraphs[0].id, assetId: merged[0].id },
    merged,
    [],
    doc.revision,
  );
  const third = asset("3.mp4", "2026-10-16T00:00:02.000Z"),
    next = [...merged, third];
  const all = applyStackEdit(
    next,
    { type: "merge", id: merged[0].id, assetIds: [third.id] },
    revisions(next),
  ).assets;
  doc = syncStackLinks(doc, all);
  assert.equal(doc.paragraphs[0].links.length, 3);
  assert.equal(
    doc.paragraphs[0].links.find((link) => link.role === "primary").assetId,
    merged[0].id,
  );
  doc = applyEditing(
    doc,
    { type: "unlink", id: doc.paragraphs[0].id, assetId: third.id },
    all,
    [],
    doc.revision,
  );
  assert.equal(doc.paragraphs[0].links.length, 0);
  assert.equal(syncStackLinks(doc, all).paragraphs[0].links.length, 0);
});
test("browser direct video drop stacks atomically, rejects stale/mixed imports, and backups preserve versions", async () => {
  const project = await browserInvoke("createProject", {
    name: "堆叠协议验证",
  });
  await browserInvoke("importFiles", {
    projectId: project.id,
    files: [{ name: "1.mp4", blob: movie(1) }],
    category: "video",
  });
  let data = await browserProjectData(project.id),
    first = data.record.assets[0];
  await browserInvoke("importFiles", {
    projectId: project.id,
    files: [{ name: "2.mp4", blob: movie(2) }],
    stackTargetId: first.id,
    revisions: revisions(data.record.assets),
  });
  data = await browserProjectData(project.id);
  assert.equal(groupAssets(data.record.assets).length, 1);
  const before = data.record.assets.map((asset) => asset.id);
  await assert.rejects(
    browserInvoke("importFiles", {
      projectId: project.id,
      files: [{ name: "3.mp4", blob: movie(3) }],
      stackTargetId: first.id,
      revisions: { [first.id]: 1 },
    }),
    /已有变化/,
  );
  await assert.rejects(
    browserInvoke("importFiles", {
      projectId: project.id,
      files: [{ name: "note.txt", blob: new Blob(["text"]) }],
      stackTargetId: first.id,
      revisions: revisions(data.record.assets),
    }),
    /混合文件/,
  );
  assert.deepEqual(
    (await browserProjectData(project.id)).record.assets.map(
      (asset) => asset.id,
    ),
    before,
  );
  const restored = await parseProjectArchive(
    await buildBackup(data.record, data.media),
  );
  assert.deepEqual(
    restored.record.assets.map((asset) => [
      asset.stackId,
      asset.stackOrder,
      asset.hash,
    ]),
    data.record.assets.map((asset) => [
      asset.stackId,
      asset.stackOrder,
      asset.hash,
    ]),
  );
});
test("browser final changes normalize old finals and restoring a former final does not replace the current final", async () => {
  const project = await browserInvoke("createProject", { name: "最终稿恢复" });
  await browserInvoke("importFiles", {
    projectId: project.id,
    files: [
      { name: "1.mp4", blob: movie(5) },
      { name: "2.mp4", blob: movie(6) },
    ],
  });
  let data = await browserProjectData(project.id);
  const [a, b] = data.record.assets;
  await browserInvoke("editAssetStack", {
    projectId: project.id,
    action: { type: "merge", id: a.id, assetIds: [b.id] },
    revisions: revisions(data.record.assets),
  });
  data = await browserProjectData(project.id);
  await browserInvoke("updateAssets", {
    projectId: project.id,
    ids: [a.id],
    patch: { status: "final" },
    revisions: revisions(data.record.assets),
  });
  data = await browserProjectData(project.id);
  await browserInvoke("trashAssets", {
    projectId: project.id,
    ids: [a.id],
    revisions: revisions(data.record.assets),
  });
  data = await browserProjectData(project.id);
  await browserInvoke("editAssetStack", {
    projectId: project.id,
    action: { type: "final", id: b.id },
    revisions: revisions(data.record.assets),
  });
  data = await browserProjectData(project.id);
  await browserInvoke("restoreAssets", {
    projectId: project.id,
    ids: [a.id],
    revisions: revisions(data.record.assets),
  });
  data = await browserProjectData(project.id);
  assert.deepEqual(
    data.record.assets
      .filter((asset) => asset.status === "final")
      .map((asset) => asset.id),
    [b.id],
  );
});
test("video outward payload contains only one top file and preserves internal group IDs; image path untouched", () => {
  const files = new Map(),
    transfer = { setData: (type, value) => files.set(type, value) };
  writeAssetDrag(transfer, [{ id: "a" }, { id: "b" }]);
  const a = {
    kind: "video",
    name: "最终稿:名称.mp4",
    mime: "video/mp4",
    url: "blob:http://localhost/id",
  };
  assert.equal(writeVideoFileDrag(transfer, a), true);
  assert.equal(
    files.get("DownloadURL"),
    "video/mp4:最终稿_名称.mp4:blob:http://localhost/id",
  );
  assert.deepEqual(JSON.parse(files.get("application/weave-assets")), [
    "a",
    "b",
  ]);
  assert.equal(writeVideoFileDrag(transfer, { ...a, kind: "image" }), false);
  assert.equal(
    writeVideoFileDrag(transfer, { ...a, url: "file:///secret" }),
    false,
  );
});
test("import naming keeps extensions and rejects Windows-invalid names without modifying source bytes", async () => {
  assert.deepEqual(splitFileName("角色.final.PNG"), {
    stem: "角色.final",
    extension: ".PNG",
  });
  assert.equal(importFileName(" 新名字 ", "角色.PNG"), "新名字.PNG");
  for (const name of ["", "../逃逸", "CON", "COM1", "带:冒号", "尾部."])
    assert.throws(() => importFileName(name, "原图.png"));
  const source = new File(["original bytes"], "source.png", {
    type: "image/png",
  });
  const renamed = new File([source], importFileName("renamed", source.name), {
    type: source.type,
  });
  assert.equal(await source.text(), await renamed.text());
  assert.equal(source.name, "source.png");
});
test("quiet reference UI and quick preview retain accessible completion and rename gates", async () => {
  const read = (name) =>
    readFile(new URL(`../src/${name}`, import.meta.url), "utf8");
  const [quick, card, reference, app] = await Promise.all([
    read("features/QuickPreview.tsx"),
    read("features/editing/ParagraphCard.tsx"),
    read("features/editing/ReferenceMedia.tsx"),
    read("App.tsx"),
  ]);
  assert.match(quick, /event\.code !== "Space"/);
  assert.match(quick, /stopImmediatePropagation/);
  assert.match(quick, /input,textarea,select/);
  assert.match(reference, /data-preview-asset/);
  assert.doesNotMatch(reference, /<video\s+controls/);
  assert.match(card, /标记完成/);
  assert.doesNotMatch(
    card,
    /标记所选完成|清除文字标记|MarkedText|type: "mark"/,
  );
  assert.match(
    card,
    /<button onClick=\{\(\) => setNotes\(true\)\}>批注<\/button>/,
  );
  assert.match(app, /aria-label="导入时命名"/);
  assert.match(app, /importNaming\.prepare\(accepted\)/);
});
