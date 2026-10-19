import type { Asset } from "../types";

export function originalTileSize(
  asset: Pick<Asset, "category" | "kind">,
  ratio: number,
) {
  if (asset.kind === "video") return ratio > 1.2 ? "wide" : "compact";
  if (asset.kind === "audio" || asset.category === "scene")
    return "wide";
  if (asset.category === "character") return "compact";
  return ratio > 1.2 ? "wide" : "compact";
}

export function originalRowSpan(height: number, row: number, gap: number) {
  if (!Number.isFinite(height) || height <= 0) return 1;
  return Math.max(1, Math.ceil((height + gap) / (row + gap)));
}
