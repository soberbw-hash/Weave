import type { LibraryUpdate } from "./sharedLibrary";

/** A client ID identifies this browser, not a verified person. */
export function pendingLibraryUpdates(
  updates: LibraryUpdate[],
  clientId: string,
  seen: ReadonlySet<string>,
  notified: ReadonlySet<string>,
) {
  if (!clientId) return [];
  return updates.filter(
    (update) =>
      update.clientId !== clientId &&
      !seen.has(update.id) &&
      !notified.has(update.id),
  );
}

export function libraryUpdateSummary(updates: LibraryUpdate[]) {
  const labels = {
    product: "产品",
    character: "角色",
    scene: "场景",
    prop: "道具",
    storyboard: "分镜",
    other: "其他",
    uncategorized: "未分类",
  };
  const counts = new Map<LibraryUpdate["category"], number>();
  for (const update of updates)
    counts.set(
      update.category,
      (counts.get(update.category) || 0) + update.count,
    );
  return [...counts]
    .map(([category, count]) => `${labels[category]}库新增 ${count} 个素材`)
    .join("；");
}
