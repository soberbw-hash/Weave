export type LibraryPreferences = {
  layout: "square" | "original";
  names: "hover" | "below";
  density: "normal" | "small";
};
export const LIBRARY_PREFERENCES_KEY = "weave.library-display.v2";
export const defaultLibraryPreferences: LibraryPreferences = {
  layout: "square",
  names: "hover",
  density: "small",
};
export function parseLibraryPreferences(
  raw: string | null,
): LibraryPreferences {
  try {
    const value = JSON.parse(raw || "null");
    return {
      layout: value?.layout === "original" ? "original" : "square",
      names: value?.names === "below" ? "below" : "hover",
      density: value?.density === "normal" ? "normal" : "small",
    };
  } catch {
    return { ...defaultLibraryPreferences };
  }
}

// One-time display-only migration to the explicitly requested compact default.
// The old key stays intact; project records and originals are not touched.
export function readLibraryPreferences(
  getItem: (key: string) => string | null,
): LibraryPreferences {
  const current = getItem(LIBRARY_PREFERENCES_KEY);
  if (current !== null) return parseLibraryPreferences(current);
  return {
    ...parseLibraryPreferences(getItem("weave.library-display.v1")),
    density: "small",
  };
}
