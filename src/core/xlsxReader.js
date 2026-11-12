// Dependency-free .xlsx reader: first worksheet -> 2-D array of strings / numbers / ISO dates.
// Input must already have passed security/fileGuard.inspectFile (zip bomb / macro checks).
const dec = new TextDecoder('utf-8');
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const MAX_OUT = 20 * 1024 * 1024;

function entries(bytes) {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Not a valid .xlsx file');
  const n = u16(bytes, eocd + 10), map = new Map(); let off = u32(bytes, eocd + 16);
  for (let i = 0; i < n; i++) {
    if (u32(bytes, off) !== 0x02014b50) throw new Error('Workbook directory is corrupt');
    const nl = u16(bytes, off + 28), ml = u16(bytes, off + 30), cl = u16(bytes, off + 32);
    map.set(dec.decode(bytes.subarray(off + 46, off + 46 + nl)), { method: u16(bytes, off + 10), size: u32(bytes, off + 20), usize: u32(bytes, off + 24), local: u32(bytes, off + 42) });
    off += 46 + nl + ml + cl;
  }
  return map;
}
async function read(bytes, e) {
  if (!e) return null;
  if (e.usize > MAX_OUT) throw new Error('Workbook part is too large');
  const start = e.local + 30 + u16(bytes, e.local + 26) + u16(bytes, e.local + 28), raw = bytes.subarray(start, start + e.size);
  if (e.method === 0) return dec.decode(raw);
  if (e.method !== 8) throw new Error('Unsupported zip compression');
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  if (buf.length > MAX_OUT) throw new Error('Workbook part is too large');
  return dec.decode(buf);
}
const unesc = (s) => s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (m, g) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[g.toLowerCase()] ?? (g[1] === 'x' || g[1] === 'X' ? String.fromCodePoint(parseInt(g.slice(2), 16)) : String.fromCodePoint(parseInt(g.slice(1), 10)))));
const texts = (x) => [...x.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unesc(m[1])).join('');
const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const serialToIso = (v) => { const d = new Date(Math.round((v - 25569) * 864e5)); return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : v; };

export async function readXlsxRows(bytes, { maxRows = 1001, maxCols = 30 } = {}) {
  const files = entries(bytes);
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = await read(bytes, files.get('xl/workbook.xml')), rels = await read(bytes, files.get('xl/_rels/workbook.xml.rels'));
  if (wb && rels) {
    const rid = wb.match(/<sheet\b[^>]*?\br:id="([^"]+)"/)?.[1];
    const target = rid && [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => t.includes(`Id="${rid}"`))?.match(/Target="([^"]+)"/)?.[1];
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }
  const sheet = await read(bytes, files.get(sheetPath));
  if (!sheet) throw new Error('No worksheet found in workbook');
  const sst = await read(bytes, files.get('xl/sharedStrings.xml'));
  const strings = sst ? [...sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1])) : [];
  const styles = await read(bytes, files.get('xl/styles.xml'));
  const custom = new Map(styles ? [...styles.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)].map((m) => [Number(m[1]), m[2]]) : []);
  const xfs = styles ? [...(styles.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/)?.[0] ?? '').matchAll(/<xf\b[^>]*>/g)].map((m) => Number(m[0].match(/numFmtId="(\d+)"/)?.[1] ?? 0)) : [];
  const isDate = (s) => { const id = xfs[s]; return id !== undefined && ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || /[dmy]/i.test((custom.get(id) ?? '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, ''))); };
  const rows = [];
  for (const rm of sheet.matchAll(/<row\b[^>]*?(?:\br="(\d+)")?[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(rm[1] ?? rows.length + 1) - 1; if (r >= maxRows) break;
    const cells = [];
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1], t = attrs.match(/\bt="(\w+)"/)?.[1], s = Number(attrs.match(/\bs="(\d+)"/)?.[1] ?? -1), body = cm[2] ?? '';
      const i = ref ? colIndex(ref) : cells.length; if (i >= maxCols) continue;
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let val = '';
      if (t === 's') val = strings[Number(v)] ?? '';
      else if (t === 'inlineStr') val = texts(body);
      else if (t === 'str' || t === 'e') val = unesc(v ?? '');
      else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
      else if (v !== undefined && v !== '') { const n = Number(v); val = Number.isFinite(n) ? (isDate(s) ? serialToIso(n) : n) : ''; }
      cells[i] = val;
    }
    for (let k = 0; k < cells.length; k++) if (cells[k] === undefined) cells[k] = '';
    rows[r] = cells;
  }
  return Array.from(rows, (r) => r ?? []).filter((r) => r.some((c) => String(c).trim() !== ''));
}
