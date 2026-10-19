export function droppedMediaUrl(data: Pick<DataTransfer, "getData">): string {
  const html = data.getData("text/html");
  const image = html
    ? new DOMParser()
        .parseFromString(html, "text/html")
        .querySelector("img")
        ?.getAttribute("src")
    : "";
  const uri = data
    .getData("text/uri-list")
    .split(/\r?\n/)
    .find((line) => line.trim() && !line.startsWith("#"));
  const candidate = (image || uri || "").trim();
  return /^https?:\/\//i.test(candidate) ? candidate : "";
}
