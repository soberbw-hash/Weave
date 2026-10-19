import type { Asset, EditDocument } from "../src/types";
export type StackAction = {
  type: "merge" | "final" | "detach";
  id: string;
  assetIds?: string[];
  value?: boolean;
};
export function validateAssetStacks(assets: Asset[]): Asset[];
export function stackMembers(
  asset: Asset,
  assets: Asset[],
  includeTrashed?: boolean,
): Asset[];
export function expandStackIds(
  ids: string[],
  assets: Asset[],
  includeTrashed?: boolean,
): string[];
export function groupAssets(
  visible: Asset[],
  assets?: Asset[],
): { key: string; cover: Asset; members: Asset[] }[];
export function applyStackEdit(
  assets: Asset[],
  action: StackAction,
  revisions: Record<string, unknown>,
  newIds?: string[],
): { assets: Asset[]; changedIds: string[] };
export function syncStackLinks<T extends EditDocument | undefined>(
  doc: T,
  assets: Asset[],
  bumpRevision?: boolean,
): T;
