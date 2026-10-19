import type { Asset } from "../types";

type DragAsset = Pick<Asset, "id" | "name" | "url" | "mime" | "size" | "hash">;

export function outboundFileName(name: string) {
  return (
    name
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/[. ]+$/, "")
      .slice(0, 200) || "素材"
  );
}

async function originalFile(asset: DragAsset): Promise<File> {
  if (!asset.url) throw new Error("原文件不可用，请重新打开项目。");
  const response = await fetch(asset.url);
  if (!response.ok) throw new Error("无法读取原文件，请重新打开项目。");
  const blob = await response.blob();
  if (blob.size !== asset.size)
    throw new Error("原文件大小与记录不一致，请保留工程并检查文件。");
  return new File([blob], outboundFileName(asset.name), {
    type: asset.mime || blob.type,
  });
}

export const MAX_AUDIO_DRAG_BYTES = 32 * 1024 * 1024;
const audioFiles = new Map<string, File>();
const pendingAudio = new Map<string, Promise<File>>();
let reservedAudioBytes = 0;
const audioKey = (asset: DragAsset) =>
  JSON.stringify([
    asset.id,
    asset.hash,
    asset.size,
    asset.url,
    asset.name,
    asset.mime,
  ]);

/** Prepare before dragstart: its data store stops being writable after the handler. */
export function prepareAudioDragFile(asset: Asset): Promise<File> {
  if (
    asset.kind !== "audio" ||
    asset.trashedAt ||
    !asset.url ||
    !Number.isSafeInteger(asset.size) ||
    asset.size <= 0 ||
    asset.size > MAX_AUDIO_DRAG_BYTES
  )
    return Promise.reject(new Error("请下载原音频后上传"));
  const key = audioKey(asset),
    saved = audioFiles.get(key);
  if (saved) {
    audioFiles.delete(key);
    audioFiles.set(key, saved);
    return Promise.resolve(saved);
  }
  const pending = pendingAudio.get(key);
  if (pending) return pending;
  if (pendingAudio.size >= 2)
    return Promise.reject(new Error("正在准备其他音频，请稍后重试"));
  const budget = 64 * 1024 * 1024;
  const bytesUsed = () =>
    [...audioFiles.values()].reduce((sum, file) => sum + file.size, 0);
  while (
    audioFiles.size &&
    (audioFiles.size >= 8 ||
      bytesUsed() + reservedAudioBytes + asset.size > budget)
  )
    audioFiles.delete(audioFiles.keys().next().value!);
  reservedAudioBytes += asset.size;
  const promise = originalFile(asset)
    .then(async (file) => {
      if (/^[a-f0-9]{64}$/i.test(asset.hash)) {
        const digest = await crypto.subtle.digest(
          "SHA-256",
          await file.arrayBuffer(),
        );
        const hash = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
        if (hash !== asset.hash.toLowerCase())
          throw new Error("原音频校验失败，请保留工程并下载检查");
      }
      while (audioFiles.size >= 8)
        audioFiles.delete(audioFiles.keys().next().value!);
      audioFiles.set(key, file);
      return file;
    })
    .finally(() => {
      reservedAudioBytes -= asset.size;
      pendingAudio.delete(key);
    });
  pendingAudio.set(key, promise);
  return promise;
}

type MediaDragAsset = Pick<Asset, "kind" | "url" | "name" | "mime"> &
  Partial<Pick<Asset, "id" | "hash" | "size" | "trashedAt">>;
function preparedAudio(asset: MediaDragAsset) {
  return asset.kind === "audio" &&
    !asset.trashedAt &&
    asset.id &&
    asset.hash &&
    asset.size
    ? audioFiles.get(audioKey(asset as DragAsset))
    : undefined;
}

export function writeAssetDrag(transfer: DataTransfer, assets: DragAsset[]) {
  // Only add our internal IDs. Do not clear native image data or replace it
  // with new File(...) / DownloadURL. Chrome's cross-renderer handling of
  // constructed Files differs from native <img> drags, even between two tabs.
  transfer.setData(
    "application/weave-assets",
    JSON.stringify(assets.map((asset) => asset.id)),
  );
  transfer.effectAllowed = "copyMove";
}

export function downloadOriginal(asset: DragAsset) {
  if (!asset.url) throw new Error("原文件不可用，请重新打开项目。");
  const link = document.createElement("a");
  link.href = asset.url;
  link.download = outboundFileName(asset.name);
  document.body.append(link);
  link.click();
  link.remove();
}

/** Chromium's non-standard drag-download path; only for a single top video.
 * Unlike native file paths, target applications may not accept this promise.
 * Never apply it to image drags or claim delivery from dragstart/dragend.
 */
export function writeVideoFileDrag(
  transfer: DataTransfer,
  asset: Pick<Asset, "kind" | "url" | "name" | "mime">,
) {
  return asset.kind === "video" && writeMediaFileDrag(transfer, asset);
}

/** A prepared audio File first; DownloadURL only falls back for unprepared media.
 * A constructed File is not an OS file bridge; cross-renderer target acceptance must be tested. */
export function writeMediaFileDrag(
  transfer: DataTransfer,
  asset: MediaDragAsset,
) {
  if (
    (asset.kind !== "video" && asset.kind !== "audio") ||
    asset.trashedAt ||
    !asset.url ||
    !/^(blob:|https?:)/i.test(asset.url)
  )
    return false;
  const audio = preparedAudio(asset);
  if (audio) {
    try {
      if (transfer.items?.add(audio)) {
        transfer.effectAllowed = "copyMove";
        return true;
      }
    } catch {
      /* A restricted data store retains the download fallback. */
    }
  }
  transfer.setData(
    "DownloadURL",
    `${asset.mime || (asset.kind === "audio" ? "application/octet-stream" : "video/mp4")}:${outboundFileName(asset.name)}:${asset.url}`,
  );
  transfer.effectAllowed = "copyMove";
  return true;
}

async function pngForClipboard(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("请选择一张图片");
  if (file.type === "image/png") return file;
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40_000_000)
      throw new Error("图片过大，请使用下载原文件上传。");
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法准备剪贴板图像，请下载原文件。");
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("无法转换剪贴板图像")),
        "image/png",
      ),
    );
  } finally {
    bitmap.close();
  }
}

export function copyAssetImage(asset: Asset) {
  if (asset.kind !== "image")
    throw new Error("仅图片支持复制；视频请下载原文件上传。");
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
    throw new Error("当前环境不支持复制图片，请下载原文件后上传。");
  const image = originalFile(asset).then(pngForClipboard);
  void image.catch(() => {});
  // Start writing inside the click, before fetching/encoding yields user activation.
  return navigator.clipboard.write([new ClipboardItem({ "image/png": image })]);
}
