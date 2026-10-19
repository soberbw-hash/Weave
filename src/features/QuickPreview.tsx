import { useEffect, useRef, useState } from "react";
import { X, Info, DownloadSimple } from "@phosphor-icons/react";
import type { Asset } from "../types";
import { downloadOriginal } from "../services/assetOutbound";

export function useQuickPreview(assets: Asset[]) {
  const [id, setId] = useState("");
  const latest = useRef(assets),
    hovered = useRef("");
  latest.current = assets;
  const active = useRef(id);
  active.current = id;
  useEffect(() => {
    const hover = (event: PointerEvent) => {
      const target =
        event.type === "pointerout" ? event.relatedTarget : event.target;
      hovered.current =
        (target as Element | null)?.closest?.<HTMLElement>(
          "[data-preview-asset]",
        )?.dataset.previewAsset || "";
    };
    const key = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== "Escape") return;
      if (active.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.repeat) setId("");
        return;
      }
      if (
        event.key === "Escape" ||
        event.repeat ||
        (event.target as Element).closest?.(
          'input,textarea,select,[contenteditable="true"]',
        )
      )
        return;
      const asset = latest.current.find(
        (asset) => asset.id === hovered.current && !asset.trashedAt,
      );
      if (!asset || asset.kind === "document") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setId(asset.id);
    };
    document.addEventListener("pointerover", hover);
    document.addEventListener("pointerout", hover);
    window.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerover", hover);
      document.removeEventListener("pointerout", hover);
      window.removeEventListener("keydown", key, true);
    };
  }, []);
  return {
    asset: assets.find((asset) => asset.id === id && !asset.trashedAt),
    open: (asset: Asset) => setId(asset.id),
    close: () => setId(""),
  };
}
export function QuickPreview({
  asset,
  onClose,
  onDetails,
}: {
  asset: Asset;
  onClose: () => void;
  onDetails: () => void;
}) {
  const [error, setError] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="quick-preview"
      aria-label={`快速预览 ${asset.name}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="quick-preview-panel">
        <header>
          <strong>{asset.name}</strong>
          <button
            onClick={() => {
              try {
                downloadOriginal(asset);
              } catch (reason) {
                setError((reason as Error).message);
              }
            }}
            title="下载原文件"
            aria-label="下载原文件"
          >
            <DownloadSimple size={18} />
          </button>
          <button onClick={onDetails} title="素材详情" aria-label="素材详情">
            <Info size={18} />
          </button>
          <button
            onClick={onClose}
            title="关闭 · 空格 / Esc"
            aria-label="关闭快速预览"
          >
            <X size={20} />
          </button>
        </header>
        <div className="quick-preview-media">
          {asset.kind === "image" ? (
            <img src={asset.url} alt={asset.name} />
          ) : asset.kind === "video" ? (
            <video
              key={asset.id}
              src={asset.url}
              controls
              autoPlay
              playsInline
              onError={() => setError("此编码无法预览，请下载原文件")}
            />
          ) : (
            <audio key={asset.id} src={asset.url} controls autoPlay />
          )}
        </div>
        {error && <p role="alert">{error}</p>}
      </section>
    </dialog>
  );
}
