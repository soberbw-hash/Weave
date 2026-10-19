// Dev-only acceptance harness. Not imported by the application or release build.
// Explicit browser-backed directory adapter, NOT native FSA/SMB permission proof.
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { SharedLibraryView } from "../features/SharedLibraryView";
import { useLibraryNotices } from "../features/useLibraryNotices";
import {
  initializeLibrary,
  librarySnapshot,
  imageLibraryInput,
  publishToLibrary,
  sharedAssetBlob,
  type LibrarySnapshot,
} from "../services/sharedLibrary";
import type { DiskDirectory } from "../services/directoryFiles";
import { parseLibraryPreferences } from "../services/libraryPreferences";
import "../styles.css";
import "../typography.css";
import "../features/features.css";

const key = "weave.qa.notification-directory.20261016";
type Tree = {
  directories: string[];
  files: Record<string, { bytes: number[]; type: string }>;
};
const load = (): Tree =>
  JSON.parse(localStorage.getItem(key) || '{"directories":[""],"files":{}}');
const save = (tree: Tree) => localStorage.setItem(key, JSON.stringify(tree));
const missing = () => new DOMException("QA missing entry", "NotFoundError");
class Directory implements DiskDirectory {
  kind = "directory" as const;
  name: string;
  constructor(readonly path = "") {
    this.name = path.split("/").pop() || "验收公共库（浏览器目录适配器）";
  }
  async queryPermission() {
    return "granted" as const;
  }
  async requestPermission() {
    return "granted" as const;
  }
  async getDirectoryHandle(name: string, options = { create: false }) {
    const path = [this.path, name].filter(Boolean).join("/"),
      tree = load();
    if (!tree.directories.includes(path)) {
      if (!options.create) throw missing();
      tree.directories.push(path);
      save(tree);
    }
    return new Directory(path);
  }
  async getFileHandle(name: string, options = { create: false }) {
    const path = [this.path, name].filter(Boolean).join("/"),
      tree = load();
    if (!tree.files[path]) {
      if (!options.create) throw missing();
      tree.files[path] = { bytes: [], type: "" };
      save(tree);
    }
    return {
      kind: "file" as const,
      name,
      getFile: async () => {
        const file = load().files[path];
        if (!file) throw missing();
        return new File([new Uint8Array(file.bytes)], name, {
          type: file.type,
        });
      },
      createWritable: async () => {
        let value: Blob | string = "";
        return {
          write: async (next: Blob | string) => {
            value = next;
          },
          close: async () => {
            const blob = typeof value === "string" ? new Blob([value]) : value;
            const bytes = [...new Uint8Array(await blob.arrayBuffer())],
              next = load();
            next.files[path] = { bytes, type: blob.type };
            save(next);
          },
        };
      },
    };
  }
  async removeEntry(name: string) {
    const tree = load();
    delete tree.files[[this.path, name].filter(Boolean).join("/")];
    save(tree);
  }
  async *values() {
    const tree = load(),
      prefix = this.path ? this.path + "/" : "";
    for (const path of tree.directories)
      if (
        path !== this.path &&
        path.startsWith(prefix) &&
        !path.slice(prefix.length).includes("/")
      )
        yield new Directory(path);
    for (const path of Object.keys(tree.files))
      if (path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
        yield await this.getFileHandle(path.slice(prefix.length));
  }
}
const root = new Directory();
function Harness() {
  const [snapshot, setSnapshot] = useState<LibrarySnapshot>();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [page, setPage] = useState<"activity" | "public">("activity");
  const [enabled, setEnabled] = useState(false);
  const urls = useRef<string[]>([]);
  const notices = useLibraryNotices(snapshot, "qa-reader", enabled, () =>
    setPage("activity"),
  );
  const refresh = async () => {
    const next = await librarySnapshot(root);
    for (const asset of next.assets) {
      asset.url = URL.createObjectURL(await sharedAssetBlob(root, asset));
      urls.current.push(asset.url);
    }
    setSnapshot(next);
  };
  useEffect(() => {
    let alive = true;
    void initializeLibrary(root)
      .then(() => {
        if (alive) return refresh();
      })
      .catch((reason) => setMessage(reason.message));
    const timer = setInterval(() => {
      if (alive) void refresh().catch((reason) => setMessage(reason.message));
    }, 1000);
    return () => {
      alive = false;
      clearInterval(timer);
      urls.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);
  const publish = async (client: string, count: number) => {
    setBusy(true);
    setMessage("");
    try {
      const bytes = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOoSDnxHwAFoAKkegZU2QAAAABJRU5ErkJggg==",
        ),
        (char) => char.charCodeAt(0),
      );
      const inputs = await Promise.all(
        Array.from({ length: count }, (_, index) =>
          imageLibraryInput(
            new File(
              [bytes, `QA-container-${crypto.randomUUID()}`],
              `测试素材${index + 1}.png`,
              { type: "image/png" },
            ),
          ),
        ),
      );
      await publishToLibrary(
        root,
        client,
        inputs,
        client === "qa-reader" ? "scene" : "character",
      );
      await refresh();
    } catch (reason) {
      setMessage((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <strong>通知链路验收</strong>
        <p className="feature-note">隔离目录适配器 · 非 SMB</p>
        <button
          disabled={busy || !snapshot}
          onClick={() => void publish("qa-writer", 3)}
        >
          另一客户端新增 3 张角色
        </button>
        <button
          disabled={busy || !snapshot}
          onClick={() => void publish("qa-reader", 1)}
        >
          自己新增 1 张场景
        </button>
        <button onClick={() => setPage("activity")}>
          通知 {notices.unread}
        </button>
        <button onClick={() => setPage("public")}>公共资产库</button>
        <p role="status">{message}</p>
        {notices.announcement && (
          <p role="status">{notices.announcement.text}</p>
        )}
      </aside>
      <main className="workspace">
        <SharedLibraryView
          library={{
            ...notices,
            connection: snapshot
              ? {
                  key: "public-library",
                  kind: "library",
                  id: snapshot.id,
                  name: root.name,
                  handle: root,
                  mode: "managed",
                }
              : undefined,
            snapshot,
            checkedAt: "",
            busy,
            refreshing: false,
            refresh,
            connect: async () => {},
            authorize: async () => {},
            disconnect: async () => {},
          }}
          clientId="qa-reader"
          updatesOnly={page === "activity"}
          display={parseLibraryPreferences(null)}
          onAdd={async () => {}}
          notify={setMessage}
          notificationsEnabled={enabled}
          onNotificationsChange={async (value) => setEnabled(value)}
        />
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
