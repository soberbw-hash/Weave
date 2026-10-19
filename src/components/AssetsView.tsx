import { useEffect, useRef, useState } from "react";
import { projectLabel } from "../../shared/workspace-labels.mjs";
import type { DragEvent, MouseEvent, PointerEvent } from "react";
import {
  UploadSimple,
  MagnifyingGlass,
  ArrowCounterClockwise,
  Trash,
  X,
  PencilSimple,
  ArrowSquareOut,
  Copy,
  GridFour,
  FrameCorners,
} from "@phosphor-icons/react";
import type {
  Asset,
  AssetCategory,
  AssetStatus,
  EditParagraph,
  Project,
  CanvasDocument,
} from "../types";
import { categories, libraryCategories, matchesCategory } from "../types";
import { CanvasWorkspace } from "../features/canvas/CanvasWorkspace";
import { AssetThumb } from "./AssetThumb";
import { useOriginalGrid } from "./useOriginalGrid";
import { LibraryDisplayOptions } from "./LibraryDisplayOptions";
import { CategoryDestinations } from "./CategoryDestinations";
import { droppedMediaUrl } from "../services/assetDrop";
import type { LibraryPreferences } from "../services/libraryPreferences";
import { writeAssetDrag } from "../services/assetOutbound";
import { assetCategoryStyle } from "../services/assetCategoryTheme";
import {
  expandStackIds,
  groupAssets,
  stackMembers,
  type StackAction,
} from "../../shared/asset-stacks.mjs";
import { AssetStackHistory } from "../features/AssetStackHistory";

const assetKindOrder: Record<Asset["kind"], number> = {
  image: 0,
  video: 1,
  audio: 2,
  document: 3,
};

type Props = {
  canvas?: CanvasDocument;
  onSaveCanvas: (doc: CanvasDocument, revision: number) => Promise<CanvasDocument>;
  onCanvasImport: (files: File[]) => Promise<{ ids: string[]; assets: Asset[] } | undefined>;
  assets: Asset[];
  paragraphs: EditParagraph[];
  onAttachParagraph: (ids: string[], paragraphId: string) => void;
  selected: string[];
  onSelection: (ids: string[]) => void;
  onPreview: (asset: Asset) => void;
  onUpdate: (ids: string[], patch: Partial<Asset>) => void;
  onTrash: () => void;
  onRestore: () => void;
  onImport: () => void;
  onImportFolder: () => void;
  filter: AssetCategory | "all";
  onFilter: (category: AssetCategory | "all") => void;
  projects: Project[];
  currentProjectId: string;
  onTransfer: (targetId: string) => void;
  onRename: (ids: string[], prefix: string) => Promise<void>;
  onImportCategory: (files: File[], category: AssetCategory) => void;
  onImportLink: (url: string, category: AssetCategory) => void;
  display: LibraryPreferences;
  onDisplayChange: (patch: Partial<LibraryPreferences>) => void;
  onTrashIds: (ids: string[]) => void;
  search: string;
  trash: boolean;
  busy: boolean;
  onUse: (assets: Asset[]) => void;
  onCopy: (asset: Asset) => void;
  onPublish?: (assets: Asset[]) => void;
  onStackAction: (action: StackAction) => Promise<unknown>;
  onImportStack: (files: File[], target: Asset) => unknown;
};
export function AssetsView(props: Props) {
  const {
    assets,
    paragraphs,
    selected,
    onSelection,
    onPreview,
    onUpdate,
    filter,
    onFilter,
    search,
    trash,
    busy,
  } = props;
  const [mode, setMode] = useState<"grid" | "canvas">(() => {
    try { return localStorage.getItem(`weave.library-view.${props.currentProjectId}`) === "canvas" ? "canvas" : "grid"; }
    catch { return "grid"; }
  });
  const visibleCategories = libraryCategories(baseAssets(props.assets, props.trash));
  function changeMode(next: "grid" | "canvas") {
    if (next === mode) return;
    if (document.querySelector('.canvas-workspace[data-editing-dirty="true"]')) return;
    setMode(next); onSelection([]);
    try { localStorage.setItem(`weave.library-view.${props.currentProjectId}`, next); } catch {}
  }
  const viewSwitch = !trash && <div className="library-view-switch" role="group" aria-label="素材库视图">
    <button aria-pressed={mode === "grid"} onClick={() => changeMode("grid")}><GridFour size={15} />网格</button>
    <button aria-pressed={mode === "canvas"} onClick={() => changeMode("canvas")}><FrameCorners size={15} />画布</button>
  </div>;
  const [sort, setSort] = useState("recent");
  const orderKey = `weave.custom-order.${props.currentProjectId}.${filter}`;
  const [customOrder, setCustomOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(orderKey) || "[]"); } catch { return []; }
  });
  useEffect(() => {
    try { setCustomOrder(JSON.parse(localStorage.getItem(orderKey) || "[]")); }
    catch { setCustomOrder([]); }
  }, [orderKey]);
  const [dropError, setDropError] = useState("");
  const [rename, setRename] = useState<string>();
  const [renameError, setRenameError] = useState("");
  const [menu, setMenu] = useState<{ asset: Asset; x: number; y: number }>();
  const [historyId, setHistoryId] = useState("");
  const anchor = useRef<string>("");
  const gridRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{
    x: number;
    y: number;
    endX: number;
    endY: number;
  }>();
  const base = assets.filter((a) => (trash ? !!a.trashedAt : !a.trashedAt));
  const matching = base
    .filter(
      (a) =>
        matchesCategory(a, filter) &&
        (trash || a.status !== "rejected") &&
        `${a.name} ${a.tags.join(" ")} ${a.prompt} ${a.source}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "zh")
        : sort === "oldest"
          ? a.createdAt.localeCompare(b.createdAt)
        : sort === "type"
            ? assetKindOrder[a.kind] - assetKindOrder[b.kind] ||
              a.name.localeCompare(b.name, "zh")
            : b.createdAt.localeCompare(a.createdAt),
    );
  const groups = trash
    ? matching.map((asset) => ({
        key: asset.id,
        cover: asset,
        members: [asset],
      }))
    : groupAssets(matching, base);
  const shown = groups.map((group) => group.cover);
  if (sort === "custom" && customOrder.length) {
    const rank = new Map(customOrder.map((id, index) => [id, index]));
    shown.sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  }
  const reorder = (event: DragEvent, targetId: string) => {
    if (event.altKey) return;
    const raw = event.dataTransfer.getData("application/weave-assets");
    try {
      const ids: unknown = JSON.parse(raw);
      if (!Array.isArray(ids) || ids.length !== 1 || typeof ids[0] !== "string") return;
      const sourceId = groups.find(group => group.members.some(asset => asset.id === ids[0]))?.cover.id;
      if (!sourceId || sourceId === targetId) return;
      const order = shown.map(asset => asset.id).filter(id => id !== sourceId);
      order.splice(Math.max(0, order.indexOf(targetId)), 0, sourceId);
      setCustomOrder(order); setSort("custom");
      try { localStorage.setItem(orderKey, JSON.stringify(order)); } catch {}
    } catch { /* not a Weave asset drag */ }
  };
  useOriginalGrid(
    gridRef,
    // Canvas replaces (unmounts) the grid subtree. Rebind the masonry
    // measurements when returning, even if the assets and layout are unchanged.
    props.display.layout === "original" && (trash || mode === "grid"),
    shown.map((asset) => asset.id).join(","),
  );
  const whole = (ids: string[]) => (trash ? ids : expandStackIds(ids, assets));
  useEffect(() => {
    const selectAll = (event: KeyboardEvent) => {
      if (!trash && mode === "canvas") return;
      if (
        (event.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable],dialog",
        ) ||
        rename !== undefined
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        onSelection(whole(shown.map((a) => a.id)));
      }
    };
    window.addEventListener("keydown", selectAll);
    return () => window.removeEventListener("keydown", selectAll);
  });
  const select = (asset: Asset, e: MouseEvent) => {
    if (e.shiftKey && anchor.current) {
      const anchorIndex = shown.findIndex((a) => a.id === anchor.current),
        start = anchorIndex < 0 ? 0 : anchorIndex,
        end = shown.findIndex((a) => a.id === asset.id);
      onSelection(
        whole(
          Array.from(
            new Set([
              ...selected,
              ...shown
                .slice(Math.min(start, end), Math.max(start, end) + 1)
                .map((a) => a.id),
            ]),
          ),
        ),
      );
    } else if (e.ctrlKey || e.metaKey)
      onSelection(
        whole(
          selected.includes(asset.id)
            ? selected.filter((id) => !whole([asset.id]).includes(id))
            : [...selected, asset.id],
        ),
      );
    else onSelection(whole([asset.id]));
    anchor.current = asset.id;
  };
  const pointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.button !== 0) return;
    const startX = e.clientX,
      startY = e.clientY,
      startIds = e.ctrlKey ? selected : [];
    e.currentTarget.setPointerCapture(e.pointerId);
    setBox({ x: startX, y: startY, endX: startX, endY: startY });
    const move = (event: globalThis.PointerEvent) => {
      setBox({
        x: startX,
        y: startY,
        endX: event.clientX,
        endY: event.clientY,
      });
      const ids = shown
        .filter((_, i) => {
          const rect = gridRef.current?.children[i]?.getBoundingClientRect();
          return (
            rect &&
            rect.left < Math.max(startX, event.clientX) &&
            rect.right > Math.min(startX, event.clientX) &&
            rect.top < Math.max(startY, event.clientY) &&
            rect.bottom > Math.min(startY, event.clientY)
          );
        })
        .map((a) => a.id);
      onSelection(whole(Array.from(new Set([...startIds, ...ids]))));
    };
    const end = () => {
      setBox(undefined);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };
  const dropCategory = (event: DragEvent, category: AssetCategory) => {
    if (busy) return;
    const raw = event.dataTransfer.getData("application/weave-assets");
    const files = Array.from(event.dataTransfer.files);
    const url = droppedMediaUrl(event.dataTransfer);
    if (!raw && !files.length && !url) return;
    event.preventDefault();
    event.stopPropagation();
    setDropError("");
    if (raw) {
      try {
        const ids: unknown = JSON.parse(raw);
        if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string"))
          throw new Error();
        const valid = ids.filter((id) => base.some((asset) => asset.id === id));
        if (valid.length) onUpdate(valid, { category });
        else setDropError("拖入的素材不属于当前项目，请先加入项目。");
      } catch {
        setDropError("无法识别拖入的素材，请重新选择。");
      }
    } else if (files.length) props.onImportCategory(files, category);
    else props.onImportLink(url, category);
  };
  if (!trash && mode === "canvas") return <section className="assets-workspace">
    <div className="library-view-row">{viewSwitch}</div>
    <CanvasWorkspace key={props.currentProjectId}
      projectId={props.currentProjectId} assets={assets} stored={props.canvas}
      search={search} toolbar={null} onSave={props.onSaveCanvas}
      paragraphs={paragraphs} onAttachParagraph={props.onAttachParagraph}
      onImport={props.onCanvasImport} onUpdate={onUpdate}
      onImportCategory={props.onImportCategory} onImportLink={props.onImportLink}
      onPreview={onPreview} onCopy={props.onCopy}
      onUse={props.onUse} onStackAction={props.onStackAction} />
  </section>;
  return (
    <section className="assets-workspace">
      {historyId &&
        assets.some((asset) => asset.id === historyId && !asset.trashedAt) && (
          <AssetStackHistory
            asset={assets.find((asset) => asset.id === historyId)!}
            assets={assets}
            onClose={() => setHistoryId("")}
            onAction={props.onStackAction}
            onPreview={onPreview}
          />
        )}
      {viewSwitch && <div className="library-view-row">{viewSwitch}</div>}
      <div className="library-controls">
        <div className="category-tabs">
          {visibleCategories.map((c) => (
            <button
              key={c.id}
              className={c.id === filter ? "active" : ""}
              data-category={c.id === "all" ? undefined : c.id}
              style={c.id === "all" ? undefined : assetCategoryStyle(c.id)}
              aria-pressed={c.id === filter}
              onClick={() => onFilter(c.id)}
              onDragOver={(event) => {
                if (!busy && c.id !== "all") {
                  event.preventDefault();
                }
              }}
              onDrop={(event) => {
                if (c.id !== "all") dropCategory(event, c.id);
              }}
            >
              <span>{c.label}</span>
              {c.id === filter && (
                <small>
                  {base.filter((a) => matchesCategory(a, c.id)).length}
                </small>
              )}
            </button>
          ))}
        </div>
        <div className="toolbar-controls">
          <select
            aria-label="素材排序"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="recent">最近加入</option>
            <option value="oldest">最早加入</option>
            <option value="name">名称排序</option>
            <option value="type">按类型排序</option>
            <option value="custom">自定义</option>
          </select>
          <LibraryDisplayOptions
            value={props.display}
            onChange={props.onDisplayChange}
          />
        </div>
      </div>
      <div className="library-scroll" onPointerDown={pointerDown}>
        {!trash && filter === "all" && !search && (
          <CategoryDestinations
            assets={base}
            busy={busy}
            onOpen={onFilter}
            onDrop={dropCategory}
          />
        )}
        {dropError && (
          <p className="category-drop-error" role="alert">
            {dropError}
          </p>
        )}
        {shown.length ? (
          <>
            <div className="grid-note">
              <span>
                {search
                  ? "搜索结果"
                  : filter === "all"
                    ? "全部素材"
                    : categories.find((c) => c.id === filter)?.label}
                <small>{shown.length}</small>
              </span>
              <span title="Ctrl 多选 · Shift 连选 · 空格预览 · 双击放大">
                {selected.length ? `已选择 ${selected.length} 项` : ""}
              </span>
            </div>
            <div
              className={`asset-grid ${props.display.density} layout-${props.display.layout}`}
              ref={gridRef}
              onPointerDown={pointerDown}
            >
              {shown.map((asset) => (
                <AssetThumb
                  key={asset.id}
                  asset={asset}
                  stackCount={trash ? 1 : stackMembers(asset, assets).length}
                  onHistory={() => setHistoryId(asset.id)}
                  onStackDrop={
                    !trash && !busy && asset.kind === "video"
                      ? (event) => {
                          setDropError("");
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
                                throw new Error("无法识别视频");
                              if (
                                ids.every((id) =>
                                  stackMembers(asset, assets).some(
                                    (item) => item.id === id,
                                  ),
                                )
                              )
                                return;
                              void props
                                .onStackAction({
                                  type: "merge",
                                  id: asset.id,
                                  assetIds: ids,
                                })
                                .catch((reason) =>
                                  setDropError((reason as Error).message),
                                );
                            } catch (reason) {
                              setDropError((reason as Error).message);
                            }
                          } else if (event.dataTransfer.files.length)
                            props.onImportStack(
                              Array.from(event.dataTransfer.files),
                              asset,
                            );
                        }
                      : undefined
                  }
                  canPreview={!trash}
                  onCopy={props.onCopy}
                  copyDisabled={busy}
                  display={props.display}
                  selected={selected.includes(asset.id)}
                  onDragStart={(event) =>
                    writeAssetDrag(
                      event.dataTransfer,
                      selected.includes(asset.id)
                        ? assets.filter((item) => selected.includes(item.id))
                        : stackMembers(asset, assets),
                    )
                  }
                  onReorderDrop={(event) => reorder(event, asset.id)}
                  onSelect={(e) => select(asset, e)}
                  onToggle={() =>
                    onSelection(
                      whole(
                        selected.includes(asset.id)
                          ? selected.filter(
                              (id) =>
                                !stackMembers(asset, assets).some(
                                  (item) => item.id === id,
                                ),
                            )
                          : [...selected, asset.id],
                      ),
                    )
                  }
                  onPreview={() => onPreview(asset)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!selected.includes(asset.id)) onSelection([asset.id]);
                    setMenu({ asset, x: e.clientX, y: e.clientY });
                  }}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <UploadSimple size={32} weight="light" />
            </div>
            <h2>
              {trash
                ? "回收站是空的"
                : search || filter !== "all"
                  ? "没有找到素材"
                  : "把素材放进来，开始创作"}
            </h2>
            <p>
              {trash
                ? "删除的素材会保留在这里，可随时恢复。"
                : "拖入图片、视频或文件夹，也可以复制图片后按 Ctrl + V。"}
            </p>
            {!trash && (
              <div>
                <button className="primary-button" onClick={props.onImport}>
                  <UploadSimple size={16} />
                  导入素材
                </button>
                <button onClick={props.onImportFolder}>导入文件夹</button>
              </div>
            )}
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <div className="selection-toolbar">
          <strong>已选 {selected.length} 项</strong>
          {trash ? (
            <button onClick={props.onRestore} disabled={busy}>
              <ArrowCounterClockwise size={16} />
              恢复素材
            </button>
          ) : (
            <>
              <button
                disabled={busy}
                onClick={() =>
                  props.onUse(
                    assets.filter((asset) => selected.includes(asset.id)),
                  )
                }
              >
                <ArrowSquareOut size={16} />
                用于上传
              </button>
              <button
                onClick={() => {
                  const first = assets.find((a) => a.id === selected[0]);
                  if (first) onPreview(first);
                }}
              >
                <MagnifyingGlass size={16} />
                预览 / 对比
              </button>
              {props.onPublish && (
                <button
                  disabled={
                    busy ||
                    !assets.some(
                      (asset) =>
                        selected.includes(asset.id) && asset.kind === "image",
                    )
                  }
                  onClick={() =>
                    props.onPublish!(
                      assets.filter(
                        (asset) =>
                          selected.includes(asset.id) && asset.kind === "image",
                      ),
                    )
                  }
                >
                  收录到公共库
                </button>
              )}
              <select
                aria-label="加入其他项目"
                value=""
                disabled={busy}
                onChange={(e) => props.onTransfer(e.target.value)}
              >
                <option value="">加入项目…</option>
                {props.projects
                  .filter((p) => p.id !== props.currentProjectId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {projectLabel(p)}
                    </option>
                  ))}
              </select>
              <select
                aria-label="批量分类"
                value=""
                disabled={busy}
                onChange={(e) =>
                  onUpdate(selected, {
                    category: e.target.value as AssetCategory,
                  })
                }
              >
                <option value="">归类到…</option>
                {visibleCategories
                  .filter((c) => c.id !== "all")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
              </select>
              <select
                aria-label="加入剪辑段落"
                value=""
                disabled={
                  busy ||
                  !paragraphs.length ||
                  assets.some(
                    (asset) =>
                      selected.includes(asset.id) && asset.kind === "document",
                  )
                }
                onChange={(e) =>
                  props.onAttachParagraph(selected, e.target.value)
                }
              >
                <option value="">加入剪辑段落…</option>
                {paragraphs.map((paragraph, index) => (
                  <option key={paragraph.id} value={paragraph.id}>
                    {String(index + 1).padStart(2, "0")} ·{" "}
                    {paragraph.text.slice(0, 22) || "空段落"}
                  </option>
                ))}
              </select>
              <select
                aria-label="批量候选状态"
                value=""
                disabled={busy}
                onChange={(e) =>
                  onUpdate(selected, { status: e.target.value as AssetStatus })
                }
              >
                <option value="">候选状态…</option>
                <option value="candidate">保留候选</option>
                <option value="final">设为最终稿</option>
                <option value="rejected">淘汰</option>
              </select>
              <button
                disabled={busy}
                onClick={() => {
                  setRename("镜头");
                  setRenameError("");
                }}
              >
                <PencilSimple size={14} />
                批量改名
              </button>
              <button
                className="danger"
                onClick={props.onTrash}
                disabled={busy}
              >
                <Trash size={16} />
                移入回收站
              </button>
            </>
          )}
          <button
            className="selection-close"
            title="取消选择"
            onClick={() => onSelection([])}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {box && (
        <div
          className="selection-box"
          style={{
            left: Math.min(box.x, box.endX),
            top: Math.min(box.y, box.endY),
            width: Math.abs(box.x - box.endX),
            height: Math.abs(box.y - box.endY),
          }}
        />
      )}
      {menu && (
        <div
          className="context-backdrop"
          onClick={() => setMenu(undefined)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu(undefined);
          }}
        >
          <div
            className="context-menu"
            role="menu"
            style={{
              left: Math.min(menu.x, window.innerWidth - 200),
              top: Math.max(8, Math.min(menu.y, window.innerHeight - 240)),
            }}
          >
            {!trash && menu.asset.kind === "image" && (
              <button
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  props.onCopy(menu.asset);
                  setMenu(undefined);
                }}
              >
                <Copy size={15} />
                复制图片
              </button>
            )}
            {!trash && (
              <button
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  props.onUse(
                    selected.includes(menu.asset.id)
                      ? assets.filter((asset) => selected.includes(asset.id))
                      : [menu.asset],
                  );
                  setMenu(undefined);
                }}
              >
                <ArrowSquareOut size={15} />
                用于上传
              </button>
            )}
            {!trash && (
              <button role="menuitem" onClick={() => onPreview(menu.asset)}>
                <MagnifyingGlass size={15} />
                放大预览
              </button>
            )}
            {trash && (
              <button role="menuitem" disabled={busy} onClick={props.onRestore}>
                恢复素材
              </button>
            )}
            {!trash && (
              <>
                <button
                  role="menuitem"
                  disabled={busy}
                  onClick={() => onUpdate([menu.asset.id], { status: "final" })}
                >
                  设为最终稿
                </button>
                <button
                  role="menuitem"
                  disabled={busy}
                  className="danger"
                  onClick={() =>
                    props.onTrashIds(
                      selected.includes(menu.asset.id)
                        ? selected
                        : [menu.asset.id],
                    )
                  }
                >
                  <Trash size={15} />
                  移入回收站
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {rename !== undefined && (
        <div className="modal-backdrop">
          <form
            className="small-modal"
            onSubmit={async (e) => {
              e.preventDefault();
              setRenameError("");
              try {
                await props.onRename(selected, rename.trim());
                setRename(undefined);
              } catch (error) {
                setRenameError((error as Error).message);
              }
            }}
          >
            <div className="modal-title">
              <h2>批量改名</h2>
              <button
                type="button"
                disabled={busy}
                onClick={() => setRename(undefined)}
              >
                <X size={19} />
              </button>
            </div>
            <label>
              名称前缀
              <input
                autoFocus
                value={rename}
                onChange={(e) => setRename(e.target.value)}
                required
              />
            </label>
            <p>
              {rename || "素材"}_001、{rename || "素材"}_002…
              保留各自扩展名，不改动原文件内容。
            </p>
            {renameError && <p className="feature-error">{renameError}</p>}
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => setRename(undefined)}
                disabled={busy}
              >
                取消
              </button>
              <button
                className="primary-button"
                disabled={busy || !rename.trim()}
              >
                重命名 {selected.length} 项
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function baseAssets(assets: Asset[], trash: boolean) {
  // Legacy tabs are retained in trash too, so recovering them never requires reclassification.
  return assets.filter(a => trash ? !!a.trashedAt : !a.trashedAt).map(a => trash ? { ...a, trashedAt: undefined } : a);
}
