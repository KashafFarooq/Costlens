import { StorageError, ImportError } from '../core/errors.js';
import { validateProject, validateSeries } from '../core/validation.js';

const KEY = 'evm-tracker:v1';
export const emptyProject = () => ({ name: '', bac: 0, start: '', end: '', interval: 'weekly', amber: 0.85, green: 0.95, entries: [] });
export function loadProject() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyProject();
    const project = JSON.parse(raw);
    if (!project || typeof project !== 'object' || !Array.isArray(project.entries)) throw new StorageError('Stored data is invalid');
    if (!validateProject(project).valid || !validateSeries(project).valid) throw new StorageError('Stored data failed validation');
    return project;
  } catch (error) {
    if (error instanceof StorageError) return emptyProject();
    throw new StorageError('Unable to read saved project');
  }
}
export function saveProject(project) {
  try { localStorage.setItem(KEY, JSON.stringify(project)); }
  catch { throw new StorageError('Storage is unavailable; your work remains in memory only'); }
}
export function exportJson(project) { return JSON.stringify(project, null, 2); }
export function csvEscape(value) {
  const text = String(value ?? '');
  const safe = /^[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function exportCsv(project, series) {
  const headers = ['Date', 'PV', 'EV', 'AC', 'CPI', 'SPI', 'CV', 'SV'];
  return [headers.join(','), ...series.map((row) => [row.date, row.pv, row.ev, row.ac, row.metrics.cpi ?? '', row.metrics.spi ?? '', row.metrics.cv, row.metrics.sv].map(csvEscape).join(','))].join('\n');
}
export function importJson(text) {
  if (text.length > 1_000_000) throw new ImportError('Import file exceeds the 1 MB limit');
  let project;
  try { project = JSON.parse(text); } catch { throw new ImportError('Import is not valid JSON'); }
  const allowed = ['name', 'bac', 'start', 'end', 'interval', 'amber', 'green', 'entries'];
  if (!project || Object.keys(project).some((key) => !allowed.includes(key)) || Object.keys(project).some((key) => ['__proto__', 'constructor', 'prototype'].includes(key))) throw new ImportError('Import contains unknown or unsafe fields');
  if (!Array.isArray(project.entries) || project.entries.length > 500 || !validateProject(project).valid || !validateSeries(project).valid) throw new ImportError('Import failed schema validation');
  return project;
}
