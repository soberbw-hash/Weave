import { Bell, ArrowUpRight } from "@phosphor-icons/react";
import type { Activity } from "../types";
import { formatDate } from "../types";
export function ActivityView({
  activities,
  onLocate,
}: {
  activities: Activity[];
  onLocate: (ids: string[]) => void;
}) {
  return (
    <section className="activity-workspace">
      <div className="view-heading">
        <h2>项目动态</h2>
        <p>素材添加、整理与镜头修改都记录在项目里。</p>
      </div>
      {!activities.length ? (
        <div className="empty-state">
          <Bell size={32} />
          <h2>还没有项目动态</h2>
        </div>
      ) : (
        <div className="activity-list">
          {[...activities]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((a) => (
              <article key={a.id}>
                <div className="actor-avatar">
                  {(a.actor || "创").slice(0, 1)}
                </div>
                <div>
                  <strong>{a.actor || "创作者"}</strong>
                  <p>{a.message}</p>
                  <small>{formatDate(a.createdAt)}</small>
                </div>
                {a.assetIds?.length ? (
                  <button onClick={() => onLocate(a.assetIds!)}>
                    <ArrowUpRight size={15} />
                    查看素材
                  </button>
                ) : null}
              </article>
            ))}
        </div>
      )}
    </section>
  );
}
