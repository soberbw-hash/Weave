import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  FolderOpen,
  Check,
  X,
  Columns,
  Image as ImageIcon,
} from "@phosphor-icons/react";
import {
  categories,
  formatSize,
  shotAssetIds,
  type Asset,
  type Shot,
  type EditParagraph,
} from "../types";
import { FeatureDialog, errorText } from "./shared";
import "./features.css";
import { copyAssetImage } from "../services/assetOutbound";

export type AssetPreviewProps = {
  readOnly?: boolean;
  assets: Asset[];
  initialId: string;
  onClose: () => void;
  onUpdate: (asset: Asset, patch: Partial<Asset>) => Promise<void>;
  onReveal: (asset: Asset) => void;
  onReadDocument: (asset: Asset) => Promise<string>;
  shots: Shot[];
  paragraphs?: EditParagraph[];
};
function PreviewMedia({
  asset,
  onReadDocument,
  onMeasure,
}: {
  asset: Asset;
  onReadDocument: AssetPreviewProps["onReadDocument"];
  onMeasure?: (patch: Partial<Asset>) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pdf = asset.mime === "application/pdf" || /\.pdf$/i.test(asset.name);
  useEffect(() => {
    let alive = true;
    setText("");
    setError("");
    if (asset.kind !== "document" || pdf) return;
    setLoading(true);
    void onReadDocument(asset)
      .then((value) => {
        if (alive) setText(value);
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [asset.id, asset.revision, onReadDocument, pdf, asset.kind]);
  if (asset.kind === "document" && !pdf)
    return (
      <div className="feature-document">
        {loading ? (
          <p role="status">正在读取文档…</p>
        ) : error ? (
          <p role="alert" className="feature-error">
            {error}
          </p>
        ) : (
          <pre>{text || "文档内容为空"}</pre>
        )}
      </div>
    );
  if (!asset.url)
    return <p className="feature-unavailable">此素材没有可用的预览地址</p>;
  if (asset.kind === "image")
    return (
      <>
        {error ? (
          <p role="alert" className="feature-error">
            {error}
          </p>
        ) : (
          <img
            className="feature-preview-image"
            src={asset.url}
            alt={asset.name}
            onLoad={(event) =>
              onMeasure?.({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            onError={() => setError("图像读取失败")}
          />
        )}
      </>
    );
  if (asset.kind === "video")
    return (
      <div className="feature-video-wrap">
        <video
          controls
          preload="metadata"
          src={asset.url}
          onLoadedMetadata={(event) => {
            const media = event.currentTarget;
            onMeasure?.({
              width: media.videoWidth,
              height: media.videoHeight,
              ...(Number.isFinite(media.duration)
                ? { duration: media.duration }
                : {}),
            });
          }}
          onError={() => setError("视频读取失败")}
        />
        {error && (
          <p role="alert" className="feature-error">
            {error}
          </p>
        )}
      </div>
    );
  if (asset.kind === "audio")
    return (
      <div className="feature-audio">
        <p>{asset.name}</p>
        <audio
          controls
          preload="metadata"
          src={asset.url}
          onError={() => setError("此音频无法解码，请下载原文件使用其他播放器")}
        />
        {error && <p role="alert">{error}</p>}
      </div>
    );
  return <iframe className="feature-pdf" src={asset.url} title={asset.name} />;
}
export function AssetPreview({
  assets,
  initialId,
  onClose,
  onUpdate,
  onReveal,
  onReadDocument,
  shots,
  paragraphs = [],
  readOnly = false,
}: AssetPreviewProps) {
  const items = assets.filter((asset) => !asset.trashedAt);
  const [activeId, setActiveId] = useState(initialId);
  useEffect(() => {
    setActiveId(initialId);
  }, [initialId]);
  const index = Math.max(
    0,
    items.findIndex((asset) => asset.id === activeId),
  );
  const asset = items[index];
  const [draft, setDraft] = useState<Partial<Asset>>({});
  const [tags, setTags] = useState("");
  const [measured, setMeasured] = useState<Partial<Asset>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [imageCopied, setImageCopied] = useState(false);
  const [copying, setCopying] = useState<"prompt" | "image">();
  const [compare, setCompare] = useState(false);
  const [compareId, setCompareId] = useState("");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (asset) {
      setDraft({
        name: asset.name,
        prompt: asset.prompt,
        category: asset.category,
        status: asset.status,
      });
      setTags(asset.tags.join(", "));
    }
    setMeasured({});
    setDirty(false);
    setError("");
    setCopied(false);
    setImageCopied(false);
  }, [asset?.id, asset?.revision]);
  const comparable = items.filter(
    (item) =>
      item.id !== asset?.id && (item.kind === "image" || item.kind === "video"),
  );
  const second =
    comparable.find((item) => item.id === compareId) ?? comparable[0];
  async function save(patch = draft) {
    if (!asset || busy) return false;
    if (!patch.name?.trim()) {
      setError("请填写素材名称");
      return false;
    }
    setBusy(true);
    setError("");
    try {
      await onUpdate(asset, {
        ...measured,
        ...patch,
        tags: tags
          .split(/[,，\n]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      setDirty(false);
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function copy(kind: "prompt" | "image") {
    if (busy || !asset) return;
    setBusy(true);
    setCopying(kind);
    setError("");
    try {
      if (kind === "prompt") {
        setCopied(false);
        if (!navigator.clipboard?.writeText)
          throw new Error("当前环境不支持复制文本到剪贴板");
        await navigator.clipboard.writeText(draft.prompt ?? "");
        setCopied(true);
      } else {
        setImageCopied(false);
        await copyAssetImage(asset);
        setImageCopied(true);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      setCopying(undefined);
    }
  }
  async function navigate(delta: number) {
    if (busy || items.length < 2) return;
    if (dirty && !(await save())) return;
    setActiveId(items[(index + delta + items.length) % items.length].id);
  }
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest("input, textarea, select, video, [contenteditable]") ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        void navigate(event.key === "ArrowLeft" ? -1 : 1);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  });
  function edit(patch: Partial<Asset>) {
    setDraft((value) => ({ ...value, ...patch }));
    setDirty(true);
    if ("prompt" in patch) setCopied(false);
  }
  async function close() {
    if (!dirty || (await save())) onClose();
  }
  return (
    <FeatureDialog
      className="feature-preview-dialog"
      title={asset?.name ?? "素材预览"}
      onClose={() => void close()}
      wide
      busy={busy}
    >
      {!asset ? (
        <div className="feature-empty">未找到此素材</div>
      ) : (
        <>
          <div className="feature-preview-toolbar">
            <div className="feature-actions">
              <button
                aria-label="上一项素材"
                disabled={busy || items.length < 2}
                onClick={() => void navigate(-1)}
              >
                <ArrowLeft />
              </button>
              <span>
                {index + 1} / {items.length}
              </span>
              <button
                aria-label="下一项素材"
                disabled={busy || items.length < 2}
                onClick={() => void navigate(1)}
              >
                <ArrowRight />
              </button>
            </div>
            <div className="feature-actions">
              {asset.kind === "image" && (
                <button
                  disabled={busy || !asset.url}
                  onClick={() => void copy("image")}
                >
                  <ImageIcon />
                  {copying === "image"
                    ? "正在复制图像…"
                    : imageCopied
                      ? "图像已复制"
                      : "复制图像"}
                </button>
              )}
              <button
                disabled={
                  busy ||
                  asset.kind === "document" ||
                  asset.kind === "audio" ||
                  !comparable.length
                }
                aria-pressed={compare}
                onClick={() => setCompare((value) => !value)}
              >
                <Columns />
                {compare ? "结束对比" : "对比素材"}
              </button>
            </div>
          </div>
          <div className="feature-preview-layout">
            <div className="feature-preview-stage">
              <div
                className={`feature-preview-media${compare && second && asset.kind !== "document" ? " feature-comparison" : ""}`}
              >
                <div className="feature-preview-pane">
                  <PreviewMedia
                    key={asset.id}
                    asset={asset}
                    onReadDocument={onReadDocument}
                    onMeasure={setMeasured}
                  />
                </div>
                {compare && second && asset.kind !== "document" && (
                  <div className="feature-preview-pane">
                    <label className="feature-compare-select">
                      对比素材
                      <select
                        disabled={busy}
                        value={second.id}
                        onChange={(event) => setCompareId(event.target.value)}
                      >
                        {comparable.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <PreviewMedia
                      key={second.id}
                      asset={second}
                      onReadDocument={onReadDocument}
                    />
                  </div>
                )}
              </div>
            </div>
            {readOnly ? (
              <aside className="feature-preview-details feature-fields">
                <h3>{asset.name}</h3>
                <p>{formatSize(asset.size)}</p>
                <p className="feature-note">
                  公共资产 · 在资产库中管理分类和回收站
                </p>
                <button onClick={() => onReveal(asset)}>下载原文件</button>
              </aside>
            ) : (
              <form
                className="feature-preview-details feature-fields"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
              >
                <p className="feature-meta">
                  {formatSize(asset.size)}
                  {(measured.width ?? asset.width)
                    ? ` · ${measured.width ?? asset.width} × ${measured.height ?? asset.height}`
                    : ""}
                  {(measured.duration ?? asset.duration) !== undefined
                    ? ` · ${Number(measured.duration ?? asset.duration).toFixed(1)} 秒`
                    : ""}
                </p>
                <label>
                  名称
                  <input
                    required
                    value={draft.name ?? ""}
                    disabled={busy}
                    onChange={(event) => edit({ name: event.target.value })}
                  />
                </label>
                <label>
                  提示词
                  <textarea
                    rows={5}
                    value={draft.prompt ?? ""}
                    disabled={busy}
                    onChange={(event) => edit({ prompt: event.target.value })}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || !draft.prompt}
                  onClick={() => void copy("prompt")}
                >
                  <Copy />
                  {copying === "prompt"
                    ? "正在复制…"
                    : copied
                      ? "已复制"
                      : "复制提示词"}
                </button>
                <label>
                  标签（逗号分隔）
                  <input
                    value={tags}
                    disabled={busy}
                    onChange={(event) => {
                      setTags(event.target.value);
                      setDirty(true);
                    }}
                  />
                </label>
                <div className="feature-row">
                  <label>
                    分类
                    <select
                      value={draft.category ?? asset.category}
                      disabled={busy}
                      onChange={(event) =>
                        edit({
                          category: event.target.value as Asset["category"],
                        })
                      }
                    >
                      {categories
                        .filter((category) => category.id !== "all")
                        .map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    状态
                    <select
                      value={draft.status ?? asset.status}
                      disabled={busy}
                      onChange={(event) =>
                        edit({ status: event.target.value as Asset["status"] })
                      }
                    >
                      <option value="candidate">候选</option>
                      <option value="final">最终稿</option>
                      <option value="rejected">淘汰</option>
                    </select>
                  </label>
                </div>
                <div>
                  <h3>关联段落</h3>
                  <p className="feature-note">
                    {paragraphs
                      .map((paragraph, index) => ({ paragraph, index }))
                      .filter(({ paragraph }) =>
                        paragraph.links.some(
                          (link) => link.assetId === asset.id,
                        ),
                      )
                      .map(
                        ({ paragraph, index }) =>
                          `${String(index + 1).padStart(2, "0")} · ${paragraph.text.slice(0, 20) || "空段落"}`,
                      )
                      .join(" / ") || "未关联"}
                  </p>
                  <p className="feature-note">
                    在「剪辑对照」管理，主选只对各自段落生效。
                  </p>
                  {shots.some((shot) =>
                    shotAssetIds(shot, items).includes(asset.id),
                  ) && (
                    <p className="feature-note">
                      旧镜头记录仍保留：
                      {shots
                        .filter((shot) =>
                          shotAssetIds(shot, items).includes(asset.id),
                        )
                        .map((shot) => shot.title)
                        .join(" · ")}
                    </p>
                  )}
                </div>
                <div className="feature-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const patch = { ...draft, status: "final" as const };
                      edit(patch);
                      void save(patch);
                    }}
                  >
                    <Check />
                    设为最终稿
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const patch = { ...draft, status: "rejected" as const };
                      edit(patch);
                      void save(patch);
                    }}
                  >
                    <X />
                    淘汰
                  </button>
                </div>
                <p className="feature-path" title={asset.relativePath}>
                  {asset.relativePath}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    if (busy) return;
                    setBusy(true);
                    setError("");
                    try {
                      await onReveal(asset);
                    } catch (e) {
                      setError(errorText(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <FolderOpen />
                  打开文件位置
                </button>
                {error && (
                  <p className="feature-error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="feature-primary"
                  disabled={busy || !draft.name?.trim()}
                  type="submit"
                >
                  {busy && !copying ? "正在处理…" : "保存修改"}
                </button>
              </form>
            )}
          </div>
        </>
      )}
    </FeatureDialog>
  );
}
