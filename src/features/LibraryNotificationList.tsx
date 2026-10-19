import { useState } from "react";
import { Bell } from "@phosphor-icons/react";
import { noticeGroups, type LibraryNotice } from "../services/libraryNotices";
import { libraryGroups, type SharedAsset } from "../services/sharedLibrary";

export function LibraryNotificationList({
  notices,
  assets,
  connected,
  loading,
  onRead,
  onOpen,
}: {
  notices: LibraryNotice[];
  assets: SharedAsset[];
  connected: boolean;
  loading: boolean;
  onRead: (ids?: string[], value?: boolean) => void;
  onOpen: (update: { entryIds: string[]; assetIds: string[] }) => void;
}) {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const groups = noticeGroups(notices);
  const unread = groups.filter((group) => group.unread).length;
  const shown = unreadOnly ? groups.filter((group) => group.unread) : groups;
  return (
    <div className="library-scroll notification-list">
      <div className="notification-list-actions">
        <div className="category-tabs">
          <button
            aria-pressed={!unreadOnly}
            className={!unreadOnly ? "active" : ""}
            onClick={() => setUnreadOnly(false)}
          >
            全部
          </button>
          <button
            aria-pressed={unreadOnly}
            className={unreadOnly ? "active" : ""}
            onClick={() => setUnreadOnly(true)}
          >
            未读{unread > 0 ? ` ${unread}` : ""}
          </button>
        </div>
        <button disabled={!unread} onClick={() => onRead()}>
          全部标为已读
        </button>
      </div>
      {!shown.length && (
        <div className="empty-state">
          <Bell size={30} />
          <h2>
            {loading
              ? "正在检查公共库…"
              : unreadOnly
                ? "没有未读通知"
                : "暂无通知"}
          </h2>
          <p>
            {connected
              ? "首次连接不提醒历史素材；同事新增会显示在这里，自己的操作不重复提醒。"
              : "连接公共资产库后，在这里查看新增素材。"}
          </p>
        </div>
      )}
      {shown.map((update) => {
        const available = assets.filter(
          (asset) => update.assetIds.includes(asset.id) && !asset.trashedAt,
        );
        return (
          <article
            className={`public-update ${update.unread ? "is-unread" : ""}`}
            key={update.id}
          >
            <Bell size={18} />
            <div>
              <strong>
                {
                  libraryGroups.find((item) => item.id === update.category)
                    ?.label
                }
                库新增 {update.count} 个素材
              </strong>
              <p>
                {new Date(update.detectedAt).toLocaleString("zh-CN")}
                {update.unread ? " · 未读" : " · 已读"}
                {!available.length ? " · 素材已移除或暂不可访问" : ""}
                {available.length > 0 && available.length < update.count
                  ? ` · 当前可查看 ${available.length} 个`
                  : ""}
              </p>
            </div>
            <button
              className="notice-read-action"
              onClick={() => onRead(update.entryIds, update.unread)}
            >
              {update.unread ? "标为已读" : "标为未读"}
            </button>
            <button disabled={!available.length} onClick={() => onOpen(update)}>
              查看素材
            </button>
          </article>
        );
      })}
    </div>
  );
}
