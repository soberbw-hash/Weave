import test from "node:test";
import assert from "node:assert/strict";
import { assetNode, emptyCanvas, validateCanvas } from "../shared/canvas.mjs";

function asset(kind, width, height) {
  return { id: crypto.randomUUID(), kind, category: kind === "video" ? "video" : "character", width, height };
}

test("canvas media nodes follow portrait and landscape source ratios", () => {
  const portrait = assetNode(asset("video", 1080, 1920), 0, 0);
  const landscape = assetNode(asset("video", 1920, 1080), 0, 0);
  assert.equal(portrait.width, 300);
  assert.ok(portrait.height > 500);
  assert.ok(Math.abs((portrait.width / (portrait.height - 30)) - (9 / 16)) < 0.01);
  assert.ok(Math.abs((landscape.width / (landscape.height - 30)) - (16 / 9)) < 0.01);
});

test("canvas schema accepts stored intrinsic ratios for later media measurement", () => {
  const source = asset("video", 1080, 1920);
  const board = emptyCanvas();
  board.nodes = [assetNode(source, 20, 30)];
  assert.equal(validateCanvas(board, [source]).nodes[0].mediaRatio, 1080 / 1920);
});
