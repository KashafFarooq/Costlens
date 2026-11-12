// Tiny dependency-free PDF writer (A4, built-in Helvetica fonts, vector shapes). Enough for tables, KPI tiles and charts.
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HELVB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const MAP = { '−': '-', '–': '-', '—': '-', '·': '-', '•': '-', '≥': '>=', '≤': '<=', '’': "'", '‘': "'", '“': '"', '”': '"', '…': '...', '×': 'x', '÷': '/', '↗': '', '→': '->' };
export const pdfSafe = (s) => String(s ?? '').replace(/[^\x20-\x7e]/g, (c) => MAP[c] ?? (c.charCodeAt(0) < 256 && c.charCodeAt(0) > 160 ? c : '?')).replace(/[\u0000-\u001f]/g, ' ');
const esc = (s) => s.replace(/[\\()]/g, '\\$&');
const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(' '); };
const f2 = (n) => (Math.round(n * 100) / 100).toString();

export class Pdf {
  constructor({ title = 'Report', margin = 42 } = {}) { this.title = pdfSafe(title); this.pages = []; this.W = 595.28; this.H = 841.89; this.m = margin; this.newPage(); }
  newPage() { this.ops = []; this.pages.push(this.ops); this.y = this.m; this.footerNote && this.footer(); return this; }
  get bottom() { return this.H - this.m - 14; }
  ensure(h) { if (this.y + h > this.bottom) this.newPage(); }
  width(text, size, bold = false) { const t = HELV, tb = HELVB; return pdfSafe(text).split('').reduce((w, ch) => w + (bold ? tb : t)[ch.charCodeAt(0) - 32] * size / 1000 || w + size * 0.5, 0); }
  // y is measured from the TOP of the page in all public methods
  rect(x, y, w, h, { fill, stroke, lw = 0.8 } = {}) { const o = []; if (fill) o.push(`${hex(fill)} rg`); if (stroke) o.push(`${hex(stroke)} RG ${lw} w`); o.push(`${f2(x)} ${f2(this.H - y - h)} ${f2(w)} ${f2(h)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`); this.ops.push(o.join(' ')); }
  line(x1, y1, x2, y2, { color = '#cccccc', lw = 0.8, dash } = {}) { this.ops.push(`${hex(color)} RG ${lw} w ${dash ? `[${dash}] 0 d` : '[] 0 d'} ${f2(x1)} ${f2(this.H - y1)} m ${f2(x2)} ${f2(this.H - y2)} l S`); }
  polyline(points, { color = '#000000', lw = 1.5 } = {}) { if (points.length < 2) return; this.ops.push(`${hex(color)} RG ${lw} w [] 0 d ${points.map(([x, y], i) => `${f2(x)} ${f2(this.H - y)} ${i ? 'l' : 'm'}`).join(' ')} S`); }
  text(str, x, y, { size = 10, bold = false, color = '#23352c', align = 'left' } = {}) { // y = baseline from top
    const s = pdfSafe(str); const w = this.width(s, size, bold); const px = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    this.ops.push(`BT ${hex(color)} rg /${bold ? 'F2' : 'F1'} ${size} Tf ${f2(px)} ${f2(this.H - y)} Td (${esc(s)}) Tj ET`); }
  fit(str, maxW, size, bold = false) { let t = pdfSafe(str); if (this.width(t, size, bold) <= maxW) return t; while (t.length > 1 && this.width(`${t}...`, size, bold) > maxW) t = t.slice(0, -1); return `${t}...`; }
  wrap(str, maxW, size, bold = false) { const out = []; for (const para of pdfSafe(str).split('\n')) { let cur = ''; for (const word of para.split(' ')) { const t = cur ? `${cur} ${word}` : word; if (cur && this.width(t, size, bold) > maxW) { out.push(cur); cur = word; } else cur = t; } out.push(cur); } return out; }
  paragraph(str, { size = 10, bold = false, color = '#23352c', x = this.m, w = this.W - 2 * this.m, gap = 4 } = {}) { const lh = size * 1.4; for (const ln of this.wrap(str, w, size, bold)) { this.ensure(lh); this.text(ln, x, this.y + size, { size, bold, color }); this.y += lh; } this.y += gap; }
  bullets(items, opts = {}) { for (const it of items) { const lh = 14; this.ensure(lh); this.text('-', this.m + 4, this.y + 10, { size: 10, color: '#e8913a', bold: true }); this.paragraph(it, { ...opts, x: this.m + 16, w: this.W - 2 * this.m - 16, gap: 2 }); } this.y += 4; }
  heading(str, { size = 13, keep = 0 } = {}) { this.ensure(Math.max(size + 22, keep)); this.y += 8; this.text(str, this.m, this.y + size, { size, bold: true, color: '#1f5f46' }); this.y += size + 4; this.line(this.m, this.y, this.W - this.m, this.y, { color: '#1f5f46', lw: 1.2 }); this.y += 8; }
  tiles(items, cols = 4) { // [{ label, value, color, sub }]
    const gap = 8, w = (this.W - 2 * this.m - gap * (cols - 1)) / cols, h = 48;
    for (let i = 0; i < items.length; i += cols) { this.ensure(h + gap);
      items.slice(i, i + cols).forEach((it, j) => { const x = this.m + j * (w + gap); this.rect(x, this.y, w, h, { fill: '#f7f4ea', stroke: '#e4e8df' }); this.rect(x, this.y, 3, h, { fill: it.color ?? '#1f5f46' });
        const iw = w - 16; this.text(this.fit(it.label, iw, 8, true), x + 10, this.y + 14, { size: 8, color: '#5d6e64', bold: true }); this.text(this.fit(it.value, iw, 12, true), x + 10, this.y + 31, { size: 12, bold: true, color: it.color ?? '#23352c' }); if (it.sub) this.text(this.fit(it.sub, iw, 7.5), x + 10, this.y + 43, { size: 7.5, color: '#7b8a80' }); });
      this.y += h + gap; } }
  table(heads, rows, { widths, aligns = [], size = 8.5 } = {}) {
    const total = this.W - 2 * this.m, ws = widths ?? heads.map(() => total / heads.length), sc = total / ws.reduce((a, b) => a + b, 0), cw = ws.map((w) => w * sc);
    const drawHead = () => { this.ensure(20); this.rect(this.m, this.y, total, 18, { fill: '#1f5f46' }); let x = this.m; heads.forEach((h, i) => { const r = aligns[i] === 'r'; this.text(h, r ? x + cw[i] - 5 : x + 5, this.y + 12, { size, bold: true, color: '#ffffff', align: r ? 'right' : 'left' }); x += cw[i]; }); this.y += 18; };
    drawHead();
    rows.forEach((row, ri) => { const cells = row.map((c, i) => this.wrap(typeof c === 'object' && c ? c.t : c, cw[i] - 10, size)); const lines = Math.max(...cells.map((c) => c.length)), h = lines * (size + 3) + 6;
      if (this.y + h > this.bottom) { this.newPage(); drawHead(); }
      if (ri % 2 === 0) this.rect(this.m, this.y, total, h, { fill: '#fbfaf4' });
      let x = this.m; row.forEach((c, i) => { const col = typeof c === 'object' && c?.c ? c.c : '#23352c', r = aligns[i] === 'r'; cells[i].forEach((ln, k) => this.text(ln, r ? x + cw[i] - 5 : x + 5, this.y + 4 + size + k * (size + 3) - 1, { size, color: col, align: r ? 'right' : 'left', bold: typeof c === 'object' && c?.b })); x += cw[i]; });
      this.y += h; });
    this.line(this.m, this.y, this.W - this.m, this.y, { color: '#e4e8df' }); this.y += 8; }
  footer() { /* replaced by finish() */ }
  finish(footerText = '') {
    const objs = []; const add = (s) => { objs.push(s); return objs.length; };
    const fontA = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'), fontB = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const pagesId = objs.length + 1 + this.pages.length * 2; const kids = [];
    this.pages.forEach((ops, i) => {
      const foot = `BT ${hex('#7b8a80')} rg /F1 7.5 Tf ${f2(this.m)} 24 Td (${esc(pdfSafe(footerText))}) Tj ET BT ${hex('#7b8a80')} rg /F1 7.5 Tf ${f2(this.W - this.m - 40)} 24 Td (Page ${i + 1} of ${this.pages.length}) Tj ET`;
      const content = `${ops.join('\n')}\n${foot}`; const c = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${f2(this.W)} ${f2(this.H)}] /Resources << /Font << /F1 ${fontA} 0 R /F2 ${fontB} 0 R >> >> /Contents ${c} 0 R >>`));
    });
    add(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`);
    const info = add(`<< /Title (${esc(this.title)}) /Producer (CostLens) /Creator (CostLens) >>`), root = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    let out = '%PDF-1.4\n'; const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length; out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root ${root} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Uint8Array.from(out, (ch) => ch.charCodeAt(0) & 255);
  }
}
