import { readZip, createZip, type ZipEntry } from "./zip.ts";
import type { ProjectSnapshot, Asset, Shot } from "../types";
import { validateEditing } from "../../shared/editing.mjs";
import { validateAssetStacks } from "../../shared/asset-stacks.mjs";
import { validateCanvas } from "../../shared/canvas.mjs";

export const APP_VERSION = "0.2.0";
export const PROJECT_SCHEMA = 1;
export type RecoveryRecord = ProjectSnapshot & {
  publicInbox?: boolean;
  trashShots?: Record<string, string>;
  trashShotReferences?: Record<string, string[]>;
};
export type RecoveryMedia = { id: string; hash: string; blob: Blob };
export type BackupInfo = {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  reason: string;
  assetCount: number;
  size: number;
  path?: string;
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const object = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("工程记录格式无效");
  return value as Record<string, any>;
};
export function assertSchema(value: unknown): asserts value is number {
  if (value !== PROJECT_SCHEMA)
    throw new Error(
      "工程格式版本不受支持，请使用兼容的新程序打开；原工程未修改。",
    );
}
export function validateRecord(value: unknown): RecoveryRecord {
  const record = object(structuredClone(value)),
    project = object(record.project);
  assertSchema(project.schemaVersion);
  if (
    !uuid.test(project.id) ||
    typeof project.name !== "string" ||
    !project.name.trim() ||
    typeof project.createdAt !== "string"
  )
    throw new Error("工程标识或名称无效");
  for (const key of ["assets", "shots", "activities"])
    if (!Array.isArray(record[key])) throw new Error(`工程缺少 ${key} 记录`);
  const assetIds = new Set<string>(),
    shotIds = new Set<string>(),
    paths = new Set<string>();
  for (const asset of record.assets as Asset[]) {
    if (
      !uuid.test(asset.id) ||
      assetIds.has(asset.id) ||
      typeof asset.name !== "string" ||
      typeof asset.hash !== "string" ||
      !/^[a-f0-9]{64}$/i.test(asset.hash) ||
      !/^media\/[\p{L}\p{N}._ ()-]+\.[a-z0-9]{1,12}$/iu.test(asset.relativePath) ||
      paths.has(asset.relativePath.toLowerCase())
    )
      throw new Error("素材记录、文件路径或校验值无效");
    if (
      !Number.isInteger(asset.revision) ||
      asset.revision < 1 ||
      !Number.isFinite(asset.size) ||
      asset.size < 0 ||
      !["image", "video", "audio", "document"].includes(asset.kind) ||
      !["candidate", "final", "rejected"].includes(asset.status) ||
      ![
        "uncategorized",
        "character",
        "scene",
        "prop",
        "storyboard",
        "script",
        "video",
        "audio",
        "other",
      ].includes(asset.category) ||
      !Array.isArray(asset.tags) ||
      asset.tags.some((tag) => typeof tag !== "string") ||
      typeof asset.prompt !== "string" ||
      typeof asset.createdAt !== "string" ||
      typeof asset.updatedAt !== "string" ||
      typeof asset.source !== "string" ||
      typeof asset.mime !== "string"
    )
      throw new Error("素材属性不完整，原工程未修改");
    assetIds.add(asset.id);
    paths.add(asset.relativePath.toLowerCase());
    delete asset.url;
  }
  for (const shot of record.shots as Shot[]) {
    if (
      !uuid.test(shot.id) ||
      shotIds.has(shot.id) ||
      !Number.isInteger(shot.revision) ||
      shot.revision < 1 ||
      typeof shot.title !== "string" ||
      !["description", "dialogue", "prompt", "createdAt", "updatedAt"].every(
        (key) => typeof (shot as any)[key] === "string",
      ) ||
      !Number.isFinite(shot.duration) ||
      shot.duration < 0 ||
      !["draft", "image", "video", "review", "done"].includes(shot.status)
    )
      throw new Error("镜头记录无效");
    shot.assetIds =
      shot.assetIds ??
      record.assets
        .filter((asset: Asset) => asset.shotId === shot.id && !asset.trashedAt)
        .map((asset: Asset) => asset.id);
    if (
      !Array.isArray(shot.assetIds) ||
      shot.assetIds.some((id) => !assetIds.has(id))
    )
      throw new Error("镜头引用了备份中不存在的素材");
    shotIds.add(shot.id);
  }
  for (const event of record.activities)
    if (
      !uuid.test(event.id) ||
      typeof event.createdAt !== "string" ||
      typeof event.message !== "string" ||
      typeof event.actor !== "string" ||
      typeof event.type !== "string"
    )
      throw new Error("活动记录无效");
  if (record.trashShotReferences !== undefined) {
    object(record.trashShotReferences);
    for (const [id, refs] of Object.entries(
      record.trashShotReferences as Record<string, unknown>,
    ))
      if (
        !assetIds.has(id) ||
        !Array.isArray(refs) ||
        refs.some((shotId) => typeof shotId !== "string" || !uuid.test(shotId))
      )
        throw new Error("回收站关联记录无效");
  }
  if (record.trashShots !== undefined) {
    object(record.trashShots);
    for (const [id, shotId] of Object.entries(record.trashShots))
      if (!assetIds.has(id) || typeof shotId !== "string" || !uuid.test(shotId))
        throw new Error("回收站镜头记录无效");
  }
  validateAssetStacks(record.assets);
  if (record.editing !== undefined)
    record.editing = validateEditing(record.editing, record.assets);
  if (record.canvas !== undefined)
    record.canvas = validateCanvas(record.canvas, record.assets);
  return record as RecoveryRecord;
}
export async function sha256(blob: Blob): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
export async function validateMedia(
  record: RecoveryRecord,
  media: RecoveryMedia[],
) {
  const stored = new Map(media.map((item) => [item.id, item]));
  if (stored.size !== media.length || media.length !== record.assets.length)
    throw new Error("备份素材数量不一致");
  for (const asset of record.assets) {
    const item = stored.get(asset.id);
    if (
      !item ||
      item.hash !== asset.hash ||
      item.blob.size !== asset.size ||
      (await sha256(item.blob)) !== asset.hash
    )
      throw new Error(`原片校验失败：${asset.name}。没有恢复或覆盖任何工程。`);
  }
}
export async function buildBackup(
  record: RecoveryRecord,
  media: RecoveryMedia[],
): Promise<Blob> {
  record = validateRecord(record);
  await validateMedia(record, media);
  const entries: ZipEntry[] = [];
  const json = (name: string, value: unknown) =>
    entries.push({
      name,
      bytes: new TextEncoder().encode(JSON.stringify(value, null, 2)),
    });
  json("weave.project.json", record.project);
  if (record.editing) json("metadata/editing.json", record.editing);
  if (record.canvas) json("metadata/canvas.json", record.canvas);
  json("weave.backup.json", {
    format: "weave-backup",
    backupVersion: 1,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    record,
  });
  for (const asset of record.assets) {
    json(`metadata/assets/${asset.id}.json`, asset);
    entries.push({
      name: asset.relativePath,
      bytes: new Uint8Array(
        await media.find((item) => item.id === asset.id)!.blob.arrayBuffer(),
      ),
    });
  }
  for (const shot of record.shots) json(`metadata/shots/${shot.id}.json`, shot);
  for (const event of record.activities)
    json(`activity/${event.id}.json`, event);
  return createZip(entries);
}
export async function parseProjectArchive(
  file: Blob,
): Promise<{ record: RecoveryRecord; media: RecoveryMedia[] }> {
  const entries = await readZip(file);
  const headers = [...entries.keys()].filter((name) =>
    /(^|\/)weave\.project\.json$/.test(name),
  );
  if (headers.length !== 1)
    throw new Error("ZIP 内必须只有一个 Weave 工程，请选择完整项目备份。");
  const prefix = headers[0].slice(0, -"weave.project.json".length);
  const json = (name: string) =>
    JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        entries.get(prefix + name)!,
      ),
    );
  const header = json("weave.project.json");
  assertSchema(header.schemaVersion);
  let raw: unknown;
  if (entries.has(prefix + "weave.backup.json")) {
    const manifest = json("weave.backup.json");
    if (manifest.format !== "weave-backup" || manifest.backupVersion !== 1)
      throw new Error("备份格式不受支持");
    raw = manifest.record;
    if (object(object(raw).project).id !== header.id)
      throw new Error("备份工程标识不一致");
  } else {
    const list = (folder: string) =>
      [...entries.keys()]
        .filter(
          (name) =>
            new RegExp(`^${folder}/[a-f0-9-]{36}\\.json$`, "i").test(
              name.slice(prefix.length),
            ) && name.startsWith(prefix),
        )
        .map((name) => json(name.slice(prefix.length)));
    raw = {
      project: header,
      assets: list("metadata/assets"),
      shots: list("metadata/shots"),
      activities: list("activity"),
    };
    if (
      !object(raw).assets.length &&
      entries.has(prefix + "weave-manifest.json")
    ) {
      const manifest = json("weave-manifest.json");
      raw = {
        project: header,
        assets: manifest.assets,
        shots: manifest.shots || [],
        activities: [],
      };
    }
  }
  const record = validateRecord(raw);
  if (!record.editing && entries.has(prefix + "metadata/editing.json"))
    record.editing = validateEditing(
      json("metadata/editing.json"),
      record.assets,
    );
  if (!record.canvas && entries.has(prefix + "metadata/canvas.json"))
    record.canvas = validateCanvas(json("metadata/canvas.json"), record.assets);
  const media = record.assets.map((asset) => {
    const data = entries.get(prefix + asset.relativePath);
    if (!data) throw new Error(`备份缺少原片：${asset.name}`);
    return {
      id: asset.id,
      hash: asset.hash,
      blob: new Blob([data], { type: asset.mime }),
    };
  });
  await validateMedia(record, media);
  return { record, media };
}
