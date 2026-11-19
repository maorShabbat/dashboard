/**
 * Minimal ZIP codec. Writes "stored" archives with a fixed timestamp (so identical content gives identical bytes)
 * and reads stored + deflate archives, so bundles survive being re-zipped by OS tools.
 * Hardened for import: path traversal, absolute paths, duplicate names, oversize entries and ZIP64 are rejected.
 */

export interface ZipEntry { path: string; data: Uint8Array }

export interface ZipLimits {
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = { maxEntries: 2000, maxEntryBytes: 64 * 1024 * 1024, maxTotalBytes: 256 * 1024 * 1024 };

let crcTable: Uint32Array | null = null;
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export class ZipError extends Error {}

export function assertSafeZipPath(path: string): void {
  if (!path || path.length > 240) throw new ZipError(`Invalid entry name length: "${path}"`);
  if (path.includes('\\') || path.includes('\0')) throw new ZipError(`Unsafe entry name: "${path}"`);
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) throw new ZipError(`Absolute entry name rejected: "${path}"`);
  if (path.split('/').some((seg) => seg === '..' || seg === '.' || seg === '')) throw new ZipError(`Path traversal rejected: "${path}"`);
}

export function createZip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const seen = new Set<string>();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    assertSafeZipPath(e.path);
    if (seen.has(e.path)) throw new ZipError(`Duplicate entry: ${e.path}`);
    seen.add(e.path);
    const name = enc.encode(e.path);
    const crc = crc32(e.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, 0, true); // time 00:00
    lv.setUint16(12, 0x21, true); // date 1980-01-01
    lv.setUint32(14, crc, true);
    lv.setUint32(18, e.data.length, true);
    lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, e.data.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local, e.data);
    centrals.push(central);
    offset += local.length + e.data.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const total = offset + centralSize + 22;
  if (total > 0xffffffff) throw new ZipError('Archive exceeds 4 GiB (ZIP64 unsupported)');
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of [...locals, ...centrals, end]) { out.set(part, p); p += part.length; }
  return out;
}

async function inflateRaw(data: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) { await reader.cancel(); throw new ZipError('Entry exceeds the maximum allowed size'); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

export async function readZip(bytes: Uint8Array, limits: ZipLimits = DEFAULT_ZIP_LIMITS): Promise<ZipEntry[]> {
  if (bytes.length < 22) throw new ZipError('Not a ZIP archive (too small)');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipError('Not a ZIP archive (no end-of-central-directory record)');
  const count = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) throw new ZipError('ZIP64 archives are not supported');
  if (count > limits.maxEntries) throw new ZipError(`Too many entries (${count})`);
  if (cdOffset + cdSize > bytes.length) throw new ZipError('Corrupt ZIP: central directory out of range');

  const dec = new TextDecoder('utf-8', { fatal: true });
  const out: ZipEntry[] = [];
  const seen = new Set<string>();
  let total = 0;
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new ZipError('Corrupt ZIP: bad central directory entry');
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true);
    const xlen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    let name: string;
    try { name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen)); } catch { throw new ZipError('Entry name is not valid UTF-8'); }
    p += 46 + nlen + xlen + clen;
    if (flags & 1) throw new ZipError(`Encrypted entries are not supported: ${name}`);
    if (name.endsWith('/')) continue; // directory entry
    assertSafeZipPath(name);
    if (seen.has(name)) throw new ZipError(`Duplicate entry: ${name}`);
    seen.add(name);
    if (usize > limits.maxEntryBytes) throw new ZipError(`Entry too large: ${name}`);
    total += usize;
    if (total > limits.maxTotalBytes) throw new ZipError('Archive expands beyond the maximum allowed size');
    if (lho + 30 > bytes.length || dv.getUint32(lho, true) !== 0x04034b50) throw new ZipError(`Corrupt local header: ${name}`);
    const lnlen = dv.getUint16(lho + 26, true);
    const lxlen = dv.getUint16(lho + 28, true);
    const start = lho + 30 + lnlen + lxlen;
    if (start + csize > bytes.length) throw new ZipError(`Corrupt ZIP: data out of range for ${name}`);
    const raw = bytes.subarray(start, start + csize);
    let data: Uint8Array;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = await inflateRaw(raw, limits.maxEntryBytes);
    else throw new ZipError(`Unsupported compression method ${method}: ${name}`);
    if (data.length !== usize) throw new ZipError(`Size mismatch: ${name}`);
    if (crc32(data) !== crc) throw new ZipError(`CRC mismatch: ${name}`);
    out.push({ path: name, data });
  }
  return out;
}
