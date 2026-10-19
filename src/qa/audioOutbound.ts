// Dev-only cross-origin drag experiment, not a target-site upload claim.
import {
  prepareAudioDragFile,
  writeAssetDrag,
  writeMediaFileDrag,
} from "../services/assetOutbound";
import type { Asset } from "../types";
const prepared = document.getElementById("prepared")!,
  legacy = document.getElementById("legacy")!;
const blob = await (
  await fetch("/artifacts/capture-audio-20261016/旁白验收.wav")
).blob();
const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
const asset = {
  id: "audio-outbound-qa",
  kind: "audio",
  name: "旁白验收.wav",
  mime: "audio/wav",
  size: blob.size,
  hash: Array.from(new Uint8Array(digest), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join(""),
  url: URL.createObjectURL(blob),
} as Asset;
await prepareAudioDragFile(asset);
prepared.textContent = "拖出原音频文件";
prepared.addEventListener("dragstart", (raw) => {
  const e = raw as DragEvent;
  writeAssetDrag(e.dataTransfer!, [asset]);
  writeMediaFileDrag(e.dataTransfer!, asset);
  document.getElementById("status")!.textContent = JSON.stringify({
    stage: "dragstart",
    files: e.dataTransfer!.files.length,
    types: [...e.dataTransfer!.types],
  });
});
legacy.addEventListener("dragstart", (raw) => {
  const e = raw as DragEvent;
  writeAssetDrag(e.dataTransfer!, [asset]);
  e.dataTransfer!.setData(
    "DownloadURL",
    `audio/wav:${asset.name}:${asset.url}`,
  );
});
