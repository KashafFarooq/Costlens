// Unified CostLens project: cost line items + EVM inputs in one validated, persisted document.
import { StorageError } from '../core/errors.js';
import { validateCostProject, cleanText, newId } from '../core/costValidation.js';
import { validateDate, parseDecimal } from '../core/validation.js';
import { emptyEvm } from '../core/evm.js';

const KEY = 'costlens:project:v2';
const OLD_COST_KEY = 'cost-tracker:v1';
const OLD_EVM_KEY = 'evm-tracker:v1';
const MAX_MONEY = 1_000_000_000_000;

export { emptyEvm };
export const emptyProject = () => ({ version: 2, name: 'My Project', threshold: 10, items: [], evm: emptyEvm() });

const money = (v) => v === null || v === undefined || v === '' ? null : (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_MONEY ? Math.round(v * 100) / 100 : undefined);

/** Returns { valid, errors, value } for an EVM block. null means "not entered yet". */
export function validateEvm(e) {
  const errors = [];
  if (!e || typeof e !== 'object') return { valid: false, errors: ['EVM data is malformed'], value: emptyEvm() };
  const v = emptyEvm();
  if (!['linked', 'manual'].includes(e.bacMode)) errors.push('BAC mode is invalid'); else v.bacMode = e.bacMode;
  if (!['linked', 'override'].includes(e.acMode)) errors.push('AC mode is invalid'); else v.acMode = e.acMode;
  for (const k of ['bac', 'pv', 'ev', 'ac']) { const m = money(e[k]); if (m === undefined) errors.push(`${k.toUpperCase()} must be a non-negative number`); else v[k] = m; }
  if (v.bac === 0) errors.push('BAC must be greater than 0');
  for (const k of ['start', 'end', 'asOf']) { if (e[k]) { const er = validateDate(e[k], k); if (er) errors.push(er); else v[k] = e[k]; } }
  if (v.start && v.end && v.end <= v.start) errors.push('Planned finish must be after planned start');
  const hist = Array.isArray(e.history) ? e.history : [];
  if (hist.length > 200) errors.push('Too many history snapshots');
  let prev = '';
  for (const s of hist.slice(0, 200)) {
    const d = validateDate(s?.date, 'Snapshot date');
    const ok = !d && ['pv', 'ev', 'ac'].every((k) => typeof s[k] === 'number' && Number.isFinite(s[k]) && s[k] >= 0 && s[k] <= MAX_MONEY) && s.date > prev;
    if (!ok) { errors.push(`Snapshot ${s?.date ?? '?'} is invalid`); continue; }
    prev = s.date; v.history.push({ date: s.date, pv: s.pv, ev: s.ev, ac: s.ac });
  }
  return { valid: errors.length === 0, errors, value: v };
}

export function validateProject(p) {
  const base = validateCostProject(p);
  if (!base.valid) return base;
  const ev = validateEvm(p.evm ?? emptyEvm());
  return { valid: ev.valid, errors: ev.errors };
}

const normalise = (p) => ({ version: 2, name: cleanText(p.name), threshold: Number(p.threshold),
  items: p.items.map((i) => ({ id: typeof i.id === 'string' ? i.id.slice(0, 64) : newId(), category: i.category, description: i.description, estimated: i.estimated, actual: i.actual })),
  evm: validateEvm(p.evm ?? emptyEvm()).value });

// Pre-v2 builds kept cost data and EVM data under separate keys; fold them into one project.
function migrate() {
  try {
    const rawCost = localStorage.getItem(OLD_COST_KEY);
    if (!rawCost) return null;
    const cost = JSON.parse(rawCost);
    if (!validateCostProject(cost).valid) return null;
    const project = { version: 2, name: cost.name, threshold: cost.threshold, items: cost.items, evm: emptyEvm() };
    try {
      const old = JSON.parse(localStorage.getItem(OLD_EVM_KEY) ?? 'null');
      const last = old?.entries?.at?.(-1);
      if (old && last) {
        Object.assign(project.evm, { bacMode: 'manual', bac: Number(old.bac) || null, start: old.start || '', end: old.end || '', asOf: last.date, pv: last.pv, ev: last.ev, acMode: 'override', ac: last.ac,
          history: old.entries.slice(0, -1).map((e) => ({ date: e.date, pv: e.pv, ev: e.ev, ac: e.ac })) });
      }
    } catch { /* ignore a broken legacy EVM record */ }
    return validateProject(project).valid ? normalise(project) : null;
  } catch { return null; }
}

export function loadProject() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return migrate() ?? emptyProject();
    const p = JSON.parse(raw);
    return validateProject(p).valid ? normalise(p) : emptyProject(); // tampered or corrupt storage is discarded
  } catch { return emptyProject(); }
}
export function saveProject(project) {
  try { localStorage.setItem(KEY, JSON.stringify(project)); }
  catch { throw new StorageError('Storage is unavailable; your work remains in memory only'); }
}

/** Parse a form field into number | null | { error }. Empty = not entered. */
export function parseOptionalMoney(text, label) {
  const t = String(text ?? '').trim();
  if (t === '') return { value: null };
  const r = parseDecimal(t, label);
  if (r.error) return { error: r.error };
  if (r.value > MAX_MONEY) return { error: `${label} is too large` };
  return { value: r.value };
}
