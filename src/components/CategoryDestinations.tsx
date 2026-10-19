import {
  User,
  Mountains,
  Cube,
  PlayCircle,
  MusicNotes,
  SquaresFour,
} from "@phosphor-icons/react";
import type { DragEvent } from "react";
import type { Asset, AssetCategory } from "../types";
import { matchesCategory } from "../types";
import { assetCategoryStyle } from "../services/assetCategoryTheme";

const destinations = [
  { id: "character", label: "角色", icon: User },
  { id: "scene", label: "场景", icon: Mountains },
  { id: "prop", label: "道具", icon: Cube },
  { id: "video", label: "视频", icon: PlayCircle },
  { id: "audio", label: "音频", icon: MusicNotes },
  { id: "other", label: "其他", icon: SquaresFour },
] as const;

export function CategoryDestinations({
  assets,
  onOpen,
  onDrop,
  busy,
}: {
  assets: Asset[];
  onOpen: (category: AssetCategory) => void;
  onDrop: (event: DragEvent, category: AssetCategory) => void;
  busy: boolean;
}) {
  return (
    <div className="category-destinations" aria-label="拖入分类">
      {destinations.map(({ id, label, icon: Icon }) => {
        const count = assets.filter((asset) =>
          matchesCategory(asset, id),
        ).length;
        return (
          <button
            key={id}
            className={`category-destination category-${id}`}
            style={assetCategoryStyle(id)}
            disabled={busy}
            aria-label={`${label}分类，${count} 个素材，可拖入归类`}
            onClick={() => onOpen(id)}
            onDragEnter={(event) => {
              if (!busy) event.preventDefault();
            }}
            onDragOver={(event) => {
              if (busy) return;
              event.preventDefault();
              event.currentTarget.classList.add("is-drag-over");
              event.dataTransfer.dropEffect = "copy";
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node))
                event.currentTarget.classList.remove("is-drag-over");
            }}
            onDrop={(event) => {
              event.currentTarget.classList.remove("is-drag-over");
              onDrop(event, id);
            }}
          >
            <Icon
              className="category-silhouette"
              size={100}
              weight="fill"
              aria-hidden="true"
            />
            <strong>{label}</strong>
            <span>{count ? `${count} 个素材` : "暂无素材"}</span>
            <small>拖入归类</small>
          </button>
        );
      })}
    </div>
  );
}
