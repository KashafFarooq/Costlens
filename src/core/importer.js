import { FILE_LIMITS } from '../security/fileGuard.js';
import { validateCostItem, newId, toMoney } from './costValidation.js';

// RFC 4180 style parser with delimiter detection. Pure text in, 2-D array out.
export function parseCsv(text) {
  const src = text.replace(/^\uFEFF/, '');
  const first = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"' && cell === '') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); cell = ''; rows.push(row); row = []; if (rows.length > FILE_LIMITS.maxRows + 1) throw new Error(`Too many rows (max ${FILE_LIMITS.maxRows})`); }
    else cell += c;
    if (row.length > FILE_LIMITS.maxCols) throw new Error('Too many columns');
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}

const ALIASES = {
  category: ['category', 'group', 'work package', 'wbs', 'type', 'department', 'cost code'],
  description: ['description', 'item', 'name', 'expense', 'task', 'details', 'cost item'],
  estimated: ['estimated', 'estimate', 'estimated cost', 'budget', 'planned', 'planned cost', 'budgeted', 'baseline', 'est'],
  actual: ['actual', 'actual cost', 'spent', 'spend', 'cost', 'amount', 'actuals'],
};
const norm = (h) => String(h ?? '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

export function rowsToItems(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return { items: [], errors: [{ row: 1, message: 'File needs a header row and at least one data row' }], headerMap: {} };
  if (rows.length - 1 > FILE_LIMITS.maxRows) return { items: [], errors: [{ row: 0, message: `Too many rows (max ${FILE_LIMITS.maxRows})` }], headerMap: {} };
  const headers = rows[0].map(norm);
  const map = {};
  for (const [field, names] of Object.entries(ALIASES)) { const idx = headers.findIndex((h) => names.includes(h)); if (idx >= 0) map[field] = idx; }
  const missing = ['estimated', 'actual'].filter((f) => map[f] === undefined);
  if (map.description === undefined && map.category === undefined) missing.unshift('description');
  if (missing.length) return { items: [], errors: [{ row: 1, message: `Missing required column(s): ${missing.join(', ')}. Expected headers such as Category, Description, Estimated Cost, Actual Cost.` }], headerMap: map };
  const items = [], errors = [];
  rows.slice(1).forEach((r, i) => {
    const pick = (f) => (map[f] === undefined ? '' : r[map[f]]);
    const res = validateCostItem({ category: pick('category'), description: pick('description') || pick('category'), estimated: pick('estimated'), actual: pick('actual') });
    if (res.valid) items.push({ id: newId(), ...res.value }); else errors.push({ row: i + 2, message: res.errors[0] });
  });
  return { items, errors, headerMap: map };
}

/* ---------- EVM values import (BAC / PV / EV / AC, optional dates) ---------- */
const EVM_ALIASES = {
  bac: ['bac', 'budget at completion', 'total budget', 'approved budget'],
  pv: ['pv', 'planned value', 'bcws'],
  ev: ['ev', 'earned value', 'bcwp'],
  ac: ['ac', 'actual cost', 'actual cost to date', 'acwp'],
  asOf: ['date', 'status date', 'as of', 'reporting date'],
  start: ['start', 'planned start', 'start date'],
  end: ['end', 'finish', 'planned finish', 'planned end', 'end date'],
};
const isoDate = (v) => { const t = String(v ?? '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : ''; };

/**
 * Accepts either layout:
 *   horizontal: header row with BAC, PV, EV, AC columns (the LAST data row is used)
 *   vertical:   rows of  Metric | Value  (e.g. "EV", 9800000)
 * Returns { values: { bac?, pv?, ev?, ac?, asOf?, start?, end? }, errors: [{ row, message }] }.
 */
export function rowsToEvm(rows) {
  const errors = [], values = {};
  if (!Array.isArray(rows) || rows.length < 2) return { values, errors: [{ row: 1, message: 'File needs a header row and at least one data row' }] };
  const take = (field, raw, row) => {
    if (raw === '' || raw === null || raw === undefined) return;
    if (['asOf', 'start', 'end'].includes(field)) { const d = isoDate(raw instanceof Date ? raw.toISOString().slice(0, 10) : raw); if (d) values[field] = d; else errors.push({ row, message: `${field}: use YYYY-MM-DD dates` }); return; }
    const r = toMoney(raw, field.toUpperCase());
    if (r.error) errors.push({ row, message: r.error }); else values[field] = r.value;
  };
  const headers = rows[0].map(norm), find = (f) => headers.findIndex((x) => EVM_ALIASES[f].includes(x));
  const cols = Object.fromEntries(Object.keys(EVM_ALIASES).map((f) => [f, find(f)]));
  if (['bac', 'pv', 'ev', 'ac'].some((f) => cols[f] >= 0)) {
    const last = rows.length - 1;
    for (const [f, i] of Object.entries(cols)) if (i >= 0) take(f, rows[last][i], last + 1);
  } else {
    rows.forEach((r, i) => { const key = Object.keys(EVM_ALIASES).find((f) => EVM_ALIASES[f].includes(norm(r[0]))); if (key) take(key, r[1], i + 1); });
  }
  if (!Object.keys(values).some((k) => ['bac', 'pv', 'ev', 'ac'].includes(k)) && !errors.length) errors.push({ row: 1, message: 'No BAC, PV, EV or AC values found. Use columns named BAC, PV, EV, AC (or rows such as "EV, 9800000").' });
  if (values.bac !== undefined && values.bac <= 0) { errors.push({ row: 1, message: 'BAC must be greater than 0' }); delete values.bac; }
  if (values.bac !== undefined) for (const k of ['pv', 'ev']) if (values[k] !== undefined && values[k] > values.bac) errors.push({ row: 1, message: `${k.toUpperCase()} cannot exceed BAC` });
  return { values, errors };
}

export const EVM_TEMPLATE_CSV = 'BAC,PV,EV,AC,Status Date,Planned Start,Planned Finish\n12220000,10400000,9800000,14565000,2026-11-12,2026-03-01,2027-01-31\n';
