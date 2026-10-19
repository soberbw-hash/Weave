import type { Asset, Shot, EditDocument, EditAction } from "../src/types";
export function splitDocument(value: string, mode?: string): string[];
export function validateEditing(
  value: unknown,
  assets: Pick<Asset, "id">[],
): EditDocument;
export function applyEditing(
  current: EditDocument | undefined,
  action: EditAction,
  assets: Asset[],
  shots?: Shot[],
  expectedRevision?: number,
): EditDocument;
export function editingForExport(
  value: EditDocument | undefined,
  assetIds: string[],
): EditDocument | undefined;
