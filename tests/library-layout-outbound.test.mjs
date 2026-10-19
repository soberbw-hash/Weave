import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  originalTileSize,
  originalRowSpan,
} from "../src/services/libraryLayout.ts";
import {
  prepareAudioDragFile,
  writeMediaFileDrag,
  writeAssetDrag,
  MAX_AUDIO_DRAG_BYTES,
} from "../src/services/assetOutbound.ts";
function audio(name = "旁白:原片.wav", content = "original audio bytes") {
  const blob = new Blob([content], { type: "audio/wav" });
  return {
    id: randomUUID(),
    kind: "audio",
    name,
    mime: "audio/wav",
    hash: createHash("sha256").update(content).digest("hex"),
    size: blob.size,
    url: URL.createObjectURL(blob),
  };
}
function transfer(reject = false) {
  const data = new Map(),
    files = [];
  return {
    data,
    files,
    items: {
      add(file) {
        if (reject) return null;
        files.push(file);
        return { kind: "file" };
      },
    },
    setData: (k, v) => data.set(k, v),
  };
}
test("original layout gives scenes and videos width while keeping character sheets compact", () => {
  assert.equal(
    originalTileSize({ category: "character", kind: "image" }, 0.5),
    "compact",
  );
  assert.equal(
    originalTileSize({ category: "character", kind: "image" }, 2),
    "compact",
  );
  assert.equal(
    originalTileSize({ category: "scene", kind: "image" }, 0.5),
    "wide",
  );
  assert.equal(
    originalTileSize({ category: "uncategorized", kind: "video" }, 1.78),
    "wide",
  );
  assert.equal(
    originalTileSize({ category: "audio", kind: "audio" }, 1),
    "wide",
  );
  assert.equal(
    originalTileSize({ category: "other", kind: "image" }, 1.8),
    "wide",
  );
});
test("packed rows never overlap intrinsic content including caption and borders", () => {
  for (const height of [1, 96, 131.25, 184, 260, 320.7, 1024]) {
    const count = originalRowSpan(height, 1, 8),
      area = count + Math.max(0, count - 1) * 8;
    assert.ok(area >= height);
    assert.ok(area - height < 9);
  }
  assert.equal(originalRowSpan(NaN, 1, 8), 1);
});
test("personal and public original grids share resize packing and square framing stays independent", async () => {
  const read = (name) =>
    readFile(new URL("../src/" + name, import.meta.url), "utf8");
  const [css, personal, shared, hook] = await Promise.all([
    read("styles.css"),
    read("components/AssetsView.tsx"),
    read("features/SharedLibraryView.tsx"),
    read("components/useOriginalGrid.ts"),
  ]);
  assert.match(personal, /useOriginalGrid\(/);
  assert.match(shared, /useOriginalGrid\(/);
  assert.match(hook, /ResizeObserver/);
  assert.match(hook, /observer.disconnect\(\)/);
  assert.match(
    css,
    /\.layout-original\.small \.asset-card\[data-category="character"\] \.asset-picture\s*\{\s*max-height: 170px;/,
  );
  assert.match(
    css,
    /\.layout-original \.asset-card\[data-original-size="wide"\]\s*\{\s*grid-column: span 2;/,
  );
  assert.doesNotMatch(css, /columns: (155|175|210|140)px;/);
});
test("prepared audio carries one complete verified File without replacing internal IDs or adding a download string", async () => {
  const asset = audio();
  try {
    const first = prepareAudioDragFile(asset),
      second = prepareAudioDragFile(asset);
    assert.equal(first, second);
    const file = await first,
      data = transfer();
    writeAssetDrag(data, [asset]);
    assert.equal(writeMediaFileDrag(data, asset), true);
    assert.equal(data.files.length, 1);
    assert.equal(data.files[0], file);
    assert.equal(file.name, "旁白_原片.wav");
    assert.equal(file.type, "audio/wav");
    assert.equal(await file.text(), "original audio bytes");
    assert.equal(
      data.data.get("application/weave-assets"),
      JSON.stringify([asset.id]),
    );
    assert.equal(data.data.has("DownloadURL"), false);
    assert.equal(await prepareAudioDragFile(asset), file);
    const renamed = { ...asset, name: "另一名称.wav" },
      cold = transfer();
    writeMediaFileDrag(cold, renamed);
    assert.equal(cold.files.length, 0);
    assert.equal(cold.data.has("DownloadURL"), true);
  } finally {
    URL.revokeObjectURL(asset.url);
  }
});
test("invalid originals, bad hashes and oversize audio are not silently prepared or passed as image files", async () => {
  const asset = audio();
  try {
    await assert.rejects(
      prepareAudioDragFile({ ...asset, size: asset.size + 1 }),
      /大小/,
    );
    await assert.rejects(
      prepareAudioDragFile({ ...asset, hash: "0".repeat(64) }),
      /校验失败/,
    );
    await assert.rejects(
      prepareAudioDragFile({ ...asset, size: MAX_AUDIO_DRAG_BYTES + 1 }),
      /下载/,
    );
    await assert.rejects(prepareAudioDragFile({ ...asset, size: NaN }), /下载/);
    await assert.rejects(
      prepareAudioDragFile({ ...asset, kind: "image" }),
      /下载/,
    );
    const image = transfer();
    assert.equal(writeMediaFileDrag(image, { ...asset, kind: "image" }), false);
    assert.equal(image.files.length, 0);
    assert.equal(
      writeMediaFileDrag(transfer(), { ...asset, trashedAt: "yesterday" }),
      false,
    );
  } finally {
    URL.revokeObjectURL(asset.url);
  }
});
test("unavailable data stores retain a truthful fallback and LRU eviction never changes source bytes", async () => {
  const assets = Array.from({ length: 10 }, (_, i) =>
    audio(`音频${i}.wav`, `bytes ${i}`),
  );
  try {
    for (const asset of assets) await prepareAudioDragFile(asset);
    const evicted = transfer();
    writeMediaFileDrag(evicted, assets[0]);
    assert.equal(evicted.files.length, 0);
    const current = transfer(true);
    assert.equal(writeMediaFileDrag(current, assets.at(-1)), true);
    assert.ok(current.data.has("DownloadURL"));
    assert.equal(current.files.length, 0);
    assert.equal(await (await fetch(assets[0].url)).text(), "bytes 0");
  } finally {
    assets.forEach((asset) => URL.revokeObjectURL(asset.url));
  }
});
