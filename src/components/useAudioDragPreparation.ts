import { useEffect, useRef } from "react";
import type { Asset } from "../types";
import { prepareAudioDragFile } from "../services/assetOutbound";

/** Only warm visible audio. The shared bounded cache deduplicates concurrent requests. */
export function useAudioDragPreparation(asset: Asset) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (asset.kind !== "audio" || !ref.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        void prepareAudioDragFile(asset).catch(() => {});
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [
    asset.id,
    asset.kind,
    asset.hash,
    asset.size,
    asset.url,
    asset.name,
    asset.mime,
    asset.trashedAt,
  ]);
  return ref;
}
