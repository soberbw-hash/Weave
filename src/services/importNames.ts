export const IMPORT_NAMING_KEY = "weave.import-naming";
export function readImportNaming(getItem: (key: string) => string | null) {
  try {
    // Missing/old unset preference defaults on; explicit user choices survive updates.
    return getItem(IMPORT_NAMING_KEY) !== "false";
  } catch {
    return true;
  }
}

export function isImageFile(file: Pick<File, "name" | "type">) {
  return (
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(file.name)
  );
}
export function splitFileName(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0
    ? { stem: name.slice(0, dot), extension: name.slice(dot) }
    : { stem: name, extension: "" };
}
export function importFileName(stem: string, original: string) {
  const value = stem.trim();
  if (
    !value ||
    value.length > 150 ||
    /[<>:"/\\|?*\u0000-\u001f]/.test(value) ||
    /[. ]$/.test(value) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)
  )
    throw new Error(
      "名称不能为空，不能包含路径、Windows 保留名称或特殊字符（最多 150 字）",
    );
  return value + splitFileName(original).extension;
}
