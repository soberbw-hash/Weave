import { CaretDown, Check, SquaresFour } from "@phosphor-icons/react";
import type { LibraryPreferences } from "../services/libraryPreferences";
import { useEffect, useRef } from "react";

export function LibraryDisplayOptions({
  value,
  onChange,
}: {
  value: LibraryPreferences;
  onChange: (patch: Partial<LibraryPreferences>) => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node))
        ref.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <details ref={ref} className="display-options">
      <summary aria-label="显示选项">
        <SquaresFour size={17} />
        <span>显示</span>
        <CaretDown size={11} />
      </summary>
      <div className="display-options-panel">
        <fieldset>
          <legend>照片网格</legend>
          {(
            [
              ["square", "方形网格"],
              ["original", "原始比例"],
            ] as const
          ).map(([id, label]) => (
            <label key={id}>
              <input
                type="radio"
                aria-label={label}
                name="photo-grid"
                value={id}
                checked={value.layout === id}
                onChange={() => onChange({ layout: id })}
              />
              <span>{label}</span>
              {value.layout === id && <Check size={14} />}
            </label>
          ))}
        </fieldset>
        <p className="display-options-note">
          {value.layout === "square"
            ? "上沿对齐，优先保留头部；仅裁切缩略图"
            : "完整显示，不裁切画面"}
        </p>
        <fieldset>
          <legend>文件名称</legend>
          {(
            [
              ["hover", "悬停显示"],
              ["below", "显示在下方"],
            ] as const
          ).map(([id, label]) => (
            <label key={id}>
              <input
                type="radio"
                aria-label={label}
                name="photo-names"
                value={id}
                checked={value.names === id}
                onChange={() => onChange({ names: id })}
              />
              <span>{label}</span>
              {value.names === id && <Check size={14} />}
            </label>
          ))}
        </fieldset>
        <label className="density-option">
          缩略图大小
          <select
            aria-label="缩略图大小"
            value={value.density}
            onChange={(event) =>
              onChange({
                density: event.target.value as LibraryPreferences["density"],
              })
            }
          >
            <option value="normal">舒适</option>
            <option value="small">紧凑</option>
          </select>
        </label>
      </div>
    </details>
  );
}
