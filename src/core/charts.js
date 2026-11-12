import { compact, currency } from '../utils/format.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Forest green / orange palette (red is reserved for poor performance)
export const COLORS = { est: '#1f5f46', act: '#e8913a', good: '#2e8b57', bad: '#c8412b', warn: '#e8913a', axis: '#7b8a80', text: '#23352c', grid: '#e4e8df', pv: '#8aa99a', ev: '#1f5f46', ac: '#e8913a' };
const PALETTE = ['#1f5f46', '#e8913a', '#5f9c7a', '#c8412b', '#a9c4a0', '#b8742a', '#3e7f9a', '#8a6d3b', '#7b8a80'];
const trunc = (s, n = 12) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const W = 640, H = 340, L = 64, R = 16, T = 44, B = 56;
const wrap = (title, desc, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}" font-family="Inter, system-ui, Segoe UI, Arial, sans-serif"><title>${esc(title)}</title><desc>${esc(desc)}</desc><text x="${L - 40}" y="22" font-size="14" font-weight="700" fill="${COLORS.text}">${esc(title)}</text>${body}</svg>`;
const legendItems = (items, xEnd = W - 16) => { let x = xEnd; let out = ''; for (const [color, label] of [...items].reverse()) { const w = 22 + label.length * 6.4; x -= w; out += `<rect x="${x}" y="31" width="10" height="10" rx="2" fill="${color}"/><text x="${x + 14}" y="40" font-size="11.5" fill="${COLORS.text}">${esc(label)}</text>`; } return out; };
const empty = (title, msg) => wrap(title, msg, `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="13" fill="${COLORS.axis}">${esc(msg)}</text>`);

function axes(min, max, ticks = 5) {
  const span = max - min || 1; const plotH = H - T - B;
  const y = (v) => T + plotH - ((v - min) / span) * plotH;
  let g = '';
  for (let i = 0; i <= ticks; i++) { const v = min + (span * i) / ticks; g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${COLORS.grid}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="${COLORS.axis}">${compact(v)}</text>`; }
  return { y, g };
}

export function groupedBarChart(categories) {
  const title = 'Estimated vs actual cost by category';
  const cats = categories.slice(0, 8);
  if (!cats.length) return empty(title, 'No cost data yet');
  const max = Math.max(1, ...cats.flatMap((c) => [c.estimated, c.actual]));
  const { y, g } = axes(0, max);
  const slot = (W - L - R) / cats.length, bw = Math.min(26, slot / 3);
  let bars = '';
  cats.forEach((c, i) => {
    const cx = L + slot * i + slot / 2;
    bars += `<rect x="${cx - bw - 1}" y="${y(c.estimated)}" width="${bw}" height="${Math.max(0, y(0) - y(c.estimated))}" rx="3" fill="${COLORS.est}"><title>${esc(c.category)} · Estimated: ${currency(c.estimated)}</title></rect>`;
    bars += `<rect x="${cx + 1}" y="${y(c.actual)}" width="${bw}" height="${Math.max(0, y(0) - y(c.actual))}" rx="3" fill="${COLORS.act}"><title>${esc(c.category)} · Actual: ${currency(c.actual)}</title></rect>`;
    bars += `<text x="${cx}" y="${H - B + 16}" text-anchor="middle" font-size="11" fill="${COLORS.text}">${esc(trunc(c.category))}</text>`;
  });
  return wrap(title, cats.map((c) => `${c.category}: estimated ${c.estimated}, actual ${c.actual}`).join('; '), g + bars + legendItems([[COLORS.est, 'Estimated'], [COLORS.act, 'Actual']]));
}

export function varianceChart(categories) {
  const title = 'Cost variance by category (Estimated − Actual)';
  const cats = categories.slice(0, 8);
  if (!cats.length) return empty(title, 'No cost data yet');
  const vals = cats.map((c) => c.variance);
  const hi = Math.max(0, ...vals), lo = Math.min(0, ...vals), pad = (hi - lo || 1) * 0.15;
  const { y, g } = axes(lo - (lo < 0 ? pad : pad / 3), hi + (hi > 0 ? pad : pad / 3));
  const slot = (W - L - R) / cats.length, bw = Math.min(40, slot * 0.6);
  let bars = `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="${COLORS.text}"/>`;
  cats.forEach((c, i) => {
    const cx = L + slot * i + slot / 2, top = Math.min(y(c.variance), y(0)), h = Math.abs(y(c.variance) - y(0));
    const col = c.variance < 0 ? COLORS.bad : COLORS.good;
    bars += `<rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${Math.max(h, 1)}" rx="3" fill="${col}"><title>${esc(c.category)} · Variance: ${currency(c.variance)}${c.pct === null ? '' : ` (${c.pct.toFixed(1)}%)`}</title></rect>`;
    bars += `<text x="${cx}" y="${H - B + 16}" text-anchor="middle" font-size="11" fill="${COLORS.text}">${esc(trunc(c.category))}</text>`;
    if (c.pct !== null) bars += `<text x="${cx}" y="${c.variance < 0 ? top + h + 13 : top - 5}" text-anchor="middle" font-size="11" font-weight="700" fill="${col}">${c.pct > 0 ? '+' : ''}${c.pct.toFixed(0)}%</text>`;
  });
  return wrap(title, cats.map((c) => `${c.category}: variance ${c.variance}`).join('; '), g + bars + legendItems([[COLORS.good, 'Under budget'], [COLORS.bad, 'Over budget']]));
}

export function donutChart(categories) {
  const title = 'Share of actual cost by category';
  const total = categories.reduce((s, c) => s + c.actual, 0);
  const cx = 170, cy = 190, r = 100, ir = 62;
  if (total <= 0) return empty(title, 'No spend recorded');
  let a0 = -Math.PI / 2, body = '', legend = '';
  const cats = categories.slice(0, 9);
  cats.forEach((c, i) => {
    const frac = c.actual / total, a1 = a0 + frac * Math.PI * 2, large = frac > 0.5 ? 1 : 0;
    const p = (a, rad) => `${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`;
    const tip = `<title>${esc(c.category)} · ${currency(c.actual)} (${(frac * 100).toFixed(1)}%)</title>`;
    if (frac >= 0.9999) body += `<circle cx="${cx}" cy="${cy}" r="${(r + ir) / 2}" fill="none" stroke="${PALETTE[i]}" stroke-width="${r - ir}">${tip}</circle>`;
    else if (frac > 0) body += `<path d="M ${p(a0, r)} A ${r} ${r} 0 ${large} 1 ${p(a1, r)} L ${p(a1, ir)} A ${ir} ${ir} 0 ${large} 0 ${p(a0, ir)} Z" fill="${PALETTE[i]}">${tip}</path>`;
    a0 = a1;
    legend += `<rect x="340" y="${72 + i * 24}" width="11" height="11" rx="2" fill="${PALETTE[i]}"/><text x="358" y="${82 + i * 24}" font-size="12" fill="${COLORS.text}">${esc(trunc(c.category, 22))} · ${(frac * 100).toFixed(1)}%</text>`;
  });
  body += `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="11" fill="${COLORS.axis}">Total actual</text><text x="${cx}" y="${cy + 17}" text-anchor="middle" font-size="16" font-weight="700" fill="${COLORS.text}">${compact(total)}</text>`;
  return wrap(title, cats.map((c) => `${c.category}: ${((c.actual / total) * 100).toFixed(1)}%`).join('; '), body + legend);
}

/** PV / EV / AC. Line chart over reporting snapshots when there is history, otherwise three bars. */
export function evmChart(snap, history = [], asOfLabel = 'Current') {
  const title = 'EVM performance: PV, EV and AC';
  const { pv, ev, ac } = snap.inputs;
  const vals = { pv, ev, ac };
  const known = ['pv', 'ev', 'ac'].filter((k) => typeof vals[k] === 'number');
  if (!known.length) return empty(title, 'Enter PV and EV to see EVM performance');
  const series = [['pv', 'PV (planned)', COLORS.pv], ['ev', 'EV (earned)', COLORS.ev], ['ac', 'AC (actual)', COLORS.ac]];
  const legend = legendItems(series.map(([, l, c]) => [c, l]));
  const pts = [...history.map((h) => ({ label: h.date.slice(2), pv: h.pv, ev: h.ev, ac: h.ac })), { label: asOfLabel, pv, ev, ac }];
  const complete = pts.every((p) => ['pv', 'ev', 'ac'].every((k) => typeof p[k] === 'number'));
  if (history.length && complete) {
    const max = Math.max(1, ...pts.flatMap((p) => [p.pv, p.ev, p.ac]));
    const { y, g } = axes(0, max);
    const x = (i) => L + 20 + ((W - L - R - 40) * i) / Math.max(1, pts.length - 1);
    let body = g;
    for (const [k, label, color] of series) {
      body += `<polyline fill="none" stroke="${color}" stroke-width="2.5" points="${pts.map((p, i) => `${x(i)},${y(p[k])}`).join(' ')}"/>`;
      pts.forEach((p, i) => { body += `<circle cx="${x(i)}" cy="${y(p[k])}" r="4.5" fill="${color}" stroke="#fff" stroke-width="1.5"><title>${esc(label)} · ${esc(p.label)}: ${currency(p[k])}</title></circle>`; });
    }
    pts.forEach((p, i) => { body += `<text x="${x(i)}" y="${H - B + 18}" text-anchor="middle" font-size="11" fill="${COLORS.text}">${esc(p.label)}</text>`; });
    return wrap(title, pts.map((p) => `${p.label}: PV ${p.pv}, EV ${p.ev}, AC ${p.ac}`).join('; '), body + legend);
  }
  const max = Math.max(1, ...known.map((k) => vals[k]));
  const { y, g } = axes(0, max);
  const slot = (W - L - R) / 3, bw = Math.min(70, slot * 0.55);
  let body = g;
  series.forEach(([k, label, color], i) => {
    const cx = L + slot * i + slot / 2;
    if (typeof vals[k] === 'number') body += `<rect x="${cx - bw / 2}" y="${y(vals[k])}" width="${bw}" height="${Math.max(1, y(0) - y(vals[k]))}" rx="4" fill="${color}"><title>${esc(label)}: ${currency(vals[k])}</title></rect><text x="${cx}" y="${y(vals[k]) - 6}" text-anchor="middle" font-size="12" font-weight="700" fill="${COLORS.text}">${compact(vals[k])}</text>`;
    else body += `<text x="${cx}" y="${y(0) - 8}" text-anchor="middle" font-size="11" fill="${COLORS.axis}">not entered</text>`;
    body += `<text x="${cx}" y="${H - B + 18}" text-anchor="middle" font-size="12" fill="${COLORS.text}">${esc(label)}</text>`;
  });
  return wrap(title, `PV ${pv ?? 'n/a'}, EV ${ev ?? 'n/a'}, AC ${ac ?? 'n/a'}`, body + legend);
}

/** Approved budget (BAC) versus the forecast final cost (EAC), with spend to date for reference. */
export function bacEacChart(snap) {
  const title = 'Project budget (BAC) vs forecast final cost (EAC)';
  const { bac, ac } = snap.inputs, { eac, vac } = snap.metrics;
  if (typeof bac !== 'number' || bac <= 0) return empty(title, 'Enter a budget (BAC) to compare with the forecast');
  if (eac === null) return empty(title, `EAC unavailable. ${snap.metrics.why.eac ?? 'Enter EV and AC.'}`);
  const bars = [['BAC · Budget', bac, COLORS.est], ['AC · Spent to date', ac, COLORS.act], ['EAC · Forecast final cost', eac, eac > bac ? COLORS.bad : COLORS.good]];
  const max = Math.max(...bars.map((b) => b[1]));
  const { y, g } = axes(0, max * 1.12);
  const slot = (W - L - R) / bars.length, bw = Math.min(80, slot * 0.55);
  let body = g;
  bars.forEach(([label, v, color], i) => {
    const cx = L + slot * i + slot / 2;
    body += `<rect x="${cx - bw / 2}" y="${y(v)}" width="${bw}" height="${Math.max(1, y(0) - y(v))}" rx="4" fill="${color}"><title>${esc(label)}: ${currency(v)}</title></rect><text x="${cx}" y="${y(v) - 6}" text-anchor="middle" font-size="12" font-weight="700" fill="${COLORS.text}">${compact(v)}</text><text x="${cx}" y="${H - B + 18}" text-anchor="middle" font-size="11" fill="${COLORS.text}">${esc(label)}</text>`;
  });
  body += `<line x1="${L}" x2="${W - R}" y1="${y(bac)}" y2="${y(bac)}" stroke="${COLORS.est}" stroke-dasharray="5 4"/>`;
  const verdict = vac >= 0 ? `Forecast ${compact(vac)} under budget` : `Forecast ${compact(-vac)} over budget`;
  body += `<text x="${L + 6}" y="${T - 2}" text-anchor="start" font-size="11.5" font-weight="700" fill="${vac >= 0 ? COLORS.good : COLORS.bad}">${esc(verdict)}</text>`;
  return wrap(title, `BAC ${bac}, EAC ${eac}, VAC ${vac}`, body);
}
