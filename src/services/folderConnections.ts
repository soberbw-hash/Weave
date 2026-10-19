import type { DiskDirectory } from "./directoryFiles";

export type FolderConnection = {
  key: string;
  handle: DiskDirectory;
  name: string;
  kind: "project" | "library" | "project-root";
  id: string;
  mode?: "managed" | "readonly";
};
let db: Promise<IDBDatabase> | undefined;
function open() {
  return (db ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("weave-folder-connections", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("connections", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    db = undefined;
    throw error;
  }));
}
export async function folderConnections(): Promise<FolderConnection[]> {
  const database = await open();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction("connections")
      .objectStore("connections")
      .getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function rememberFolder(connection: FolderConnection) {
  const database = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction("connections", "readwrite");
    tx.objectStore("connections").put(connection);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error("无法记住目录授权"));
  });
}
export async function forgetFolder(key: string) {
  const database = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction("connections", "readwrite");
    tx.objectStore("connections").delete(key);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}
export async function ensureIndependentFolder(
  handle: DiskDirectory,
  kind: "local" | "library",
) {
  for (const connection of await folderConnections()) {
    if (
      kind === "library"
        ? connection.kind === "library"
        : connection.kind !== "library"
    )
      continue;
    const other = connection.handle;
    if (
      (await handle.isSameEntry?.(other)) ||
      (await handle.resolve?.(other)) != null ||
      (await other.resolve?.(handle)) != null
    )
      throw new Error(
        "本地项目与公共库目录不能相同或互相包含，避免公开私人项目；未修改目录",
      );
  }
}
