import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChatCircleText,
  Check,
  Plus,
  Trash,
  Scissors,
  LinkBreak,
  CopySimple,
  DotsSixVertical,
} from "@phosphor-icons/react";
import type { Asset, EditAction, EditParagraph } from "../../types";
import { ReferenceMedia } from "./ReferenceMedia";
import { bindDragCleanup } from "../../services/dragLifecycle";
import {
  groupAssets,
  type StackAction,
} from "../../../shared/asset-stacks.mjs";

function moveTextCaret(element: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let node = walker.nextNode();
  let remaining = Math.max(0, offset);
  while (node) {
    const length = node.textContent?.length || 0;
    if (remaining <= length) {
      range.setStart(node, remaining);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function getTextCaret(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !element.contains(selection.anchorNode)) return undefined;
  const prefix = document.createRange();
  prefix.selectNodeContents(element);
  prefix.setEnd(selection.anchorNode!, selection.anchorOffset);
  return prefix.toString().length;
}

function insertPlainText(element: HTMLElement, text: string) {
  const selection = window.getSelection();
  const range = selection?.rangeCount
    ? selection.getRangeAt(0)
    : document.createRange();
  if (!selection?.rangeCount || !element.contains(range.commonAncestorContainer)) {
    range.selectNodeContents(element);
    range.collapse(false);
  }
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function ParagraphCard({
  paragraph: p,
  index,
  total,
  assets,
  busy,
  onTextDraftChange,
  primaryOnly,
  mergeSelected,
  onToggleMerge,
  onReorder,
  active,
  onAction,
  onDropFiles,
  onChoose,
  onPreview,
  onStackAction,
}: {
  paragraph: EditParagraph;
  index: number;
  total: number;
  assets: Asset[];
  busy: boolean;
  onTextDraftChange: (id: string, text: string | null) => void;
  primaryOnly: boolean;
  mergeSelected: boolean;
  onToggleMerge: (extend: boolean) => void;
  onReorder: (sourceId: string, index: number) => Promise<boolean>;
  active: boolean;
  onAction: (action: EditAction) => Promise<boolean>;
  onDropFiles: (files: File[]) => Promise<void>;
  onChoose: () => void;
  onPreview: (asset: Asset) => void;
  onStackAction: (action: StackAction) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(p.text),
    [notes, setNotes] = useState(false),
    [note, setNote] = useState("");
  const [selected, setSelected] = useState<{
    start: number;
    end: number;
    quote: string;
  }>();
  const [dropping, setDropping] = useState(false);
  const [reordering, setReordering] = useState(false);
  useEffect(
    () => bindDragCleanup(window, () => setDropping(false)),
    [],
  );
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "pending" | "saving" | "error">("idle");
  const [retrySave, setRetrySave] = useState(0);
  const splitAt = useRef(0);
  const textRef = useRef<HTMLDivElement>(null),
    editRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const previousText = useRef(p.text),
    saveAttempt = useRef(0),
    onActionRef = useRef(onAction),
    autoSaveTimer = useRef<number | undefined>(undefined);
  onActionRef.current = onAction;
  useEffect(() => () => onTextDraftChange(p.id, null), [onTextDraftChange, p.id]);
  const dirty = (editing && draft !== p.text) || !!note.trim();
  useEffect(() => setSelected(undefined), [p.text]);
  useLayoutEffect(() => {
    const editable = editRef.current;
    if (!editing || !editable) return;
    if (
      editable.innerText !== p.text &&
      (draft === p.text || draft === previousText.current)
    ) {
      editable.innerText = p.text;
      setDraft(p.text);
    }
    previousText.current = p.text;
  }, [draft, editing, p.text]);
  const saveTextRef = useRef<() => Promise<boolean>>(async () => true);
  saveTextRef.current = async () => {
    const text = (editRef.current?.innerText ?? draft).replace(/\r\n/g, "\n");
    if (text === p.text) {
      setSaveState("idle");
      return true;
    }
    const attempt = ++saveAttempt.current;
    setSaveState("saving");
    const saved = await onActionRef.current({ type: "text", id: p.id, text });
    if (saved) onTextDraftChange(p.id, null);
    if (attempt === saveAttempt.current) setSaveState(saved ? "idle" : "error");
    return saved;
  };
  useEffect(() => {
    if (!editing || draft === p.text) {
      if (draft === p.text && saveState !== "idle") setSaveState("idle");
      return;
    }
    setSaveState("pending");
    const timer = window.setTimeout(() => {
      autoSaveTimer.current = undefined;
      void saveTextRef.current();
    }, 600);
    autoSaveTimer.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (autoSaveTimer.current === timer) autoSaveTimer.current = undefined;
    };
  }, [draft, editing, p.text, retrySave]);
  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      const menu = menuRef.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target))
        menu.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      const menu = menuRef.current;
      if (event.key === "Escape" && menu?.open) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  const available = new Map(
    assets
      .filter((asset) => !asset.trashedAt)
      .map((asset) => [asset.id, asset]),
  );
  const links = [...p.links].sort(
    (a, b) => Number(b.role === "primary") - Number(a.role === "primary"),
  );
  const visible = links.filter(
    (link) =>
      available.has(link.assetId) && (!primaryOnly || link.role === "primary"),
  );
  const action = (value: EditAction) => onAction({ ...value, id: p.id });
  const enterEditingAt = (position = splitAt.current) => {
    setDraft(p.text);
    setEditing(true);
    requestAnimationFrame(() => {
      const textarea = editRef.current;
      if (!textarea) return;
      const caret = Math.max(0, Math.min(position, textarea.innerText.length));
      textarea.focus();
      moveTextCaret(textarea, caret);
    });
  };
  const groups = groupAssets(
    visible.map((link) => available.get(link.assetId)!),
    assets.filter(
      (asset) =>
        !asset.trashedAt && p.links.some((link) => link.assetId === asset.id),
    ),
  );
  const reorderGroups = (sourceId: string, targetId: string) => {
    const from = groups.findIndex(group => group.members.some(item => item.id === sourceId));
    const to = groups.findIndex(group => group.members.some(item => item.id === targetId));
    if (from < 0 || to < 0 || from === to) return;
    const reordered = [...groups], [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const ids = reordered.flatMap(group => group.members.map(item => item.id).filter(id => p.links.some(link => link.assetId === id)));
    for (const link of p.links) if (!ids.includes(link.assetId)) ids.push(link.assetId);
    void action({ type: "reorderLinks", assetIds: ids });
  };
  const selectText = () => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !textRef.current) return;
    const range = selection.getRangeAt(0);
    if (
      !textRef.current.contains(range.startContainer) ||
      !textRef.current.contains(range.endContainer) ||
      range.collapsed
    ) {
      setSelected(undefined);
      return;
    }
    const prefix = range.cloneRange();
    prefix.selectNodeContents(textRef.current);
    prefix.setEnd(range.startContainer, range.startOffset);
    const start = prefix.toString().length,
      end = start + range.toString().length;
    setSelected({ start, end, quote: p.text.slice(start, end) });
  };
  return (
    <article
      className={`editing-paragraph ${p.generated ? "is-generated" : ""} ${dropping ? "is-dropping" : ""} ${reordering ? "is-reordering" : ""} ${mergeSelected ? "is-merge-selected" : ""} ${active ? "is-active" : ""}`}
      data-editing-dirty={dirty ? "true" : undefined}
      onDragStart={(event) => {
        if (!(event.target as Element).closest(".paragraph-reorder-handle")) return;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/weave-paragraph", p.id);
      }}
      onDragEnd={() => setReordering(false)}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes("application/weave-paragraph")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setReordering(true);
          return;
        }
        if (
          event.dataTransfer.types.some(
            (type) => type === "Files" || type === "application/weave-assets",
          )
        ) {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/weave-paragraph")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setReordering(true);
          return;
        }
        if (
          event.dataTransfer.types.some(
            (type) => type === "Files" || type === "application/weave-assets",
          )
        ) {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "copy";
          setDropping(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setDropping(false);
          setReordering(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDropping(false);
        setReordering(false);
        if (busy) return;
        const paragraphId = event.dataTransfer.getData("application/weave-paragraph");
        if (paragraphId) {
          if (paragraphId !== p.id) {
            const sourceIndex = Number(event.dataTransfer.getData("application/weave-paragraph-index"));
            const rect = event.currentTarget.getBoundingClientRect();
            const targetIndex = index + (event.clientY > rect.top + rect.height / 2 ? 1 : 0);
            const finalIndex = targetIndex - (Number.isInteger(sourceIndex) && sourceIndex < targetIndex ? 1 : 0);
            if (Number.isInteger(sourceIndex) && sourceIndex !== finalIndex)
              void onReorder(paragraphId, finalIndex);
          }
          return;
        }
        const raw = event.dataTransfer.getData("application/weave-assets");
        if (raw) {
          try {
            const ids: unknown = JSON.parse(raw);
            if (Array.isArray(ids) && ids.every((id) => typeof id === "string"))
              void action({ type: "link", assetIds: ids });
          } catch {
            /* other app's invalid payload */
          }
        } else if (event.dataTransfer.files.length)
          void onDropFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <div className="paragraph-copy">
        <header className="paragraph-header">
          <span className="paragraph-drag-slot">
            <span
              className="paragraph-reorder-handle"
              draggable={!busy}
              role="button"
              tabIndex={0}
              aria-label={`拖动第 ${index + 1} 段排序`}
              title="拖动此处调整段落顺序"
              onDragStart={(event) => event.dataTransfer.setData("application/weave-paragraph-index", String(index))}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp" && index > 0) {
                  event.preventDefault();
                  void action({ type: "move", direction: -1 });
                } else if (event.key === "ArrowDown" && index < total - 1) {
                  event.preventDefault();
                  void action({ type: "move", direction: 1 });
                }
              }}
            ><DotsSixVertical size={14} /></span>
            <button type="button" className={`paragraph-number ${mergeSelected ? "is-selected" : ""}`} aria-pressed={mergeSelected} title="点击选择；按住 Shift 点击可连续选择多段" onClick={(event) => onToggleMerge(event.shiftKey)}>
              {String(index + 1).padStart(2, "0")}
            </button>
          </span>
          <button
            className={`paragraph-status ${p.generated ? "done" : ""}`}
            disabled={busy}
            aria-pressed={p.generated}
            onClick={() =>
              void action({ type: "generated", value: !p.generated })
            }
          >
            <Check size={12} />
            {p.generated ? "已完成" : "标记完成"}
          </button>
          {saveState !== "idle" && (
            <span
              className={`paragraph-autosave ${saveState === "error" ? "is-error" : ""}`}
              role="status"
              aria-live="polite"
            >
              {saveState === "error" ? (
                <button onClick={() => setRetrySave((value) => value + 1)}>
                  自动保存失败 · 重试
                </button>
              ) : saveState === "saving" ? "正在自动保存…" : "等待自动保存…"}
            </span>
          )}
          <div className="paragraph-tools">
            <button
              title="上移一段"
              aria-label={`上移第 ${index + 1} 段`}
              disabled={busy || !index}
              onClick={() => void action({ type: "move", direction: -1 })}
            ><ArrowUp size={15} /></button>
            <button
              title="下移一段"
              aria-label={`下移第 ${index + 1} 段`}
              disabled={busy || index === total - 1}
              onClick={() => void action({ type: "move", direction: 1 })}
            ><ArrowDown size={15} /></button>
            <button
              title={copied ? "已复制正文" : copyFailed ? "复制失败：浏览器未授予剪贴板权限" : "复制正文"}
              aria-label={`复制第 ${index + 1} 段正文`}
              disabled={!p.text}
              onClick={async () => {
                setCopied(false);
                setCopyFailed(false);
                try {
                  await navigator.clipboard.writeText(p.text);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1400);
                } catch {
                  setCopyFailed(true);
                }
              }}
            >
              {copied ? <Check size={15} /> : <CopySimple size={15} />}
            </button>
            {(copied || copyFailed) && (
              <span
                className={`paragraph-copy-feedback ${copyFailed ? "is-error" : ""}`}
                role="status"
                aria-live="polite"
              >
                {copied ? "已复制" : "复制失败"}
              </span>
            )}
            <button
              title={editing ? "从当前光标位置拆段" : "点正文进入编辑，再从光标位置拆段"}
              aria-label={editing ? `从光标拆分第 ${index + 1} 段` : `从指定位置拆分第 ${index + 1} 段`}
              disabled={busy || (editing ? dirty : p.text.length < 2)}
              onClick={async () => {
                if (!editing) {
                  enterEditingAt();
                  return;
                }
                if (
                  await action({
                    type: "split",
                    at: editRef.current
                      ? getTextCaret(editRef.current) ?? splitAt.current
                      : splitAt.current,
                  })
                )
                  setEditing(false);
              }}
            >
              <Scissors size={15} />
            </button>
            <button
              title="批注"
              aria-label={`第 ${index + 1} 段批注`}
              aria-expanded={notes}
              onClick={() => setNotes(!notes)}
            >
              <ChatCircleText size={15} />
              {p.notes.length || ""}
            </button>
            <details ref={menuRef}>
              <summary aria-label={`第 ${index + 1} 段更多操作`}>···</summary>
              <div className="paragraph-menu">
                <button
                  disabled={busy}
                  onClick={() => void action({ type: "remove" })}
                >
                  <Trash />
                  移除段落（可恢复）
                </button>
              </div>
            </details>
          </div>
        </header>
        {editing ? (
          <div className="paragraph-editor">
            <div
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label={`第 ${index + 1} 段正文`}
              ref={editRef}
              className="paragraph-text is-editing"
              data-placeholder="空段落 · 点击此处开始编辑"
              onInput={(event) => {
                const text = event.currentTarget.innerText;
                setDraft(text);
                onTextDraftChange(p.id, text);
                const caret = getTextCaret(event.currentTarget);
                if (caret !== undefined) splitAt.current = caret;
              }}
              onKeyUp={(event) => {
                const caret = getTextCaret(event.currentTarget);
                if (caret !== undefined) splitAt.current = caret;
              }}
              onMouseUp={(event) => {
                const caret = getTextCaret(event.currentTarget);
                if (caret !== undefined) splitAt.current = caret;
              }}
              onBlur={() => {
                if (editRef.current) {
                  const caret = getTextCaret(editRef.current);
                  if (caret !== undefined) splitAt.current = caret;
                }
                if (autoSaveTimer.current !== undefined) {
                  window.clearTimeout(autoSaveTimer.current);
                  autoSaveTimer.current = undefined;
                }
                if (draft !== p.text && saveState !== "error")
                  void saveTextRef.current();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  insertPlainText(event.currentTarget, "\n");
                  setDraft(event.currentTarget.innerText);
                }
              }}
              onPaste={(event) => {
                event.preventDefault();
                insertPlainText(
                  event.currentTarget,
                  event.clipboardData.getData("text/plain"),
                );
                setDraft(event.currentTarget.innerText);
              }}
            />
          </div>
        ) : (
          <div
            tabIndex={0}
            ref={textRef}
            className="paragraph-text"
            onMouseUp={selectText}
            onKeyUp={selectText}
            onClick={(event) => {
              const selection = window.getSelection();
              if (
                selection?.rangeCount &&
                !selection.isCollapsed &&
                textRef.current?.contains(selection.anchorNode) &&
                textRef.current?.contains(selection.focusNode)
              )
                return;
              const caret = document.caretRangeFromPoint?.(event.clientX, event.clientY);
              if (!caret || !textRef.current?.contains(caret.startContainer)) {
                enterEditingAt();
                return;
              }
              const prefix = caret.cloneRange();
              prefix.selectNodeContents(textRef.current);
              prefix.setEnd(caret.startContainer, caret.startOffset);
              splitAt.current = prefix.toString().length;
              enterEditingAt(splitAt.current);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                enterEditingAt(splitAt.current);
              }
            }}
          >
            {p.text ? (
              p.text
            ) : (
                <span className="editing-muted">空段落 · 点击此处开始编辑</span>
            )}
          </div>
        )}
        {selected && !editing && (
          <div className="paragraph-selection">
            <span>已选文字</span>
            <button onClick={() => setNotes(true)}>批注</button>
            <button onClick={() => setSelected(undefined)}>取消</button>
          </div>
        )}
        {notes && (
          <div className="paragraph-notes">
            {p.notes.map((item) => (
              <div
                key={item.id}
                className={item.resolved ? "note-resolved" : ""}
              >
                {item.quote && <blockquote>{item.quote}</blockquote>}
                <p>{item.text}</p>
                <div className="paragraph-note-actions">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action({
                        type: "resolveNote",
                        noteId: item.id,
                        value: !item.resolved,
                      })
                    }
                  >
                    {item.resolved ? "重新打开" : "标为已处理"}
                  </button>
                  <button
                    className="paragraph-note-delete"
                    disabled={busy}
                    aria-label="删除这条留言"
                    onClick={() => void action({ type: "deleteNote", noteId: item.id })}
                  >
                    <Trash size={12} />删除
                  </button>
                </div>
              </div>
            ))}
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (
                  !(await action({
                    type: "note",
                    text: note,
                    quote: selected?.quote || "",
                  }))
                )
                  return;
                setNote("");
                setSelected(undefined);
              }}
            >
              {selected && <blockquote>{selected.quote}</blockquote>}
              <textarea
                aria-label={`第 ${index + 1} 段批注内容`}
                placeholder="给剪辑留一句话…"
                rows={2}
                value={note}
                maxLength={10000}
                onChange={(event) => setNote(event.target.value)}
                disabled={busy}
              />
              <button disabled={busy || !note.trim()}>添加批注</button>
            </form>
          </div>
        )}
      </div>
      <div className="paragraph-references">
        <div className="reference-heading">
          <span>对应素材{links.length ? ` · ${links.length}` : ""}</span>
          <button disabled={busy} onClick={onChoose}>
            <Plus size={14} />
            添加素材
          </button>
        </div>
        <div className="reference-grid">
          {groups.map((group) => {
            const primary = group.members.find((asset) =>
              links.some(
                (link) => link.assetId === asset.id && link.role === "primary",
              ),
            );
            const asset = primary || group.cover;
            const link = links.find((link) => link.assetId === asset.id)!;
            return (
              <ReferenceMedia
                key={group.key}
                asset={asset}
                members={group.members}
                onStackAction={onStackAction}
                onVersionPreview={onPreview}
                link={link}
                busy={busy}
                onPreview={() => onPreview(asset)}
                onPrimary={() =>
                  void action({
                    type: "primary",
                    assetId: link.role === "primary" ? null : link.assetId,
                  })
                }
                onUnlink={() =>
                  void action({ type: "unlink", assetId: link.assetId })
                }
                onReorder={reorderGroups}
              />
            );
          })}
        </div>
        {!visible.length && (
          <button
            className="reference-drop-hint"
            disabled={busy}
            onClick={onChoose}
          >
            {primaryOnly && links.length
              ? "本段尚未指定主选"
              : "拖入图片、视频或音频"}
          </button>
        )}
        {links
          .filter((link) => !available.has(link.assetId))
          .map((link) => (
            <div className="reference-missing" key={link.assetId}>
              素材在回收站或暂不可用
              <button
                title="移除失效关联"
                aria-label="移除失效关联"
                disabled={busy}
                onClick={() =>
                  void action({ type: "unlink", assetId: link.assetId })
                }
              >
                <LinkBreak size={14} />
              </button>
            </div>
          ))}
      </div>
    </article>
  );
}
