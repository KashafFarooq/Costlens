// Pre-parse checks for uploaded files. Nothing is parsed until these pass.
export const FILE_LIMITS = { maxBytes: 2 * 1024 * 1024, maxUncompressed: 20 * 1024 * 1024, maxZipEntries: 200, maxRows: 1000, maxCols: 30 };

const MIME = {
  csv: ['', 'text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel'],
  xlsx: ['', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
};
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u16 = (b, o) => b[o] | (b[o + 1] << 8);

// Walks the zip central directory (no decompression) to catch zip bombs and macro payloads.
export function inspectZip(bytes) {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return 'File is not a valid .xlsx (zip directory not found)';
  const entries = u16(bytes, eocd + 10);
  if (entries > FILE_LIMITS.maxZipEntries) return 'Workbook contains too many internal parts';
  let off = u32(bytes, eocd + 16), total = 0;
  for (let i = 0; i < entries; i++) {
    if (off + 46 > bytes.length || u32(bytes, off) !== 0x02014b50) return 'Workbook directory is corrupt';
    total += u32(bytes, off + 24);
    const n = u16(bytes, off + 28), m = u16(bytes, off + 30), k = u16(bytes, off + 32);
    const name = new TextDecoder().decode(bytes.subarray(off + 46, off + 46 + n)).toLowerCase();
    if (name.includes('vbaproject') || name.includes('..') || name.startsWith('/')) return 'Workbook contains macros or unsafe paths';
    if (total > FILE_LIMITS.maxUncompressed) return 'Workbook expands to an unsafe size';
    off += 46 + n + m + k;
  }
  return null;
}

// meta = { name, size, type }; head = first bytes of the file (Uint8Array, up to full file for xlsx).
export function inspectFile(meta, bytes) {
  const name = String(meta.name ?? '');
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  if (!['csv', 'xlsx'].includes(ext)) return { ok: false, error: `Unsupported file type ".${ext || '?'}". Only .csv and .xlsx are accepted.` };
  if (!meta.size) return { ok: false, error: 'File is empty' };
  if (meta.size > FILE_LIMITS.maxBytes) return { ok: false, error: 'File exceeds the 2 MB limit' };
  if (!MIME[ext].includes(meta.type ?? '')) return { ok: false, error: `Declared type "${meta.type}" does not match .${ext}` };
  const startsWith = (...sig) => sig.every((s, i) => bytes[i] === s);
  if (startsWith(0x4d, 0x5a) || startsWith(0x7f, 0x45, 0x4c, 0x46) || startsWith(0x25, 0x50, 0x44, 0x46) || startsWith(0x23, 0x21)) return { ok: false, error: 'File content is an executable, script or PDF, not a spreadsheet' };
  if (ext === 'xlsx') {
    if (!startsWith(0x50, 0x4b, 0x03, 0x04)) return { ok: false, error: 'File content is not a real .xlsx workbook (bad signature)' };
    const zipError = inspectZip(bytes);
    return zipError ? { ok: false, error: zipError } : { ok: true, kind: 'xlsx' };
  }
  if (startsWith(0x50, 0x4b) || startsWith(0xd0, 0xcf, 0x11, 0xe0)) return { ok: false, error: 'File content is a binary workbook, not CSV text' };
  if (bytes.subarray(0, 4096).includes(0)) return { ok: false, error: 'File contains binary data and is not valid CSV text' };
  return { ok: true, kind: 'csv' };
}
