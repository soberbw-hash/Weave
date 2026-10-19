import { useEffect, useState } from "react";
import {
  folderConnections,
  rememberFolder,
  forgetFolder,
  ensureIndependentFolder,
  type FolderConnection,
} from "../services/folderConnections";
import {
  pickDirectory,
  directoryPermission,
  directoryAccessMessage,
} from "../services/directoryFiles";
import {
  attachProjectFolder,
  folderBrowserInvoke,
} from "../services/folderBrowser";

export function LocalFolderSettings({
  projectId,
  onChange,
}: {
  projectId?: string;
  onChange: () => Promise<unknown>;
}) {
  const [folders, setFolders] = useState<FolderConnection[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const reload = () => folderConnections().then(setFolders);
  useEffect(() => {
    void reload().catch((reason) => setError((reason as Error).message));
  }, []);
  const root = folders.find((item) => item.kind === "project-root");
  const current = folders.find(
    (item) => item.kind === "project" && item.id === projectId,
  );
  const choose = async (mode: "root" | "save" | "open" | "relocate") => {
    const choice = pickDirectory();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const handle = await choice;
      if (mode === "root") {
        await directoryPermission(handle, true, true);
        await ensureIndependentFolder(handle, "local");
        await rememberFolder({
          key: "local-project-root",
          kind: "project-root",
          handle,
          name: handle.name,
          id: crypto.randomUUID(),
        });
        setMessage("新项目将保存到此目录；原有浏览器项目不搬迁。");
      } else if (mode === "relocate") {
        await directoryPermission(handle, true, true);
        const result = await folderBrowserInvoke("relocateProjectFolder", {
          projectId,
          handle,
        });
        setMessage(
          `已校验并切换至「${result.name}」，项目身份不变，原位置保留。后续只使用新位置编辑。`,
        );
      } else {
        await attachProjectFolder(
          handle,
          mode === "save" ? projectId : undefined,
        );
        setMessage(
          mode === "save"
            ? "已验证原片并另存独立目录副本，原项目保留。"
            : "已从目录读取项目。",
        );
      }
      await reload();
      await onChange();
    } catch (reason) {
      if ((reason as Error).name !== "AbortError")
        setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <fieldset className="feature-fields" disabled={busy}>
      <legend>本地项目目录</legend>
      <p className="feature-note">
        目录连接选择后立即生效，不由底部「保存设置」控制。
      </p>
      <p className="feature-note">{directoryAccessMessage()}</p>
      <p className="feature-note">
        {root
          ? `新项目目录：${root.name}`
          : "尚未选择。原有项目继续保存在浏览器，不会自动迁移。"}
      </p>
      {current && (
        <p className="feature-note">
          当前项目：{current.name} · 每次修改先写文件夹，浏览器只作工作缓存
        </p>
      )}
      <div className="feature-actions">
        <button type="button" onClick={() => void choose("root")}>
          {root ? "更改新项目默认目录" : "选择新项目保存目录"}
        </button>
        <button type="button" onClick={() => void choose("open")}>
          打开目录项目
        </button>
        <button
          type="button"
          disabled={!projectId}
          onClick={() => void choose("relocate")}
        >
          更改当前项目保存位置
        </button>
        <button
          type="button"
          disabled={!projectId}
          onClick={() => void choose("save")}
        >
          当前项目另存到目录
        </button>
        {(root || current) && (
          <button
            type="button"
            onClick={() => {
              const permission = directoryPermission(
                (current || root)!.handle,
                true,
                true,
              );
              setBusy(true);
              void permission
                .then(() => setMessage("目录已授权"))
                .catch((reason) => setError((reason as Error).message))
                .finally(() => setBusy(false));
            }}
          >
            重新授权
          </button>
        )}
        {current && (
          <button
            type="button"
            onClick={() => {
              setBusy(true);
              setError("");
              void folderBrowserInvoke("syncProjectFolder", { projectId })
                .then(async (result) => {
                  await onChange();
                  setMessage(
                    result.warnings?.join("；") ||
                      (result.pending
                        ? "文件仍在写入，下一次检查后自动收录。"
                        : `目录已检查，新增 ${result.imported || 0} 个素材。`),
                  );
                })
                .catch((reason) => setError((reason as Error).message))
                .finally(() => setBusy(false));
            }}
          >
            立即检查目录
          </button>
        )}
        {root && (
          <button
            type="button"
            onClick={() => {
              setBusy(true);
              void forgetFolder(root.key)
                .then(reload)
                .then(onChange)
                .catch((reason) => setError((reason as Error).message))
                .finally(() => setBusy(false));
            }}
          >
            恢复浏览器保存（不删除文件）
          </button>
        )}
      </div>
      <p className="feature-note">
        更改位置会在所选目录内创建项目文件夹，完整复制校验后切换，旧目录不删除。网页打开时每
        20
        秒检查新文件，按中文目录分类；外部内容替换收录为新素材。受管理原片的改名、移动或损坏只提示异常，不覆盖旧记录。_Weave
        请勿手动修改。
      </p>
      {error && (
        <p role="alert" className="feature-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="feature-note">
          {message}
        </p>
      )}
    </fieldset>
  );
}
