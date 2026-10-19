import { ArrowSquareOut } from "@phosphor-icons/react";
import { AssetThumb } from "../../components/AssetThumb";
import type { Asset } from "../../types";
import { stackMembers } from "../../../shared/asset-stacks.mjs";

export function CanvasMedia({ asset, assets, nodeId, selected, onSelect, onPreview, onCopy, onHistory, onUse, onIntrinsicRatio }: {
  asset: Asset; assets: Asset[]; nodeId?: string; selected: boolean; onSelect: () => void;
  onPreview: () => void; onCopy: (asset: Asset) => void; onHistory: () => void;
  onUse: (assets: Asset[]) => void;
  onIntrinsicRatio?: (nodeId: string, ratio: number) => void;
}) {
  const onRatio = nodeId && onIntrinsicRatio ? (ratio: number) => onIntrinsicRatio(nodeId, ratio) : undefined;
  return <>
    <AssetThumb asset={asset} selected={selected} onSelect={onSelect} onToggle={onSelect}
      onPreview={onPreview} onCopy={onCopy} stackCount={stackMembers(asset, assets).length}
      onHistory={onHistory} display={{ layout: "original", names: "below", density: "small" }}
      onIntrinsicRatio={onRatio} />
    <button className="canvas-use" title="用于上传 / 下载原文件" aria-label={`使用原文件 ${asset.name}`}
      onClick={() => onUse([asset])}><ArrowSquareOut size={15} /></button>
  </>;
}
