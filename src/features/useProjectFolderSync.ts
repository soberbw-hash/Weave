import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "../store";
import { isDesktop } from "../services/api";
import { folderBrowserInvoke } from "../services/folderBrowser";

export function useProjectFolderSync(projectId?: string, directory = false) {
  const [status, setStatus] = useState("");
  const running = useRef(false);
  const pendingRefresh = useRef(false);
  const current = useRef(projectId);
  current.current = projectId;
  const check = useCallback(async () => {
    if (isDesktop || !projectId || !directory || running.current) return;
    if (
      useWorkspace.getState().busy ||
      document.querySelector('[data-editing-dirty="true"]')
    )
      return;
    running.current = true;
    try {
      const result = await folderBrowserInvoke("syncProjectFolder", {
        projectId,
      });
      if (current.current !== projectId) return;
      pendingRefresh.current ||= Boolean(result.changed);
      if (
        pendingRefresh.current &&
        !useWorkspace.getState().busy &&
        !document.querySelector('[data-editing-dirty="true"]')
      ) {
        await useWorkspace.getState().refresh();
        pendingRefresh.current = false;
      }
      if (result.warnings?.length) {
        useWorkspace.setState({ warning: result.warnings.join("；") });
        setStatus("目录有文件未收录，请查看提示");
      } else
        setStatus(
          result.pending
            ? "等待文件写入完成"
            : `已检查 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`,
        );
    } catch (reason) {
      if (current.current === projectId) {
        setStatus("目录同步暂停");
        useWorkspace.setState({
          warning: `目录同步暂停：${(reason as Error).message}。原项目和原文件保留。`,
        });
      }
    } finally {
      running.current = false;
    }
  }, [projectId, directory]);
  useEffect(() => {
    setStatus("");
    pendingRefresh.current = false;
    void check();
    const timer = window.setInterval(() => {
      if (!document.hidden) void check();
    }, 20000);
    const focus = () => {
      if (!document.hidden) void check();
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [check]);
  return { status, check };
}
