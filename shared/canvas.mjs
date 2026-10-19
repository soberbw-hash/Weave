import { stackMembers } from "./asset-stacks.mjs";

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const finite = (v, min = -1000000, max = 1000000) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const text = (v, max) => typeof v === "string" && v.length <= max;
const object = (v) => v && typeof v === "object" && !Array.isArray(v);
const fail = () => { throw new Error("画布记录无效或版本较新，原项目未修改"); };

export function emptyCanvas() {
  return { version: 1, id: crypto.randomUUID(), revision: 0,
    updatedAt: new Date().toISOString(), nodes: [], frames: [],
    viewport: { x: 48, y: 48, zoom: 1 } };
}

/** Validate without discarding unknown/future records or rewriting originals. */
export function validateCanvas(value, assets) {
  if (!object(value) || value.version !== 1 || !uuid.test(value.id) ||
    !Number.isSafeInteger(value.revision) || value.revision < 0 ||
    !text(value.updatedAt, 80) || !Number.isFinite(Date.parse(value.updatedAt)) ||
    !Array.isArray(value.nodes) || value.nodes.length > 3000 ||
    !Array.isArray(value.frames) || value.frames.length > 200 ||
    !object(value.viewport) || !finite(value.viewport.x) || !finite(value.viewport.y) ||
    !finite(value.viewport.zoom, 0.15, 3)) fail();
  const ids = new Set(), frameIds = new Set(), assetIds = new Set(assets.map(a => a.id));
  for (const frame of value.frames) {
    if (!object(frame) || !uuid.test(frame.id) || ids.has(frame.id) ||
      !text(frame.title, 160) || !text(frame.note, 4000) ||
      !finite(frame.x) || !finite(frame.y) || !finite(frame.width, 280, 10000) ||
      !finite(frame.height, 160, 10000) || typeof frame.collapsed !== "boolean" ||
      typeof frame.locked !== "boolean") fail();
    ids.add(frame.id); frameIds.add(frame.id);
  }
  for (const node of value.nodes) {
    if (!object(node) || !uuid.test(node.id) || ids.has(node.id) ||
      !finite(node.x) || !finite(node.y) || !finite(node.width, 100, 2000) ||
      !finite(node.height, 70, 2000) ||
      (node.mediaRatio !== undefined && !finite(node.mediaRatio, 0.01, 100)) ||
      (node.frameId !== undefined && !frameIds.has(node.frameId))) fail();
    if (node.kind === "asset") {
      if (!assetIds.has(node.assetId)) fail();
    } else if (node.kind === "note") {
      if (!text(node.text, 10000)) fail();
    } else fail();
    ids.add(node.id);
  }
  return structuredClone(value);
}

export function saveCanvas(current, proposed, assets, revision) {
  if (current) validateCanvas(current, assets);
  if (revision !== (current?.revision || 0))
    throw new Error("画布已在另一窗口更新，请重新载入；未覆盖新布局");
  const next = validateCanvas(proposed, assets);
  if (current && current.id !== next.id) fail();
  if (next.revision !== revision) fail();
  next.revision = revision + 1;
  next.updatedAt = new Date().toISOString();
  return next;
}

export function canvasAsset(node, assets) {
  if (node.kind !== "asset") return undefined;
  const original = assets.find(a => a.id === node.assetId);
  if (!original || original.trashedAt) return undefined;
  return stackMembers(original, assets)[0] || original;
}

export function canvasAssetIds(doc, nodeIds, assets) {
  return [...new Set(doc.nodes.filter(n => nodeIds.includes(n.id)).flatMap(n => {
    const asset = canvasAsset(n, assets);
    return asset ? stackMembers(asset, assets).map(a => a.id) : [];
  }))];
}

export function assetNode(asset, x, y, frameId) {
  const wide = asset.kind === "video" || asset.category === "scene" || asset.kind === "audio";
  const width = wide ? 300 : 180;
  const ratio = asset.width && asset.height ? asset.width / asset.height :
    asset.kind === "video" || asset.category === "scene" ? 16 / 9 : 1;
  return { id: crypto.randomUUID(), kind: "asset", assetId: asset.id, x, y,
    width, height: asset.kind === "audio" ? 112 : Math.max(110, width / ratio + 30),
    ...(asset.kind === "image" || asset.kind === "video" ? { mediaRatio: ratio } : {}),
    ...(frameId ? { frameId } : {}) };
}

/** Packing is explicit: never run automatically on refresh or new captures. */
export function arrangeNodes(nodes, x = 24, y = 64, columnsWidth = 900) {
  let cx = x, cy = y, row = 0;
  return nodes.map(node => {
    if (cx > x && cx + node.width > x + columnsWidth) { cx = x; cy += row + 20; row = 0; }
    const next = { ...node, x: cx, y: cy };
    cx += node.width + 20; row = Math.max(row, node.height);
    return next;
  });
}

export function moveCanvasItems(doc, nodeIds, frameIds, dx, dy, targetFrame) {
  const next = structuredClone(doc), moving = new Set(frameIds);
  for (const frame of next.frames) if (moving.has(frame.id) && !frame.locked) {
    frame.x += dx; frame.y += dy;
  }
  for (const node of next.nodes) {
    const parent = doc.frames.find(f => f.id === node.frameId);
    if (parent?.locked) continue;
    if (moving.has(node.frameId) || nodeIds.includes(node.id)) {
      node.x += dx; node.y += dy;
      if (!moving.has(node.frameId) && targetFrame !== undefined) {
        if (targetFrame) node.frameId = targetFrame; else delete node.frameId;
      }
    }
  }
  return next;
}

export function canvasForExport(doc, assetIds) {
  if (!doc) return undefined;
  const allowed = new Set(assetIds), next = structuredClone(doc);
  next.nodes = next.nodes.filter(n => n.kind !== "asset" || allowed.has(n.assetId));
  return next;
}
