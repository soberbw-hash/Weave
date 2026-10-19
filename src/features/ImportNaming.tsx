import { useEffect, useRef, useState } from "react";
import { FeatureDialog } from "./shared";
import {
  importFileName,
  isImageFile,
  splitFileName,
  readImportNaming,
  IMPORT_NAMING_KEY,
} from "../services/importNames";

export function useImportNaming() {
  const [enabled, setEnabled] = useState(() =>
    readImportNaming((key) => localStorage.getItem(key)),
  );
  const [files, setFiles] = useState<File[]>();
  const resolve = useRef<((files: File[] | undefined) => void) | undefined>(
    undefined,
  );
  const prepare = async (input: File[]) => {
    if (!enabled || !input.some(isImageFile)) return input;
    if (resolve.current) throw new Error("请先完成上一次素材命名");
    setFiles(input);
    return new Promise<File[] | undefined>((done) => {
      resolve.current = done;
    });
  };
  const finish = (value?: File[]) => {
    resolve.current?.(value);
    resolve.current = undefined;
    setFiles(undefined);
  };
  useEffect(
    () => () => {
      resolve.current?.(undefined);
    },
    [],
  );
  return {
    enabled,
    toggle: () =>
      setEnabled((value) => {
        try {
          localStorage.setItem(IMPORT_NAMING_KEY, String(!value));
        } catch {}
        return !value;
      }),
    prepare,
    dialog: files ? (
      <ImportNamingDialog files={files} onFinish={finish} />
    ) : null,
  };
}
function ImportNamingDialog({
  files,
  onFinish,
}: {
  files: File[];
  onFinish: (files?: File[]) => void;
}) {
  const [names, setNames] = useState(() =>
    files.map((file) => splitFileName(file.name).stem),
  );
  const [error, setError] = useState("");
  return (
    <FeatureDialog title="导入时命名" onClose={() => onFinish()}>
      <form
        className="import-naming"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            onFinish(
              files.map((file, index) =>
                isImageFile(file)
                  ? new File([file], importFileName(names[index], file.name), {
                      type: file.type,
                      lastModified: file.lastModified,
                    })
                  : file,
              ),
            );
          } catch (reason) {
            setError((reason as Error).message);
          }
        }}
      >
        <p className="feature-note">
          保存至素材库与已授权项目文件夹，原始来源文件不改名。
        </p>
        <div className="import-name-list">
          {files.map(
            (file, index) =>
              isImageFile(file) && (
                <label key={index}>
                  <span title={file.name}>{file.name}</span>
                  <div>
                    <input
                      aria-label={`素材 ${index + 1} 名称`}
                      value={names[index]}
                      autoFocus={index === files.findIndex(isImageFile)}
                      maxLength={150}
                      onChange={(event) =>
                        setNames((prior) =>
                          prior.map((value, i) =>
                            i === index ? event.target.value : value,
                          ),
                        )
                      }
                    />
                    <small>{splitFileName(file.name).extension}</small>
                  </div>
                </label>
              ),
          )}
        </div>
        {error && (
          <p role="alert" className="feature-error">
            {error}
          </p>
        )}
        <div className="feature-actions">
          <button type="button" onClick={() => onFinish()}>
            取消导入
          </button>
          <button className="primary" type="submit">
            保存并导入
          </button>
        </div>
      </form>
    </FeatureDialog>
  );
}
