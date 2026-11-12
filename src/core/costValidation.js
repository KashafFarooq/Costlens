import { parseDecimal } from './validation.js';

export const MAX_AMOUNT = 1_000_000_000_000;
export const MAX_ITEMS = 1000;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
const MARKUP = /[<>]/;
const categoryPattern = /^[\p{L}\p{N} _().,&/-]+$/u;

export const cleanText = (v) => String(v ?? '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();

// Accepts numbers (from Excel cells) or strict decimal strings (from CSV / forms).
export function toMoney(raw, label) {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { error: `${label} is not a finite number` };
    const v = Math.round((raw + Number.EPSILON) * 100) / 100;
    if (v < 0) return { error: `${label} cannot be negative` };
    if (v > MAX_AMOUNT) return { error: `${label} is too large` };
    return { value: v };
  }
  const r = parseDecimal(raw, label);
  if (r.error) return { error: r.error };
  if (r.value > MAX_AMOUNT) return { error: `${label} is too large` };
  return { value: r.value };
}

export function validateCostItem(input) {
  const errors = [];
  const category = cleanText(input.category) || 'General';
  const description = cleanText(input.description);
  if (category.length > 40 || !categoryPattern.test(category)) errors.push('Category must be 1-40 characters: letters, digits, spaces and - _ . , ( ) & /');
  if (!description) errors.push('Description is required');
  else if (description.length > 120) errors.push('Description cannot exceed 120 characters');
  else if (MARKUP.test(description)) errors.push('Description cannot contain < or >');
  const est = toMoney(input.estimated, 'Estimated cost');
  const act = toMoney(input.actual, 'Actual cost');
  if (est.error) errors.push(est.error);
  if (act.error) errors.push(act.error);
  return { valid: errors.length === 0, errors, value: { category, description, estimated: est.value, actual: act.value } };
}

export const newId = () => (globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

export function validateCostProject(p) {
  const errors = [];
  if (!p || typeof p !== 'object' || !Array.isArray(p.items)) return { valid: false, errors: ['Project is malformed'] };
  const name = cleanText(p.name);
  if (name.length > 80 || MARKUP.test(name)) errors.push('Project name is invalid');
  if (!(Number(p.threshold) > 0 && Number(p.threshold) <= 100)) errors.push('Threshold must be between 0 and 100');
  if (p.items.length > MAX_ITEMS) errors.push(`Too many items (max ${MAX_ITEMS})`);
  else p.items.forEach((it, i) => { const r = validateCostItem(it ?? {}); if (!r.valid) errors.push(`Item ${i + 1}: ${r.errors[0]}`); });
  return { valid: errors.length === 0, errors };
}
