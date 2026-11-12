const numericPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const allowedName = /^[A-Za-z0-9 _().-]+$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const errors = (items) => ({ valid: items.length === 0, errors: items, warnings: [] });

export function parseDecimal(value, label = 'Value') {
  const text = String(value ?? '').trim().replace(/,/g, '');
  if (!numericPattern.test(text) || !Number.isFinite(Number(text))) return { value: null, error: `${label} must be a valid number with up to 2 decimals` };
  return { value: Number(text), error: null };
}
export function validateDate(value, label = 'Date') {
  if (!datePattern.test(value ?? '')) return `${label} must use a valid YYYY-MM-DD date`;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return `${label} is not a valid calendar date`;
  return null;
}
export function validateProject(input) {
  const list = [];
  const name = String(input.name ?? '').trim();
  if (!name || name.length > 80 || !allowedName.test(name)) list.push('Project name is required and may contain only letters, digits, spaces, - _ . ( )');
  const bac = parseDecimal(input.bac, 'Total budget');
  if (bac.error || bac.value <= 0 || bac.value > 1_000_000_000_000) list.push(bac.error || 'Total budget must be greater than 0 and no more than PKR 1,000,000,000,000');
  const startError = validateDate(input.start, 'Planned start date');
  const endError = validateDate(input.end, 'Planned end date');
  if (startError) list.push(startError);
  if (endError) list.push(endError);
  if (!startError && !endError && input.end <= input.start) list.push('Planned end date must be after start date');
  const amber = Number(input.amber ?? 0.85);
  const green = Number(input.green ?? 0.95);
  if (!(amber > 0 && amber < green && green <= 2)) list.push('Thresholds must satisfy 0 < amber < green <= 2');
  return { ...errors(list), value: { ...input, name, bac: bac.value, amber, green } };
}
export function validateEntry(input, project, previous) {
  const list = [];
  const dateError = validateDate(input.date, 'Reporting date');
  if (dateError) list.push(dateError);
  if (!dateError && (input.date < project.start || input.date > new Date().toISOString().slice(0, 10))) list.push('Reporting date must be between project start and today');
  const parsed = {};
  for (const key of ['pv', 'ev', 'ac']) {
    const result = parseDecimal(input[key], key.toUpperCase());
    parsed[key] = result.value;
    if (result.error || result.value < 0) list.push(result.error || `${key.toUpperCase()} cannot be negative`);
  }
  if (parsed.pv > project.bac || parsed.ev > project.bac) list.push('PV and EV cannot exceed BAC');
  if (input.note && String(input.note).length > 200) list.push('Note cannot exceed 200 characters');
  if (previous) {
    if (input.date <= previous.date) list.push('Reporting date must be later than the previous entry');
    for (const key of ['pv', 'ev', 'ac']) if (parsed[key] < previous[key]) list.push(`${key.toUpperCase()} cannot decrease`);
  }
  return { ...errors(list), value: { ...input, ...parsed, note: String(input.note ?? '').trim() } };
}
export function validateSeries(project) {
  const list = [];
  let previous = null;
  project.entries.forEach((entry) => {
    const result = validateEntry(entry, project, previous);
    list.push(...result.errors.map((error) => `${entry.date}: ${error}`));
    previous = entry;
  });
  return errors(list);
}
