import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  writeAssetDrag,
  outboundFileName,
  copyAssetImage,
  downloadOriginal,
} from "../src/services/assetOutbound.ts";

function fixture(name = "角色原图.png", mime = "image/png") {
  const bytes = new Uint8Array([137, 80, 78, 71, 11, 22, 33, 44]);
  const blob = new Blob([bytes], { type: mime });
  const asset = {
    id: randomUUID(),
    name,
    mime,
    kind: "image",
    size: blob.size,
    hash: createHash("sha256").update(bytes).digest("hex"),
    url: URL.createObjectURL(blob),
  };
  return { asset, bytes };
}

test("image context menu copies the right-clicked asset directly and closes the menu", async () => {
  const source = await readFile(
    new URL("../src/components/AssetsView.tsx", import.meta.url),
    "utf8",
  );
  const copyMenu = source.match(
    /!trash && menu\.asset\.kind === "image" && \(([\s\S]*?)<\/button>/,
  )?.[1];
  assert.ok(copyMenu);
  assert.match(copyMenu, /role="menuitem"/);
  assert.match(copyMenu, /props\.onCopy\(menu\.asset\)/);
  assert.match(copyMenu, /setMenu\(undefined\)/);
  assert.match(copyMenu, /复制图片/);
});

test("image hover copy is wired to its own asset without selection or preview side effects", async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
  const [thumb, view, css] = await Promise.all([
    read("../src/components/AssetThumb.tsx"),
    read("../src/components/AssetsView.tsx"),
    read("../src/styles.css"),
  ]);
  const button = thumb.match(
    /canPreview && asset.kind === "image" && \([\s\S]*?className="copy-button"([\s\S]*?)<\/button>/,
  )?.[1];
  assert.ok(button);
  assert.match(button, /aria-label=\{`复制图片 \$\{asset.name\}`\}/);
  assert.match(button, /disabled=\{copyDisabled\}/);
  assert.match(button, /onPointerDown=\{\(e\) => e.stopPropagation\(\)\}/);
  assert.match(button, /onDoubleClick=\{\(e\) => e.stopPropagation\(\)\}/);
  assert.match(
    button,
    /onClick=\{\(e\) => \{\s*e.stopPropagation\(\);\s*onCopy\(asset\);/,
  );
  assert.doesNotMatch(button, /onSelect\(|onPreview\(|onToggle\(/);
  assert.match(view, /onCopy=\{props.onCopy\}/);
  assert.match(view, /copyDisabled=\{busy\}/);
  assert.match(
    css,
    /\.copy-button\s*\{[^}]*top: 8px;[^}]*right: 8px;[^}]*opacity: 0;[^}]*pointer-events: none;/,
  );
  assert.match(
    css,
    /\.asset-card:hover \.copy-button,\s*\.asset-card:focus-within \.copy-button\s*\{[^}]*opacity: 1/,
  );
  assert.doesNotMatch(thumb, /final-pill|has-final/);
});

test("video cards keep a quiet bottom-right type label without final badges or overlapping preview controls", async () => {
  const [thumb, css] = await Promise.all([
    readFile(
      new URL("../src/components/AssetThumb.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(thumb, /最终稿|final-pill|has-final/);
  assert.match(thumb, /data-kind=\{asset.kind\}/);
  assert.match(thumb, /className="type-pill video-type-pill"/);
  assert.match(
    css,
    /\.video-type-pill\s*\{[^}]*bottom: 8px;[^}]*left: auto;[^}]*right: 8px;/,
  );
  assert.match(
    css,
    /\.asset-card\[data-kind="video"\] \.preview-button\s*\{[^}]*top: 50%;[^}]*left: 50%;/,
  );
  assert.doesNotMatch(css, /final-pill|has-final/);
  assert.match(
    css,
    /\.asset-card\[data-kind="video"\]\.names-hover \.asset-caption\s*\{[^}]*padding: 23px 12px 44px;/,
  );
});

test("drag augmentation preserves browser-native image data without clearing or adding constructed Files", () => {
  const { asset, bytes } = fixture();
  const nativeFile = new File([bytes], "native-image.png", {
    type: "image/png",
  });
  const strings = new Map([
    ["text/uri-list", asset.url],
    ["text/html", "native image markup"],
  ]);
  const data = {
    files: [nativeFile],
    setData(type, value) {
      strings.set(type, value);
    },
    clearData() {
      throw new Error("Must not clear native drag payload");
    },
    get items() {
      throw new Error("Must not mutate native files");
    },
  };
  try {
    assert.equal(writeAssetDrag(data, [asset]), undefined);
    assert.equal(data.files[0], nativeFile);
    assert.equal(data.files.length, 1);
    assert.equal(strings.get("text/uri-list"), asset.url);
    assert.equal(strings.get("text/html"), "native image markup");
    assert.deepEqual(JSON.parse(strings.get("application/weave-assets")), [
      asset.id,
    ]);
    assert.equal(strings.has("DownloadURL"), false);
  } finally {
    URL.revokeObjectURL(asset.url);
  }
});

test("internal multi-selection adds all IDs without pretending to create external multi-file drag", () => {
  const strings = new Map();
  const data = {
    setData(type, value) {
      strings.set(type, value);
    },
  };
  assert.equal(writeAssetDrag(data, [{ id: "a" }, { id: "b" }]), undefined);
  assert.deepEqual(JSON.parse(strings.get("application/weave-assets")), [
    "a",
    "b",
  ]);
  assert.equal(data.effectAllowed, "copyMove");
  assert.equal(strings.size, 1);
});

test("real image hit-testing and native dragging are enabled; upload UI has no simulated file-drag button", async () => {
  const read = (file) =>
    readFile(new URL("../src/" + file, import.meta.url), "utf8");
  const [thumb, css, dialog] = await Promise.all([
    read("components/AssetThumb.tsx"),
    read("styles.css"),
    read("features/AssetOutboundDialog.tsx"),
  ]);
  const image = thumb.match(/<img\s[\s\S]*?\/>/)?.[0];
  assert.ok(image);
  assert.match(image, /draggable=\{canPreview\}/);
  assert.match(css, /\.asset-picture img\s*\{[^}]*pointer-events: auto/);
  assert.ok(!dialog.includes("准备拖出"));
  assert.ok(!dialog.includes("已准备文件"));
  assert.ok(dialog.includes("直接按住图片本身"));
});

test("original download names do not contain filesystem path separators", () => {
  assert.equal(
    outboundFileName("角色:正面/测试\\a.png"),
    "角色_正面_测试_a.png",
  );
  assert.equal(outboundFileName("..."), "素材");
});

test("copy starts inside the click, writes PNG bytes and never requests clipboard read permission", async () => {
  const { asset, bytes } = fixture();
  const oldItem = globalThis.ClipboardItem;
  const oldClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  let called = false,
    contents;
  globalThis.ClipboardItem = class {
    constructor(value) {
      this.value = value;
    }
  };
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      write: async (items) => {
        called = true;
        contents = items[0].value;
      },
    },
  });
  try {
    const copying = copyAssetImage(asset);
    assert.equal(called, true);
    await copying;
    assert.deepEqual(
      new Uint8Array(await (await contents["image/png"]).arrayBuffer()),
      bytes,
    );
    assert.deepEqual(Object.keys(contents), ["image/png"]);
  } finally {
    URL.revokeObjectURL(asset.url);
    if (oldItem === undefined) delete globalThis.ClipboardItem;
    else globalThis.ClipboardItem = oldItem;
    if (oldClipboard)
      Object.defineProperty(navigator, "clipboard", oldClipboard);
    else delete navigator.clipboard;
  }
});

test("original download uses original URL and filename, not a cropped thumbnail or project ZIP", () => {
  const { asset } = fixture();
  const previous = globalThis.document;
  let clicked = false,
    removed = false;
  const link = {
    click() {
      clicked = true;
    },
    remove() {
      removed = true;
    },
  };
  globalThis.document = { createElement: () => link, body: { append() {} } };
  try {
    downloadOriginal(asset);
    assert.equal(link.href, asset.url);
    assert.equal(link.download, asset.name);
    assert.ok(clicked && removed);
  } finally {
    globalThis.document = previous;
    URL.revokeObjectURL(asset.url);
  }
});

test("non-PNG clipboard conversion keeps full source dimensions instead of square gallery framing", async () => {
  const { asset } = fixture("角色.jpg", "image/jpeg");
  const previous = {
    item: globalThis.ClipboardItem,
    bitmap: globalThis.createImageBitmap,
    document: globalThis.document,
  };
  const oldClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  let contents,
    closed = false;
  const bitmap = {
    width: 800,
    height: 1200,
    close() {
      closed = true;
    },
  };
  const canvas = {
    getContext: () => ({
      drawImage(...args) {
        assert.deepEqual(args, [bitmap, 0, 0]);
      },
    }),
    toBlob(callback, type) {
      assert.equal(type, "image/png");
      callback(new Blob(["PNG pixels"], { type }));
    },
  };
  globalThis.createImageBitmap = async () => bitmap;
  globalThis.document = { createElement: () => canvas };
  globalThis.ClipboardItem = class {
    constructor(value) {
      this.value = value;
    }
  };
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      write: async (items) => {
        contents = items[0].value;
      },
    },
  });
  try {
    await copyAssetImage(asset);
    assert.equal((await contents["image/png"]).type, "image/png");
    assert.equal(canvas.width, 800);
    assert.equal(canvas.height, 1200);
    assert.equal(closed, true);
  } finally {
    for (const [key, value] of [
      ["ClipboardItem", previous.item],
      ["createImageBitmap", previous.bitmap],
      ["document", previous.document],
    ]) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
    if (oldClipboard)
      Object.defineProperty(navigator, "clipboard", oldClipboard);
    else delete navigator.clipboard;
    URL.revokeObjectURL(asset.url);
  }
});
