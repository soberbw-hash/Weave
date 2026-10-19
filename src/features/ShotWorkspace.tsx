import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Trash,
  Copy,
  Download,
  Tray,
  ArrowsOut,
  Paperclip,
  ArrowUp,
  ArrowDown,
  UploadSimple,
} from "@phosphor-icons/react";
import type { Asset, ProjectSnapshot, Shot } from "../types";
import { shotAssetIds } from "../types";
import { getStoryboardEntries } from "../services/storyboard";
import { AssetMedia, errorText } from "./shared";
import "./features.css";

export type ShotWorkspaceProps = {
  snapshot: ProjectSnapshot;
  onCreate: () => Promise<void>;
  onUpdate: (shot: Shot, patch: Partial<Shot>) => Promise<void>;
  onDelete: (shot: Shot) => Promise<void>;
  onAssign: (ids: string[], shotId: string) => Promise<void>;
  onUnassign: (assetId: string, shot: Shot) => Promise<void>;
  onImportFiles: (files: File[], shotId: string) => Promise<void>;
  onPreview: (asset: Asset) => void;
  onReceive: (shotId: string) => void | Promise<void>;
  onExportBoard: () => void;
  receivingShotId?: string;
};
const statuses: { value: Shot["status"]; label: string }[] = [
  { value: "draft", label: "草稿" },
  { value: "image", label: "图像" },
  { value: "video", label: "视频" },
  { value: "review", label: "待审" },
  { value: "done", label: "完成" },
];
export function ShotWorkspace({
  snapshot,
  onCreate,
  onUpdate,
  onDelete,
  onAssign,
  onUnassign,
  onImportFiles,
  onPreview,
  onReceive,
  onExportBoard,
  receivingShotId,
}: ShotWorkspaceProps) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attach, setAttach] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);
  const [copied, setCopied] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const importShotId = useRef("");
  const [dropShotId, setDropShotId] = useState("");
  const [expandedId, setExpandedId] = useState(snapshot.shots[0]?.id || "");
  const shotCount = useRef(snapshot.shots.length);
  useEffect(() => {
    if (snapshot.shots.length > shotCount.current)
      setExpandedId(snapshot.shots[snapshot.shots.length - 1]?.id || "");
    shotCount.current = snapshot.shots.length;
  }, [snapshot.shots]);
  const shots = [...snapshot.shots].sort(
    (a, b) =>
      (a.order ?? snapshot.shots.indexOf(a)) -
      (b.order ?? snapshot.shots.indexOf(b)),
  );
  const assets = snapshot.assets.filter((asset) => !asset.trashedAt);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function move(shot: Shot, target: number) {
    if (target < 0 || target >= shots.length) return;
    const reordered = shots.filter((item) => item.id !== shot.id);
    reordered.splice(target, 0, shot);
    await run(async () => {
      for (const [order, item] of reordered.entries())
        await onUpdate(item, { order });
    });
  }
  return (
    <section className="feature-workspace" aria-label="分镜工作区">
      <header className="feature-toolbar">
        <div>
          <h1>分镜</h1>
          <p>{shots.length} 个镜头 · 拖动镜头排序，拖入素材关联</p>
        </div>
        <div className="feature-actions">
          <button
            onClick={() =>
              void run(async () => {
                await onExportBoard();
              })
            }
            disabled={busy || !getStoryboardEntries(snapshot).length}
          >
            <Download size={18} />
            导出分镜
          </button>
          <button
            className="feature-primary"
            disabled={busy}
            onClick={() => void run(onCreate)}
          >
            <Plus size={18} />
            新建镜头
          </button>
        </div>
      </header>
      {error && (
        <p className="feature-error" role="alert">
          {error}
        </p>
      )}
      {!shots.length && (
        <div className="feature-empty">
          <h2>从第一个镜头开始</h2>
          <p>添加镜头，填写内容并关联项目中的素材。</p>
          <button onClick={() => void run(onCreate)} disabled={busy}>
            <Plus size={18} />
            新建镜头
          </button>
        </div>
      )}
      <div className="feature-shot-list">
        {shots.map((shot, index) => (
          <article
            key={shot.id}
            className={`feature-shot ${dropShotId === shot.id ? "is-drop-target" : ""}`}
            onDragOver={(event) => {
              if (
                event.dataTransfer.types.includes("application/weave-assets") ||
                event.dataTransfer.types.includes("application/weave-shot") ||
                event.dataTransfer.types.includes("Files")
              ) {
                event.preventDefault();
                event.stopPropagation();
                setDropShotId(shot.id);
              }
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node))
                setDropShotId("");
            }}
            onDrop={(event) => {
              const files = Array.from(event.dataTransfer.files);
              if (
                !files.length &&
                !event.dataTransfer.types.some((type) =>
                  type.startsWith("application/weave-"),
                )
              )
                return;
              event.preventDefault();
              event.stopPropagation();
              setDropShotId("");
              if (busy) return;
              if (
                files.length &&
                !event.dataTransfer.getData("application/weave-assets")
              ) {
                void run(() => onImportFiles(files, shot.id));
                return;
              }
              const raw = event.dataTransfer.getData(
                "application/weave-assets",
              );
              if (raw) {
                try {
                  const ids: unknown = JSON.parse(raw);
                  if (
                    !Array.isArray(ids) ||
                    !ids.every((id) => typeof id === "string")
                  )
                    throw new Error("素材拖放数据无效");
                  const valid = ids.filter((id) =>
                    assets.some((asset) => asset.id === id),
                  );
                  if (!valid.length) throw new Error("未找到可关联的素材");
                  void run(() => onAssign(valid, shot.id));
                } catch (e) {
                  setError(errorText(e));
                }
              } else {
                const source = shots.find(
                  (item) =>
                    item.id ===
                    event.dataTransfer.getData("application/weave-shot"),
                );
                if (source) void move(source, index);
              }
            }}
          >
            <header className="feature-shot-header">
              <span
                className="feature-shot-handle"
                draggable={!busy}
                title="拖动排序"
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/weave-shot", shot.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
              >
                镜头 {String(index + 1).padStart(2, "0")}
              </span>
              <div className="feature-actions">
                <span className="feature-shot-summary">
                  {shot.title} · {shot.duration} 秒
                </span>
                <button
                  aria-expanded={expandedId === shot.id}
                  disabled={busy}
                  onClick={() =>
                    setExpandedId(expandedId === shot.id ? "" : shot.id)
                  }
                >
                  {expandedId === shot.id ? "收起编辑" : "编辑镜头"}
                </button>
                <button
                  className="feature-icon"
                  aria-label="向上移动镜头"
                  disabled={busy || index === 0}
                  onClick={() => void move(shot, index - 1)}
                >
                  <ArrowUp />
                </button>
                <button
                  className="feature-icon"
                  aria-label="向下移动镜头"
                  disabled={busy || index === shots.length - 1}
                  onClick={() => void move(shot, index + 1)}
                >
                  <ArrowDown />
                </button>
                <button
                  className="feature-icon"
                  aria-label={`删除镜头 ${shot.title}`}
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        `删除镜头「${shot.title}」？镜头内容将永久删除，此操作无法撤销。`,
                      )
                    )
                      void run(() => onDelete(shot));
                  }}
                >
                  <Trash />
                </button>
              </div>
            </header>
            <div
              className={`feature-shot-body ${expandedId === shot.id ? "" : "is-collapsed"}`}
            >
              {expandedId === shot.id && (
                <div className="feature-fields">
                  <label>
                    标题
                    <input
                      key={`${shot.id}-title-${shot.title}`}
                      defaultValue={shot.title}
                      disabled={busy}
                      onBlur={(event) => {
                        if (event.target.value !== shot.title)
                          void run(() =>
                            onUpdate(shot, { title: event.target.value }),
                          );
                      }}
                    />
                  </label>
                  {(["description", "dialogue", "prompt"] as const).map(
                    (field) => (
                      <label key={field}>
                        {field === "description"
                          ? "画面描述"
                          : field === "dialogue"
                            ? "对白"
                            : "提示词"}
                        <textarea
                          key={`${field}-${shot[field]}`}
                          defaultValue={shot[field]}
                          rows={field === "prompt" ? 3 : 2}
                          disabled={busy}
                          onBlur={(event) => {
                            if (event.target.value !== shot[field])
                              void run(() =>
                                onUpdate(shot, { [field]: event.target.value }),
                              );
                          }}
                        />
                      </label>
                    ),
                  )}
                  <div className="feature-row">
                    <label>
                      时长（秒）
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        key={`duration-${shot.duration}`}
                        defaultValue={shot.duration}
                        disabled={busy}
                        onBlur={(event) => {
                          const duration = Number(event.target.value);
                          if (
                            Number.isFinite(duration) &&
                            duration >= 0 &&
                            duration !== shot.duration
                          )
                            void run(() => onUpdate(shot, { duration }));
                        }}
                      />
                    </label>
                    <label>
                      状态
                      <select
                        value={shot.status}
                        disabled={busy}
                        onChange={(event) =>
                          void run(() =>
                            onUpdate(shot, {
                              status: event.target.value as Shot["status"],
                            }),
                          )
                        }
                      >
                        {statuses.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="feature-actions">
                    <button
                      disabled={busy || !shot.prompt}
                      onClick={() =>
                        void run(async () => {
                          setCopied(undefined);
                          if (!navigator.clipboard?.writeText)
                            throw new Error("当前环境不支持复制文本到剪贴板");
                          await navigator.clipboard.writeText(shot.prompt);
                          setCopied(shot.id);
                        })
                      }
                    >
                      <Copy />
                      {copied === shot.id ? "已复制" : "复制提示词"}
                    </button>
                    <button
                      disabled={busy}
                      aria-pressed={receivingShotId === shot.id}
                      onClick={() =>
                        void run(async () => {
                          await onReceive(shot.id);
                        })
                      }
                    >
                      <Tray />
                      {receivingShotId === shot.id
                        ? "当前接收目标"
                        : "设为接收目标"}
                    </button>
                  </div>
                </div>
              )}
              <div className="feature-shot-assets">
                <div className="feature-section-heading">
                  <h3>关联素材</h3>
                  <div className="feature-actions">
                    <button
                      disabled={busy}
                      onClick={() => {
                        importShotId.current = shot.id;
                        fileInput.current?.click();
                      }}
                      aria-label={`导入到 ${shot.title}`}
                    >
                      <UploadSimple />
                      导入到此镜头
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => {
                        setAttach(attach === shot.id ? undefined : shot.id);
                        setSelected([]);
                      }}
                    >
                      <Paperclip />
                      关联素材
                    </button>
                  </div>
                </div>
                <div className="feature-media-grid">
                  {assets
                    .filter((asset) =>
                      shotAssetIds(shot, assets).includes(asset.id),
                    )
                    .map((asset) => (
                      <div className="feature-media-card" key={asset.id}>
                        <button
                          className="feature-thumbnail"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await onPreview(asset);
                            })
                          }
                          aria-label={`放大预览 ${asset.name}`}
                        >
                          <AssetMedia asset={asset} />
                          <span className="feature-zoom">
                            <ArrowsOut />
                          </span>
                        </button>
                        <span>{asset.name}</span>
                        <small>
                          {asset.status === "final"
                            ? "最终稿"
                            : asset.status === "rejected"
                              ? "淘汰"
                              : "候选"}
                        </small>
                        <button
                          className="feature-unlink"
                          disabled={busy}
                          onClick={() =>
                            void run(() => onUnassign(asset.id, shot))
                          }
                          aria-label={`取消 ${asset.name} 与 ${shot.title} 的关联`}
                        >
                          取消关联
                        </button>
                      </div>
                    ))}
                </div>
                {!assets.some((asset) =>
                  shotAssetIds(shot, assets).includes(asset.id),
                ) && (
                  <p className="feature-drop-hint">
                    拖入新图片或视频直接保存到此镜头，或从素材库关联。
                  </p>
                )}
                {attach === shot.id && (
                  <div className="feature-attach">
                    <p>选择素材；可在多个镜头复用，不会复制原文件。</p>
                    {assets
                      .filter(
                        (asset) =>
                          !shotAssetIds(shot, assets).includes(asset.id),
                      )
                      .map((asset) => (
                        <label className="feature-check" key={asset.id}>
                          <input
                            type="checkbox"
                            disabled={busy}
                            checked={selected.includes(asset.id)}
                            onChange={(event) =>
                              setSelected((ids) =>
                                event.target.checked
                                  ? [...ids, asset.id]
                                  : ids.filter((id) => id !== asset.id),
                              )
                            }
                          />
                          {asset.name}
                        </label>
                      ))}
                    <button
                      disabled={busy || !selected.length}
                      onClick={() =>
                        void run(async () => {
                          await onAssign(selected, shot.id);
                          setAttach(undefined);
                          setSelected([]);
                        })
                      }
                    >
                      关联 {selected.length} 项素材
                    </button>
                  </div>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        aria-label="镜头素材文件"
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          event.target.value = "";
          if (files.length && importShotId.current)
            void run(() => onImportFiles(files, importShotId.current));
        }}
      />
    </section>
  );
}
