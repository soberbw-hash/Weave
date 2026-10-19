import { useState } from "react";
import { splitDocument } from "../../../shared/editing.mjs";
import { FeatureDialog } from "../shared";

export function PasteDocumentDialog({
  busy,
  onClose,
  onImport,
  error,
}: {
  busy: boolean;
  onClose: () => void;
  onImport: (text: string, mode: string) => Promise<void>;
  error?: string;
}) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState("blank");
  let count = 0;
  try {
    count = splitDocument(text, mode).length;
  } catch {
    /* empty input */
  }
  return (
    <FeatureDialog
      title="粘贴文稿"
      onClose={onClose}
      wide
      busy={busy}
    >
      <form
        className="feature-fields editing-paste"
        onSubmit={(event) => {
          event.preventDefault();
          void onImport(text, mode);
        }}
      >
        <textarea
          autoFocus
          aria-label="整篇文稿"
          placeholder="把文稿粘贴到这里…"
          value={text}
          maxLength={1000000}
          rows={14}
          onChange={(event) => setText(event.target.value)}
          disabled={busy}
        />
        {error && (
          <p className="feature-error" role="alert">
            {error}
          </p>
        )}
        <div className="feature-row">
          <label>
            分段方式
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value)}
              disabled={busy}
            >
              <option value="blank">按空行分段</option>
              <option value="line">按每行分段</option>
            </select>
          </label>
          <span className="editing-muted">
            {count} 个段落
          </span>
        </div>
        {count > 2000 && (
          <p role="alert" className="feature-error">
            一次最多 2000 段，请减少段落数量后再导入。
          </p>
        )}
        {count > 0 && (
          <details>
            <summary>查看分段预览</summary>
            <ol className="editing-split-preview">
              {splitDocument(text, mode)
                .slice(0, 20)
                .map((part, i) => (
                  <li key={i}>{part}</li>
                ))}
            </ol>
            {count > 20 && <small>仅预览前 20 段</small>}
          </details>
        )}
        <div className="feature-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button
            className="feature-primary"
            disabled={busy || !count || count > 2000}
          >
            {busy ? "正在保存…" : "开始整理"}
          </button>
        </div>
      </form>
    </FeatureDialog>
  );
}
