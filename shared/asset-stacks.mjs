const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function validateAssetStacks(assets) {
  const finals = new Set();
  for (const asset of assets) {
    if (
      asset.stackOrder !== undefined &&
      (!asset.stackId ||
        !Number.isSafeInteger(asset.stackOrder) ||
        asset.stackOrder < 1)
    )
      throw new Error("视频版本排序记录无效，原数据未修改");
    if (asset.stackId === undefined) continue;
    if (!uuid.test(asset.stackId) || asset.kind !== "video")
      throw new Error("视频堆叠记录无效，请使用兼容的新程序；原数据未修改");
    if (!asset.trashedAt && asset.status === "final") {
      if (finals.has(asset.stackId))
        throw new Error("同一视频堆叠有多个最终稿，请保留原工程并核对");
      finals.add(asset.stackId);
    }
  }
  return assets;
}
export function stackMembers(asset, assets, includeTrashed = false) {
  return assets
    .filter(
      (item) =>
        (includeTrashed || !item.trashedAt) &&
        (asset.stackId ? item.stackId === asset.stackId : item.id === asset.id),
    )
    .sort(
      (a, b) =>
        Number(b.status === "final") - Number(a.status === "final") ||
        (b.stackOrder || 0) - (a.stackOrder || 0) ||
        b.createdAt.localeCompare(a.createdAt) ||
        b.id.localeCompare(a.id),
    );
}
export function expandStackIds(ids, assets, includeTrashed = false) {
  return [
    ...new Set(
      ids.flatMap((id) => {
        const asset = assets.find((item) => item.id === id);
        return asset
          ? stackMembers(asset, assets, includeTrashed).map((item) => item.id)
          : [id];
      }),
    ),
  ];
}
export function groupAssets(visible, assets = visible) {
  const seen = new Set();
  return visible.flatMap((asset) => {
    const key = asset.stackId || asset.id;
    if (seen.has(key)) return [];
    seen.add(key);
    const members = stackMembers(asset, assets);
    return [{ key, cover: members[0] || asset, members }];
  });
}
export function applyStackEdit(input, action, revisions, newIds = []) {
  validateAssetStacks(input);
  const assets = structuredClone(input),
    fresh = new Set(newIds);
  const target = assets.find(
    (asset) => asset.id === action.id && !asset.trashedAt,
  );
  if (!target || target.kind !== "video")
    throw new Error("请选择当前项目中可用的视频");
  let touched = stackMembers(target, assets);
  if (action.type === "merge") {
    if (!Array.isArray(action.assetIds) || !action.assetIds.length)
      throw new Error("请拖入视频版本");
    touched = expandStackIds([target.id, ...action.assetIds], assets).map(
      (id) => {
        const item = assets.find(
          (asset) =>
            asset.id === id && !asset.trashedAt && asset.kind === "video",
        );
        if (!item)
          throw new Error("只能堆叠当前项目内的视频，图片或音频请单独保存");
        return item;
      },
    );
    if (touched.length < 2) throw new Error("同一视频不能与自己堆叠");
  } else if (!["final", "detach"].includes(action.type))
    throw new Error("堆叠操作不受支持");
  if (touched.length > 1000) throw new Error("一个堆叠最多保留 1000 个版本");
  for (const item of touched)
    if (!fresh.has(item.id) && revisions?.[item.id] !== item.revision)
      throw new Error("视频版本已有变化，请刷新后重试；未覆盖新内容");
  if (action.type === "merge") {
    const stackId = target.stackId || crypto.randomUUID();
    const final =
      stackMembers(target, assets).find((item) => item.status === "final") ||
      [...touched]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .find((item) => item.status === "final");
    for (const item of touched) {
      item.stackId = stackId;
      item.category = target.category;
      if (item.status === "final" && item.id !== final?.id)
        item.status = "candidate";
    }
    [...touched]
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) ||
          assets.indexOf(a) - assets.indexOf(b),
      )
      .forEach((item, index) => {
        item.stackOrder = index + 1;
      });
  } else if (action.type === "final") {
    for (const item of touched) {
      if (item.id === target.id)
        item.status = action.value === false ? "candidate" : "final";
      else if (item.status === "final") item.status = "candidate";
    }
  } else {
    touched = [target];
    delete target.stackId;
    delete target.stackOrder;
  }
  const now = new Date().toISOString();
  for (const item of touched) {
    item.revision++;
    item.updatedAt = now;
  }
  validateAssetStacks(assets);
  return { assets, changedIds: touched.map((item) => item.id) };
}
export function syncStackLinks(document, assets, bumpRevision = true) {
  if (!document) return document;
  const doc = structuredClone(document);
  let changed = false;
  for (const p of doc.paragraphs) {
    const groups = new Set(
      p.links
        .map(
          (link) => assets.find((asset) => asset.id === link.assetId)?.stackId,
        )
        .filter(Boolean),
    );
    for (const asset of assets)
      if (
        !asset.trashedAt &&
        asset.stackId &&
        groups.has(asset.stackId) &&
        !p.links.some((link) => link.assetId === asset.id)
      ) {
        p.links.push({ assetId: asset.id, role: "alternate" });
        changed = true;
      }
    if (p.links.length > 1000)
      throw new Error("段落关联超过 1000 项，请拆分堆叠或段落");
  }
  if (changed && bumpRevision) {
    doc.revision++;
    doc.updatedAt = new Date().toISOString();
  }
  return changed ? doc : document;
}
