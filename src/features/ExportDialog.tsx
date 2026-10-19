import { useState, type CSSProperties } from "react";
import { Download } from "@phosphor-icons/react";
import type { ExportInclude, ProjectSnapshot } from "../types";
import { getStoryboardEntries } from "../services/storyboard";
import { projectLabel } from "../../shared/workspace-labels.mjs";
import { AssetMedia, FeatureDialog, errorText } from "./shared";
import "./features.css";

export type ExportOptions = {
  include: ExportInclude;
  format: "zip" | "folder";
  layout: number;
  labels: boolean;
  fit: "contain" | "cover";
};
export type ExportDialogProps = {
  snapshot: ProjectSnapshot;
  canExportFolder?: boolean;
  onClose: () => void;
  onExport: (options: ExportOptions) => Promise<void>;
};
const includeLabels: { key: keyof ExportInclude; label: string }[] = [
  { key: "assets", label: "素材清单与元数据" },
  { key: "originals", label: "素材原文件" },
  { key: "storyboard", label: "分镜板" },
  { key: "scripts", label: "脚本与剪辑文稿" },
  { key: "videos", label: "视频文件" },
];
export function ExportDialog({
  snapshot,
  canExportFolder = true,
  onClose,
  onExport,
}: ExportDialogProps) {
  const entries = getStoryboardEntries(snapshot);
  const [include, setInclude] = useState<ExportInclude>(() => ({
    assets: true,
    originals: true,
    storyboard: entries.length > 0,
    scripts: true,
    videos: true,
  }));
  const [format, setFormat] = useState<"zip" | "folder">("zip");
  const [layout, setLayout] = useState(3);
  const [labels, setLabels] = useState(true);
  const [fit, setFit] = useState<"contain" | "cover">("contain");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <FeatureDialog title="导出项目" onClose={onClose} wide busy={busy}>
      <form
        className="feature-export-layout"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            await onExport({ include, format, layout, labels, fit });
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset className="feature-fields" disabled={busy}>
          <legend>{projectLabel(snapshot.project)}</legend>
          <h3>导出内容</h3>
          {includeLabels.map((item) => (
            <label className="feature-check" key={item.key}>
              <input
                type="checkbox"
                checked={include[item.key]}
                onChange={(event) =>
                  setInclude((value) => ({
                    ...value,
                    [item.key]: event.target.checked,
                  }))
                }
              />
              {item.label}
            </label>
          ))}
          <label>
            格式
            <select
              value={format}
              onChange={(event) =>
                setFormat(event.target.value as "zip" | "folder")
              }
            >
              <option value="zip">ZIP 压缩包</option>
              {canExportFolder && <option value="folder">文件夹</option>}
            </select>
          </label>
          <fieldset className="feature-fields" disabled={!include.storyboard}>
            <legend>分镜板布局</legend>
            <label>
              每行镜头数
              <select
                value={layout}
                onChange={(event) => setLayout(Number(event.target.value))}
              >
                {[2, 3, 4].map((value) => (
                  <option value={value} key={value}>
                    {value} 列
                  </option>
                ))}
              </select>
            </label>
            <label className="feature-check">
              <input
                type="checkbox"
                checked={labels}
                onChange={(event) => setLabels(event.target.checked)}
              />
              显示镜头标题
            </label>
            <label>
              画面适配
              <select
                value={fit}
                onChange={(event) =>
                  setFit(event.target.value as "contain" | "cover")
                }
              >
                <option value="contain">完整显示</option>
                <option value="cover">填充并裁切</option>
              </select>
            </label>
          </fieldset>
          {error && (
            <p role="alert" className="feature-error">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="feature-primary"
            disabled={busy || !Object.values(include).some(Boolean)}
          >
            <Download />
            {busy ? "正在导出…" : "导出"}
          </button>
        </fieldset>
        <div className="feature-export-preview">
          <h3>分镜板预览</h3>
          {include.storyboard ? (
            entries.length ? (
              <div
                className="feature-board-grid"
                style={
                  {
                    "--feature-columns": layout,
                    "--feature-fit": fit,
                  } as CSSProperties
                }
              >
                {entries.map((entry, index) => (
                  <figure key={`${entry.asset.id}-${index}`}>
                    <div className="feature-board-media">
                      <AssetMedia asset={entry.asset} />
                    </div>
                    {labels && (
                      <figcaption>
                        {String(index + 1).padStart(2, "0")} · {entry.title}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            ) : (
              <p className="feature-empty">
                请先为镜头关联图片，或把图片归入「分镜」
              </p>
            )
          ) : (
            <p className="feature-empty">未选择导出分镜板</p>
          )}
        </div>
      </form>
    </FeatureDialog>
  );
}
