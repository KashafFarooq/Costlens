// Reusable UI building blocks. All text goes through h() (textContent), SVG through DOMParser; no inline style attributes (CSP-safe).
import { h, svgNode } from './dom.js';

const ICONS = {
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16.5" cy="14.5" r="1"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  scale: '<path d="M12 4v16M5 20h14"/><path d="M5 7h14"/><path d="M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.2"/><circle cx="17" cy="17" r="2.2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M15 10.5c3 .2 6 1.3 6 2.9v3.6c0 1.7-2.7 3-6 3-1.9 0-3.6-.4-4.7-1.1"/>',
  gauge: '<path d="M3.3 17a9 9 0 1 1 17.4 0"/><path d="m12 14 4-5"/><circle cx="12" cy="14" r="1.2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>',
  alert: '<path d="M12 3 22 20H2z"/><path d="M12 10v4M12 17h.01"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  bars: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
};
export const icon = (name, cls = 'ico') => { const n = svgNode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] ?? ICONS.bars}</svg>`); n.setAttribute('class', cls); return n; };

/** tone: good | warn | bad | na | neutral */
export const kpiCard = ({ label, abbr, value, hint, tone = 'neutral', icon: ic = 'bars', testid, big = false }) =>
  h('article', { class: `kpi ${tone}${big ? ' big' : ''}`, 'data-testid': testid },
    h('div', { class: 'kpi-top' }, h('span', { class: 'kpi-ico' }, icon(ic)), h('span', { class: 'kpi-label' }, abbr ? h('b', {}, abbr) : null, abbr ? ` · ${label}` : label)),
    h('strong', { class: `kpi-value${value === '—' ? ' dash' : ''}` }, value),
    hint ? h('small', { class: 'kpi-hint' }, hint) : null);

export const badge = (text, tone = 'neutral') => h('span', { class: `badge ${tone}` }, text);
export const bar = (pct, tone = 'good') => { const i = h('i', { class: tone }); i.style.width = `${Math.max(0, Math.min(100, pct))}%`; return h('div', { class: 'bar', role: 'presentation' }, i); };

export function table(heads, body, foot, { aligns = [] } = {}) {
  const cell = (c, i) => (Array.isArray(c) ? h('td', { class: c[1] }, c[0]) : h('td', { class: aligns[i] === 'r' ? 'n' : '' }, c));
  return h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...heads.map((x, i) => h('th', { class: aligns[i] === 'r' ? 'n' : '' }, x)))), h('tbody', {}, ...body.map((r) => h('tr', {}, ...r.map(cell)))), foot ? h('tfoot', {}, h('tr', {}, ...foot.map(cell))) : null));
}

/* ---- chart tooltips: <title> children become data-tip and show in a floating label (native tooltip as fallback) ---- */
let tipEl;
const tip = () => (tipEl ??= document.body.appendChild(h('div', { class: 'tip', role: 'tooltip' })));
export function chartNode(markup) {
  const svg = svgNode(markup);
  svg.querySelectorAll('title').forEach((t) => { if (t.parentNode !== svg) { t.parentNode.setAttribute('data-tip', t.textContent); t.remove(); } });
  const show = (e) => { const t = e.target.closest?.('[data-tip]'); const el = tip(); if (!t) { el.classList.remove('show'); return; } el.textContent = t.getAttribute('data-tip'); el.classList.add('show'); const x = Math.min(window.innerWidth - el.offsetWidth - 8, e.clientX + 14); el.style.left = `${Math.max(8, x)}px`; el.style.top = `${e.clientY + 16}px`; };
  svg.addEventListener('pointermove', show); svg.addEventListener('pointerdown', show); svg.addEventListener('pointerleave', () => tip().classList.remove('show'));
  svg.querySelectorAll('[data-tip]').forEach((n) => n.classList.add('tipped'));
  return svg;
}
