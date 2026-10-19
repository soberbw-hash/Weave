import { useRef, useState } from "react";
import { Archive, FolderOpen, FolderSimple, Plus } from "@phosphor-icons/react";
import type { Project } from "../types";
import { projectLabel } from "../../shared/workspace-labels.mjs";
import { formatDate } from "../types";
export function ProjectHome({
  projects,
  onOpen,
  onCreate,
  onSelect,
  desktop,
  folderName,
  onRestoreArchive,
}: {
  projects: Project[];
  onOpen: () => void;
  onCreate: () => void;
  onSelect: (id: string) => void;
  desktop: boolean;
  folderName?: string;
  onRestoreArchive?: (file: File) => Promise<void>;
}) {
  const archiveInput = useRef<HTMLInputElement>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  return (
    <section className="project-home">
      <div className="view-heading">
        <div>
          <span className="eyebrow">创作工作区</span>
          <h1>项目</h1>
          <p>每个项目，都有自己的素材和制作进度。</p>
        </div>
        <div className="heading-actions">
          {!desktop && onRestoreArchive && <>
            <button type="button" disabled={restoreBusy} onClick={() => archiveInput.current?.click()} title="校验 ZIP 备份并恢复为独立项目，原项目不会覆盖">
              <Archive size={17} />{restoreBusy ? "正在校验…" : "恢复备份"}
            </button>
            <input ref={archiveInput} type="file" accept=".zip,application/zip" hidden onChange={async event => {
              const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
              if (!file) return;
              setRestoreBusy(true); setRestoreError("");
              try { await onRestoreArchive(file); }
              catch (reason) { setRestoreError((reason as Error).message || "备份恢复失败"); }
              finally { setRestoreBusy(false); }
            }} />
          </>}
          <button
            onClick={onOpen}
            title={
              desktop
                ? "打开本地或共享盘里的项目文件夹"
                : "授权读取 Weave 本地项目文件夹"
            }
          >
            <FolderOpen size={17} />
            打开项目文件夹
          </button>
          <button className="primary-button" onClick={onCreate}>
            <Plus size={17} />
            新建项目
          </button>
        </div>
      </div>
      <div className="project-grid">
        {projects.map((p) => (
          <button
            className="project-card"
            key={p.id}
            onClick={() => onSelect(p.id)}
          >
            <div className="project-folder">
              <FolderSimple size={36} weight="duotone" />
            </div>
            <h3>{projectLabel(p)}</h3>
            <p>{projectLocation(p.root)}</p>
            {p.unavailable ? <span>项目暂不可用 · 检查文件夹连接</span> : <>
              <span>{p.assetCount ?? 0} 个素材 · {p.paragraphCount ?? 0} 个文稿段落</span>
              <span>最近更新 {formatDate(p.updatedAt || p.createdAt)}</span>
            </>}
          </button>
        ))}
        <button className="project-card create-card" onClick={onCreate}>
          <Plus size={28} />
          <h3>新建项目</h3>
          <p>
            {desktop
              ? "选择本地目录或共享盘"
              : folderName
                ? `保存到本地目录 · ${folderName}`
                : "保存在这台设备的浏览器"}
          </p>
        </button>
      </div>
      {restoreError && <p className="feature-error" role="alert">{restoreError}</p>}
      {!projects.length && (
        <div className="home-help">
          <strong>从一个项目开始</strong>
          <span>
            创建后拖入素材，或在桌面端设置下载接收目录。项目内容可以完整打包带走。
          </span>
        </div>
      )}
    </section>
  );
}

function projectLocation(root?: string) {
  if (!root || root.startsWith("indexeddb://")) return "浏览器本地保存";
  if (root.startsWith("directory:")) return "已连接的本地文件夹";
  if (root.startsWith("本地文件夹 · ")) return root;
  const folder = root.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
  return folder ? `本地文件夹 · ${folder}` : "本地文件夹";
}
