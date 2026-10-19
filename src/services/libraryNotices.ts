import type { LibraryUpdate } from "./sharedLibrary";
import type { NotificationResult } from "./browserNotifications";

export type LibraryNotice = LibraryUpdate & {
  detectedAt: string;
  readAt?: string;
  notifiedAt?: string;
};
export type NoticeState = {
  version: 1;
  libraryId: string;
  clientId: string;
  known: string[];
  entries: LibraryNotice[];
};
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
const categories = new Set([
  "product",
  "character",
  "scene",
  "prop",
  "storyboard",
  "other",
  "uncategorized",
]);
const validIds = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every(
    (id) => typeof id === "string" && id.length > 0 && id.length < 300,
  );
export function createLibraryNoticeStore(
  libraryId: string,
  clientId: string,
  storage: Storage,
) {
  const key = `weave.library-notices.${clientId}.${libraryId}`;
  const get = (name: string) => {
    try {
      return storage.getItem(name);
    } catch {
      throw new Error("无法读取通知记录，请检查浏览器存储权限；原记录未重置");
    }
  };
  const read = (): NoticeState | undefined => {
    const raw = get(key);
    if (!raw) return;
    let value: NoticeState;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error("通知记录无法读取，原记录已保留，未重置");
    }
    if (
      !value ||
      value.version !== 1 ||
      value.libraryId !== libraryId ||
      value.clientId !== clientId ||
      !validIds(value.known) ||
      !Array.isArray(value.entries) ||
      value.entries.some(
        (entry) =>
          !entry ||
          !validIds([entry.id, entry.clientId]) ||
          !validIds(entry.assetIds) ||
          !categories.has(entry.category) ||
          !Number.isSafeInteger(entry.count) ||
          entry.count < 1 ||
          !Number.isFinite(Date.parse(entry.createdAt)) ||
          !Number.isFinite(Date.parse(entry.detectedAt)) ||
          (entry.readAt !== undefined &&
            !Number.isFinite(Date.parse(entry.readAt))) ||
          (entry.notifiedAt !== undefined &&
            !Number.isFinite(Date.parse(entry.notifiedAt))),
      )
    )
      throw new Error("通知记录格式不兼容，原记录已保留，请勿清除浏览器数据");
    return value;
  };
  const save = (state: NoticeState) => {
    if (state.known.length > 200000 || state.entries.length > 20000)
      throw new Error("通知记录达到容量上限，未自动丢弃未读通知");
    try {
      storage.setItem(key, JSON.stringify(state));
    } catch {
      throw new Error(
        "通知状态未能保存，可能存储空间不足或权限受限；原记录未覆盖",
      );
    }
    return state;
  };
  return {
    key,
    read,
    observe(updates: LibraryUpdate[], now = new Date().toISOString()) {
      let state = read();
      if (!state) {
        // Reuse the old local read cursor once; never rewrite it or shared files.
        const legacy = get(`weave.library-baseline.${libraryId}`) === "1";
        let known: string[] = updates.map((update) => update.id);
        if (legacy) {
          try {
            const prior = JSON.parse(
              get(`weave.library-seen.${libraryId}`) || "[]",
            );
            if (!validIds(prior)) throw new Error();
            known = prior;
          } catch {
            throw new Error("旧通知已读记录无法读取，未自动重置");
          }
        }
        state = { version: 1, libraryId, clientId, known, entries: [] };
      }
      const known = new Set(state.known),
        added: LibraryNotice[] = [];
      for (const update of updates) {
        if (known.has(update.id)) continue;
        known.add(update.id);
        if (update.clientId !== clientId)
          added.push({ ...structuredClone(update), detectedAt: now });
      }
      const next = {
        ...state,
        known: [...known],
        entries: [...state.entries, ...added],
      };
      if (JSON.stringify(next) !== get(key)) save(next);
      return { state: next, added };
    },
    markRead(ids?: string[], readValue = true) {
      const state = read();
      if (!state) return;
      const chosen = ids ? new Set(ids) : undefined,
        now = new Date().toISOString();
      return save({
        ...state,
        entries: state.entries.map((entry) =>
          !chosen || chosen.has(entry.id)
            ? { ...entry, readAt: readValue ? now : undefined }
            : entry,
        ),
      });
    },
    markSubmitted(ids: string[]) {
      const state = read();
      if (!state) return;
      const chosen = new Set(ids),
        now = new Date().toISOString();
      return save({
        ...state,
        entries: state.entries.map((entry) =>
          chosen.has(entry.id) ? { ...entry, notifiedAt: now } : entry,
        ),
      });
    },
  };
}
export type LibraryNoticeStore = ReturnType<typeof createLibraryNoticeStore>;

export async function deliverLibraryNotices(
  store: LibraryNoticeStore,
  send: (pending: LibraryNotice[]) => NotificationResult,
  lock?: (
    key: string,
    work: () => Promise<NotificationResult | undefined>,
  ) => Promise<NotificationResult | undefined>,
) {
  const work = async () => {
    const pending =
      store
        .read()
        ?.entries.filter((entry) => !entry.readAt && !entry.notifiedAt) || [];
    if (!pending.length) return;
    const result = send(pending);
    if (result === "submitted")
      store.markSubmitted(pending.map((entry) => entry.id));
    return result;
  };
  return lock ? lock(store.key, work) : work();
}

/** One compact category summary per detection minute, with individual read cursors retained. */
export function noticeGroups(entries: LibraryNotice[]) {
  const groups = new Map<
    string,
    {
      id: string;
      category: LibraryUpdate["category"];
      detectedAt: string;
      assetIds: string[];
      entryIds: string[];
      unread: boolean;
      count: number;
    }
  >();
  for (const entry of entries) {
    const id = `${entry.category}:${Math.floor(Date.parse(entry.detectedAt) / 60000)}`;
    const group = groups.get(id) || {
      id,
      category: entry.category,
      detectedAt: entry.detectedAt,
      assetIds: [],
      entryIds: [],
      unread: false,
      count: 0,
    };
    group.assetIds = [...new Set([...group.assetIds, ...entry.assetIds])];
    group.entryIds.push(entry.id);
    group.count = group.assetIds.length;
    group.unread ||= !entry.readAt;
    if (entry.detectedAt > group.detectedAt)
      group.detectedAt = entry.detectedAt;
    groups.set(id, group);
  }
  return [...groups.values()].sort((a, b) =>
    b.detectedAt.localeCompare(a.detectedAt),
  );
}
