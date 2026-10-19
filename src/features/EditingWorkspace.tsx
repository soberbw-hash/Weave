import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  ArrowClockwise,
  FileText,
  CopySimple,
  Check,
  Plus,
  Download,
  X,
  FolderOpen,
  MusicNote,
} from "@phosphor-icons/react";
import type { Asset, EditAction, EditDocument, ProjectSnapshot } from "../types";
import { writeAssetDrag, writeMediaFileDrag } from "../services/assetOutbound";
import {
  buildEditingHandoff,
  downloadHandoff,
} from "../services/editingHandoff";
import { ParagraphCard } from "./editing/ParagraphCard";
import { PasteDocumentDialog } from "./editing/PasteDocumentDialog";
import { FeatureDialog, errorText } from "./shared";
import "./editing/editing.css";
import { validateEditing } from "../../shared/editing.mjs";
import { groupAssets, type StackAction } from "../../shared/asset-stacks.mjs";

export function EditingWorkspace({
  snapshot,
  onEdit,
  onImport,
  onPreview,
  onStackAction,
}: {
  snapshot: ProjectSnapshot;
  onEdit: (action: EditAction, revision: number) => Promise<unknown>;
  onImport: (files: File[]) => Promise<string[] | undefined>;
  onPreview: (asset: Asset) => void;
  onStackAction: (action: StackAction) => Promise<unknown>;
}) {
  const { doc, formatError } = useMemo(() => {
    try {
      return {
        doc: snapshot.editing
          ? validateEditing(snapshot.editing, snapshot.assets)
          : undefined,
        formatError: "",
      };
    } catch (reason) {
      return { doc: undefined, formatError: errorText(reason) };
    }
  }, [snapshot.editing, snapshot.assets]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const busyRef = useRef(false),
    current = useRef(doc);
  current.current = doc;
  const past = useRef<Array<{ document: EditDocument | undefined; revision: number; label: string }>>([]),
    future = useRef<Array<{ document: EditDocument | undefined; revision: number; label: string }>>([]),
    revision = useRef(doc?.revision || 0);
  if (doc && doc.revision > revision.current) revision.current = doc.revision;
  const [, setHistoryVersion] = useState(0);
  const [paste, setPaste] = useState(false),
    [drawer, setDrawer] = useState(false),
    [target, setTarget] = useState("");
  const [search, setSearch] = useState(""),
    [mediaKind, setMediaKind] = useState("all"),
    [primaryOnly, setPrimaryOnly] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);
  const mergeAnchor = useRef<number | null>(null);
  const draftTexts = useRef(new Map<string, string>());
  const [copiedDocument, setCopiedDocument] = useState(false);
  const updateDraftText = useCallback((id: string, text: string | null) => {
    if (text === null) draftTexts.current.delete(id);
    else draftTexts.current.set(id, text);
  }, []);
  const [restore, setRestore] = useState(false),
    [sources, setSources] = useState(false),
    [exporting, setExporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const assets = snapshot.assets.filter(
      (a) => !a.trashedAt && a.kind !== "document",
    ),
    paragraphs = doc?.paragraphs || [];
  const activeIds = new Set(assets.map((a) => a.id));
  const visible = paragraphs.filter(
    (p) =>
      (!search ||
        p.text.includes(search) ||
        p.notes.some((n) => n.text.includes(search))),
  );
  const mergeIndexes = mergeSelection.map(id => paragraphs.findIndex(p => p.id === id)).sort((a, b) => a - b);
  const canMergeSelected = mergeIndexes.length >= 2 && mergeIndexes[0] >= 0 && mergeIndexes.every((index, offset) => offset === 0 || index === mergeIndexes[offset - 1] + 1);
  const mergeSelected = async () => {
    if (!canMergeSelected || !(await command({ type: "merge", id: paragraphs[mergeIndexes[0]].id, count: mergeIndexes.length - 1 }))) return;
    setMergeSelection([]);
    mergeAnchor.current = null;
  };
  useEffect(() => {
    setMergeSelection([]);
    mergeAnchor.current = null;
  }, [search]);
  const toggleMergeSelection = (index: number, extend: boolean) => {
    if (extend && mergeAnchor.current !== null) {
      const start = Math.min(mergeAnchor.current, index), end = Math.max(mergeAnchor.current, index);
      setMergeSelection(paragraphs.slice(start, end + 1).map((paragraph) => paragraph.id));
      return;
    }
    if (mergeSelection.length === 1 && mergeSelection[0] === paragraphs[index].id) {
      setMergeSelection([]);
      mergeAnchor.current = null;
      return;
    }
    mergeAnchor.current = index;
    setMergeSelection([paragraphs[index].id]);
  };
  const copyDocument = async () => {
    const text = completeDocumentText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setError("");
      setMessage(`完整文稿已复制（${paragraphs.length} 段）`);
      setCopiedDocument(true);
      window.setTimeout(() => setCopiedDocument(false), 1400);
    } catch {
      setCopiedDocument(false);
      setError("复制失败：浏览器未授予剪贴板权限，请检查权限后重试");
    }
  };
  const completeDocumentText = () => paragraphs
    .map((paragraph) => draftTexts.current.get(paragraph.id) ?? paragraph.text)
    .join("\n\n")
    .trimEnd();
  const exportCompleteDocument = () => {
    const text = completeDocumentText();
    if (!text) {
      setError("文稿还没有可导出的正文");
      return;
    }
    const baseName = (doc?.title || "剪辑文稿")
      .replace(/[<>:\"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/\.txt$/i, "")
      .replace(/[. ]+$/g, "")
      .trim()
      .slice(0, 120) || "剪辑文稿";
    const url = URL.createObjectURL(new Blob(["\uFEFF", text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${baseName}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setError("");
    setMessage(`完整文稿已导出：${baseName}.txt`);
  };
  const [limit, setLimit] = useState(50);
  const [assetSearch, setAssetSearch] = useState("");
  const canDiscardInputs = () =>
    !document.querySelector('.editing-workspace [data-editing-dirty="true"]') ||
    window.confirm(
      "还有正在自动保存的文字或未提交批注。继续离开可能丢失这些修改，确定继续？",
    );
  async function work(action: () => Promise<void>) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      return true;
    } catch (reason) {
      setError(errorText(reason));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const actionLabel = (action: EditAction) => ({
    text: "编辑文字", split: "分段", merge: "合并段落", move: "调整段落顺序",
    remove: "移除段落", restore: "恢复段落", generated: "标记完成", link: "关联素材",
    unlink: "解除素材关联", primary: "调整素材主选", reorderLinks: "调整素材顺序",
    note: "添加批注", resolveNote: "更新批注", deleteNote: "删除留言", import: "导入文稿", add: "添加段落",
    title: "修改文稿名称", legacy: "复制旧镜头",
  } as Record<string, string>)[action.type] || "修改文稿";
  const saveEdit = async (action: EditAction) => {
    const before = current.current ? structuredClone(current.current) : undefined;
    const expected = revision.current;
    const result = await onEdit(action, expected);
    const response = result as { revision?: number; editing?: { revision?: number }; snapshot?: { editing?: { revision?: number } } } | undefined;
    const resultRevision = response?.revision ?? response?.editing?.revision ?? response?.snapshot?.editing?.revision;
    revision.current = typeof resultRevision === "number" && Number.isInteger(resultRevision) ? resultRevision : expected + 1;
    if (action.type !== "restoreDocument") {
      past.current.push({ document: before, revision: revision.current, label: actionLabel(action) });
      while (past.current.length > 30 || JSON.stringify(past.current).length > 16_000_000) past.current.shift();
      future.current = [];
      setHistoryVersion((value) => value + 1);
    }
    return result;
  };
  const command = (action: EditAction) =>
    work(async () => {
      if (
        ["remove", "merge"].includes(action.type) &&
        document.querySelector('.editing-workspace [data-editing-dirty="true"]')
      )
        throw new Error("请等待文字自动保存，并先提交批注，再合并或移除段落");
      await saveEdit(action);
      if (action.type !== "text") setMessage("已保存");
    });
  const moveHistory = (redo: boolean) => work(async () => {
    if (document.querySelector('.editing-workspace [data-editing-dirty="true"]'))
      throw new Error("请先等待文字或批注自动保存，再撤回或重做");
    const source = redo ? future.current : past.current;
    const target = redo ? past.current : future.current;
    const entry = source[source.length - 1];
    if (!entry) return;
    if (revision.current !== entry.revision) {
      past.current = []; future.current = [];
      setHistoryVersion((value) => value + 1);
      throw new Error("文稿已在其他窗口更新，撤回历史已失效；请刷新后重试");
    }
    const before = current.current ? structuredClone(current.current) : undefined;
    const result = await onEdit({ type: "restoreDocument", document: entry.document ?? null }, revision.current);
    const response = result as { revision?: number; editing?: { revision?: number }; snapshot?: { editing?: { revision?: number } } } | undefined;
    const resultRevision = response?.revision ?? response?.editing?.revision ?? response?.snapshot?.editing?.revision;
    revision.current = typeof resultRevision === "number" && Number.isInteger(resultRevision) ? resultRevision : revision.current + 1;
    source.pop();
    target.push({ document: before, revision: revision.current, label: entry.label });
    setHistoryVersion((value) => value + 1);
    setMessage(redo ? `已重做：${entry.label}` : `已撤回：${entry.label}`);
  });
  const importToParagraph = (files: File[], id: string) =>
    work(async () => {
      const ids = await onImport(files);
      if (!ids) return;
      if (!ids.length)
        throw new Error("未找到可关联的素材；不支持的格式不会建立空关联");
      await saveEdit({ type: "link", id, assetIds: ids });
      setMessage("已保存原片并关联段落");
    });
  if (formatError)
    return (
      <section className="editing-workspace">
        <p role="alert" className="editing-error">
          {formatError}。原文稿仍保留，请勿用空白内容覆盖。
        </p>
      </section>
    );
  return (
    <section
      className="editing-workspace"
      aria-label="剪辑对照"
      onKeyDown={(event) => {
        if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
        if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]')) return;
        event.preventDefault();
        void moveHistory(event.shiftKey);
      }}
      onPaste={(event) => {
        if (
          (event.target as HTMLElement).closest(
            'input,textarea,[contenteditable="true"]',
          )
        )
          return;
        const files = Array.from(event.clipboardData.files);
        if (!files.length) return;
        event.preventDefault();
        event.stopPropagation();
        if (target) void importToParagraph(files, target);
        else setError("请先点段落旁的「添加素材」，再粘贴图片");
      }}
    >
      <header className="editing-toolbar">
        <div>
          <h1>剪辑对照</h1>
          <span className="editing-save" role="status">
            {busy ? "正在保存…" : message}
          </span>
        </div>
        <div className="editing-actions">
          <button disabled={busy || !past.current.length} onClick={() => void moveHistory(false)} title="撤回上一步 · Ctrl+Z" aria-label="撤回上一步">
            <ArrowCounterClockwise size={16} />撤回
          </button>
          <button disabled={busy || !future.current.length} onClick={() => void moveHistory(true)} title="重做 · Ctrl+Shift+Z" aria-label="重做">
            <ArrowClockwise size={16} />重做
          </button>
          {paragraphs.length ? (
            <button disabled={busy} title="将所有段落正文导出为 UTF-8 文本文件" onClick={exportCompleteDocument}>
              <Download size={16} />
              导出完整文稿
            </button>
          ) : (
            <button disabled={busy} onClick={() => setPaste(true)}>
              <FileText size={16} />
              粘贴文稿
            </button>
          )}
          <button disabled={busy} onClick={() => void command({ type: "add" })}>
            <Plus size={16} />
            添加段落
          </button>
          <button aria-pressed={drawer} onClick={() => setDrawer(!drawer)}>
            <FolderOpen size={16} />
            项目素材
          </button>
          <button
            disabled={busy || !paragraphs.length}
            onClick={() => setExporting(true)}
          >
            <Download size={16} />
            交接导出
          </button>
        </div>
      </header>
      {error && (
        <p className="editing-error" role="alert">
          {error}
        </p>
      )}
      <div className="editing-layout">
        <div className="editing-document">
          {doc && (
            <div className="editing-document-bar">
              <input
                aria-label="文稿名称"
                defaultValue={doc.title}
                key={`${doc.id}:${doc.title}`}
                maxLength={200}
                disabled={busy}
                onBlur={(event) => {
                  if (event.target.value !== doc.title)
                    void command({ type: "title", title: event.target.value });
                }}
              />
              <span>{paragraphs.length} 段</span>
              <button
                type="button"
                disabled={!paragraphs.length}
                title="复制当前文稿的全部段落正文"
                aria-label="复制完整文稿"
                onClick={() => void copyDocument()}
              >
                {copiedDocument ? <Check size={15} /> : <CopySimple size={15} />}
                {copiedDocument ? "已复制" : "复制全文"}
              </button>
              {mergeSelection.length > 0 && (
                <button className="paragraph-merge-selected" disabled={busy || !canMergeSelected} title={canMergeSelected ? "合并选中的连续段落" : "请按住 Shift 选择相邻段落"} onClick={() => void mergeSelected()}>
                  合并所选 {mergeSelection.length} 段
                </button>
              )}
              <input
                aria-label="搜索文稿与批注"
                placeholder="搜索文稿、批注"
                value={search}
                onChange={(event) => {
                  if (!canDiscardInputs()) return;
                  setSearch(event.target.value);
                  setLimit(50);
                }}
              />
              <label className="editing-checkbox">
                <input
                  type="checkbox"
                  checked={primaryOnly}
                  onChange={(event) => setPrimaryOnly(event.target.checked)}
                />
                只看主选
              </label>
              <details className="editing-more">
                <summary>更多</summary>
                <div>
                  <button
                    disabled={!doc.sources.length}
                    onClick={() => setSources(true)}
                  >
                    原始文稿
                  </button>
                  <button onClick={() => setRestore(true)}>
                    已移除段落（{doc.removed.length}）
                  </button>
                  {snapshot.shots.length > 0 && (
                    <button
                      disabled={busy}
                      onClick={() => void command({ type: "legacy" })}
                    >
                      复制旧镜头为段落
                    </button>
                  )}
                </div>
              </details>
            </div>
          )}
          <div className="editing-scroll">
            {!paragraphs.length && (
              <div className="editing-empty">
                <FileText size={34} weight="duotone" />
                <h2>先放入文稿，再把素材拖到段落旁</h2>
                <p>图片、视频、音频，都和对应文字放在一起。</p>
                <button
                  className="editing-primary"
                  onClick={() => setPaste(true)}
                >
                  粘贴整篇文稿
                </button>
                {snapshot.shots.length > 0 && (
                  <button
                    disabled={busy}
                    onClick={() => void command({ type: "legacy" })}
                  >
                    保留旧记录，复制 {snapshot.shots.length} 个镜头为段落
                  </button>
                )}
              </div>
            )}
            {visible.slice(0, limit).map((p) => (
              <ParagraphCard
                key={p.id}
                paragraph={p}
                index={paragraphs.indexOf(p)}
                total={paragraphs.length}
                assets={snapshot.assets}
                busy={busy}
                onTextDraftChange={updateDraftText}
                primaryOnly={primaryOnly}
                mergeSelected={mergeSelection.includes(p.id)}
                onToggleMerge={(extend) => toggleMergeSelection(paragraphs.indexOf(p), extend)}
                active={target === p.id && drawer}
                onAction={command}
                onReorder={(sourceId, index) => command({ type: "moveTo", id: sourceId, index })}
                onDropFiles={async (files) => {
                  await importToParagraph(files, p.id);
                }}
                onChoose={() => {
                  setTarget(p.id);
                  setDrawer(true);
                }}
                onPreview={onPreview}
                onStackAction={onStackAction}
              />
            ))}
            {!!paragraphs.length && !visible.length && (
              <p className="editing-empty">没有符合条件的段落</p>
            )}
            {visible.length > limit && (
              <button
                className="editing-load"
                onClick={() => setLimit(limit + 50)}
              >
                继续显示后面的段落
              </button>
            )}
          </div>
        </div>
        {drawer && (
          <aside className="editing-asset-drawer" aria-label="项目素材">
            <header>
              <strong>项目素材</strong>
              <button aria-label="关闭素材栏" onClick={() => setDrawer(false)}>
                <X size={18} />
              </button>
            </header>
            <select
              aria-label="要添加素材的段落"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            >
              <option value="">选择对应段落…</option>
              {paragraphs.map((p, i) => (
                <option key={p.id} value={p.id}>
                  {String(i + 1).padStart(2, "0")} ·{" "}
                  {p.text.slice(0, 22) || "空段落"}
                </option>
              ))}
            </select>
            <input
              aria-label="搜索项目素材"
              placeholder="搜索素材名称"
              value={assetSearch}
              onChange={(event) => setAssetSearch(event.target.value)}
            />
            <div className="editing-drawer-filters">
              <select
                aria-label="素材类型"
                value={mediaKind}
                onChange={(event) => setMediaKind(event.target.value)}
              >
                <option value="all">全部类型</option>
                <option value="image">图片</option>
                <option value="video">视频</option>
                <option value="audio">音频</option>
              </select>
              <button
                disabled={busy || !target}
                onClick={() => fileInput.current?.click()}
              >
                导入到本段
              </button>
            </div>
            <p className="editing-muted">拖到段落旁，或选择段落后点添加。</p>
            <div className="editing-drawer-list">
              {groupAssets(
                assets.filter(
                  (a) =>
                    (mediaKind === "all" || a.kind === mediaKind) &&
                    a.name
                      .toLocaleLowerCase()
                      .includes(assetSearch.toLocaleLowerCase()),
                ),
                assets,
              ).map(({ cover: asset, members }) => (
                <article
                  key={asset.id}
                  data-preview-asset={asset.id}
                  draggable={!busy}
                  onDragStart={(event) => {
                    writeAssetDrag(event.dataTransfer, members);
                    writeMediaFileDrag(event.dataTransfer, asset);
                  }}
                >
                  <button
                    className="editing-drawer-thumb"
                    aria-label={`预览 ${asset.name}`}
                    onClick={() => onPreview(asset)}
                  >
                    {asset.kind === "image" ? (
                      <img
                        src={asset.url}
                        alt={asset.name}
                        loading="lazy"
                        draggable
                      />
                    ) : asset.kind === "video" ? (
                      <video src={asset.url} preload="none" />
                    ) : (
                      <MusicNote size={25} />
                    )}
                  </button>
                  <span title={asset.name}>
                    {asset.name}
                    {members.length > 1 ? ` · ${members.length} 版` : ""}
                  </span>
                  <button
                    disabled={busy || !target}
                    aria-label={`添加 ${asset.name} 到段落`}
                    onClick={() =>
                      void command({
                        type: "link",
                        id: target,
                        assetIds: [asset.id],
                      })
                    }
                  >
                    <Plus size={16} />
                  </button>
                </article>
              ))}
              {!assets.length && (
                <p className="editing-muted">
                  项目还没有素材，也可以直接拖本地文件到段落旁。
                </p>
              )}
            </div>
          </aside>
        )}
      </div>
      <input
        ref={fileInput}
        hidden
        type="file"
        multiple
        accept="image/*,video/*,audio/*,.mp3,.wav,.m4a,.ogg,.flac"
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          event.target.value = "";
          if (files.length && target) void importToParagraph(files, target);
        }}
      />
      {paste && (
        <PasteDocumentDialog
          busy={busy}
          error={error}
          onClose={() => setPaste(false)}
          onImport={async (text, mode) => {
            if (await command({ type: "import", text, mode })) setPaste(false);
          }}
        />
      )}
      {restore && (
        <FeatureDialog
          title="已移除段落"
          busy={busy}
          onClose={() => setRestore(false)}
        >
          <div className="editing-removed">
            {!doc?.removed.length && <p>暂无已移除段落</p>}
            {doc?.removed.map((item) => (
              <article key={item.paragraph.id}>
                <p>{item.paragraph.text || "空段落"}</p>
                <button
                  disabled={busy}
                  onClick={() =>
                    void command({ type: "restore", id: item.paragraph.id })
                  }
                >
                  <ArrowCounterClockwise size={15} />
                  恢复
                </button>
              </article>
            ))}
          </div>
        </FeatureDialog>
      )}
      {sources && (
        <FeatureDialog title="原始文稿" onClose={() => setSources(false)} wide>
          <div className="editing-removed">
            {doc?.sources.map((source, i) => (
              <details key={source.id}>
                <summary>
                  第 {i + 1} 次粘贴 ·{" "}
                  {new Date(source.createdAt).toLocaleString("zh-CN")}
                </summary>
                <pre>{source.text}</pre>
              </details>
            ))}
          </div>
        </FeatureDialog>
      )}
      {exporting && (
        <FeatureDialog
          title="导出剪辑交接包"
          busy={busy}
          onClose={() => setExporting(false)}
        >
          <div className="editing-export">
            <p>包含当前段落、批注、主选与备选，以及对应原片。</p>
            <p className="editing-muted">
              解压后打开「剪辑对照.html」即可查阅。不包含已移除段落、旧镜头
              Prompt 或未关联素材。
            </p>
            {error && (
              <p className="editing-error" role="alert">
                {error}
              </p>
            )}
            <button
              disabled={busy}
              className="editing-primary"
              onClick={() =>
                void work(async () => {
                  if (!doc) return;
                  const result = await buildEditingHandoff(
                    doc,
                    snapshot.assets,
                    async (asset) => {
                      const response = await fetch(asset.url || "");
                      if (!response.ok)
                        throw new Error(`无法读取原片：${asset.name}`);
                      return response.blob();
                    },
                  );
                  downloadHandoff(result.blob, result.name);
                  setExporting(false);
                  setMessage("交接包已生成并请求下载，请在下载列表确认保存");
                })
              }
            >
              {busy ? "正在校验并打包…" : "导出 ZIP"}
            </button>
          </div>
        </FeatureDialog>
      )}
    </section>
  );
}
