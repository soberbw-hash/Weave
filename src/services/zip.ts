/** Portable ZIP writer: STORE compression, UTF-8 names, and CRC32 (no dependency). */
export type ZipEntry = { name: string; bytes: Uint8Array; modifiedAt?: Date };

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++)
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});

export function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes)
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

export function createZip(entries: ZipEntry[]): Blob {
  if (entries.length > 0xffff)
    throw new Error("导出文件过多，请分批导出（ZIP64 暂不支持）");
  const chunks: BlobPart[] = [];
  const central: Uint8Array[] = [];
  const names = new Set<string>();
  let offset = 0;
  let centralSize = 0;
  for (const entry of entries) {
    if (
      !entry.name ||
      entry.name.startsWith("/") ||
      /[\\\x00-\x1f:]/.test(entry.name) ||
      entry.name
        .split("/")
        .some((part) => !part || part === "." || part === "..")
    ) {
      throw new Error("ZIP 文件路径无效");
    }
    if (names.has(entry.name.toLowerCase()))
      throw new Error(`ZIP 文件名重复：${entry.name}`);
    names.add(entry.name.toLowerCase());
    const name = new TextEncoder().encode(entry.name);
    if (name.length > 0xffff || entry.bytes.length > 0xffffffff)
      throw new Error("文件过大，ZIP64 暂不支持");
    const date =
      entry.modifiedAt && Number.isFinite(entry.modifiedAt.getTime())
        ? entry.modifiedAt
        : new Date();
    const year = Math.min(2107, Math.max(1980, date.getFullYear()));
    const time =
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      (date.getSeconds() >> 1);
    const day =
      ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    const checksum = crc32(entry.bytes);
    const local = new Uint8Array(30 + name.length);
    const header = new DataView(local.buffer);
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 0x0800, true);
    header.setUint16(10, time, true);
    header.setUint16(12, day, true);
    header.setUint32(14, checksum, true);
    header.setUint32(18, entry.bytes.length, true);
    header.setUint32(22, entry.bytes.length, true);
    header.setUint16(26, name.length, true);
    local.set(name, 30);
    const record = new Uint8Array(46 + name.length);
    const view = new DataView(record.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0x0800, true);
    view.setUint16(12, time, true);
    view.setUint16(14, day, true);
    view.setUint32(16, checksum, true);
    view.setUint32(20, entry.bytes.length, true);
    view.setUint32(24, entry.bytes.length, true);
    view.setUint16(28, name.length, true);
    view.setUint32(42, offset, true);
    record.set(name, 46);
    chunks.push(local, entry.bytes);
    central.push(record);
    offset += local.length + entry.bytes.length;
    centralSize += record.length;
    if (offset + centralSize + 22 > 0xffffffff)
      throw new Error("导出超过 4 GB，请分批导出（ZIP64 暂不支持）");
  }
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, entries.length, true);
  view.setUint16(10, entries.length, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end], { type: "application/zip" });
}

/** Bounded ZIP reader for Weave recovery. Never evaluates archive contents. */
export async function readZip(file: Blob): Promise<Map<string, Uint8Array>> {
  const maxPacked = 512 * 1024 * 1024;
  const maxExpanded = 1024 * 1024 * 1024;
  if (file.size > maxPacked) throw new Error("此 ZIP 超过浏览器恢复的 512 MB 上限，请在桌面端解压后打开项目。");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const requireRange = (offset: number, length: number) => {
    if (offset < 0 || length < 0 || offset + length > bytes.length)
      throw new Error("ZIP 文件不完整或已损坏");
  };
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  if (end < 0) throw new Error("不是完整的 ZIP 文件");
  const count = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  const centralStart = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count || count === 65535 || centralStart === 0xffffffff)
    throw new Error("暂不支持分卷 ZIP 或 ZIP64，请在桌面端解压后打开项目");
  if (count > 20000 || centralStart + centralSize !== end) throw new Error("ZIP 目录无效或文件过多");
  const result = new Map<string, Uint8Array>();
  const names = new Set<string>();
  const offsets = new Set<number>();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let cursor = centralStart, expanded = 0;
  for (let i = 0; i < count; i++) {
    requireRange(cursor, 46);
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("ZIP 目录损坏");
    const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true);
    const checksum = view.getUint32(cursor + 16, true), packed = view.getUint32(cursor + 20, true), size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true), extraLength = view.getUint16(cursor + 30, true), commentLength = view.getUint16(cursor + 32, true);
    const offset = view.getUint32(cursor + 42, true);
    requireRange(cursor + 46, nameLength + extraLength + commentLength);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    const parts = name.replace(/\/$/, "").split("/");
    if (!name || /[\\:\x00-\x1f]/.test(name) || parts.some((part) => !part || part === "." || part === "..") || names.has(name.toLowerCase()))
      throw new Error("ZIP 包含危险路径或重复文件名");
    names.add(name.toLowerCase());
    if (flags & 1 || ![0, 8].includes(method) || ((view.getUint32(cursor + 38, true) >>> 16) & 0xf000) === 0xa000)
      throw new Error("不支持加密、链接或此压缩格式的 ZIP");
    if (view.getUint16(cursor + 34, true) || size === 0xffffffff || packed === 0xffffffff || offset === 0xffffffff || offsets.has(offset))
      throw new Error("ZIP 目录或文件位置无效");
    offsets.add(offset);
    expanded += size;
    if (expanded > maxExpanded || size > maxExpanded) throw new Error("ZIP 展开超过 1 GB，请在桌面端解压后打开项目");
    requireRange(offset, 30);
    if (view.getUint32(offset, true) !== 0x04034b50 || view.getUint16(offset + 8, true) !== method || view.getUint16(offset + 6, true) !== flags)
      throw new Error("ZIP 文件头不一致");
    const localName = view.getUint16(offset + 26, true), localExtra = view.getUint16(offset + 28, true);
    requireRange(offset + 30, localName + localExtra);
    if (decoder.decode(bytes.subarray(offset + 30, offset + 30 + localName)) !== name) throw new Error("ZIP 文件名不一致");
    const start = offset + 30 + localName + localExtra;
    requireRange(start, packed);
    if (start + packed > centralStart) throw new Error("ZIP 文件数据位置无效");
    cursor += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) { if (size) throw new Error("ZIP 目录内容无效"); continue; }
    let data: Uint8Array;
    if (method === 0) data = bytes.slice(start, start + packed);
    else {
      let stream: DecompressionStream;
      try { stream = new DecompressionStream("deflate-raw"); }
      catch { throw new Error("浏览器不支持此 ZIP 压缩方式，请更新获批浏览器或在桌面端解压。"); }
      const reader = new Blob([bytes.slice(start, start + packed)]).stream().pipeThrough(stream).getReader();
      const pieces: Uint8Array[] = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.length;
          if (total > size) { await reader.cancel(); throw new Error("ZIP 展开大小与目录不符"); }
          pieces.push(value);
        }
      } finally { reader.releaseLock(); }
      data = new Uint8Array(total);
      let at = 0;
      for (const piece of pieces) { data.set(piece, at); at += piece.length; }
    }
    if (data.length !== size || crc32(data) !== checksum) throw new Error(`ZIP 文件校验失败：${name}`);
    result.set(name, data);
  }
  if (cursor !== centralStart + centralSize) throw new Error("ZIP 目录长度不一致");
  return result;
}
