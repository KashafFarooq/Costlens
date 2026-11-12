import { CalculationError } from './errors.js';

const finite = (value, label) => {
  if (!Number.isFinite(value)) throw new CalculationError(`${label} is not finite`, 'NON_FINITE');
  return value;
};

export function calculateMetrics({ bac, pv, ev, ac }) {
  [bac, pv, ev, ac].forEach((value) => finite(value, 'Input'));
  if (bac <= 0 || pv < 0 || ev < 0 || ac < 0) throw new CalculationError('Invalid calculation inputs', 'INVALID_INPUT');
  const cpi = ac === 0 ? null : ev / ac;
  const spi = pv === 0 ? null : ev / pv;
  const eac = ac === 0 || ev === 0 ? null : bac / cpi;
  const etc = eac === null ? null : eac - ac;
  const vac = eac === null ? null : bac - eac;
  let tcpi = null;
  let tcpiLabel = '';
  if (ac > bac) tcpiLabel = 'Budget exhausted, cannot be met';
  else if (ac === bac && ev < bac) tcpiLabel = 'N/A (no remaining budget)';
  else tcpi = ev === bac ? 0 : (bac - ev) / (bac - ac);
  const eacLabel = ac === 0 ? 'N/A (AC is zero)' : ev === 0 ? 'Undefined (no value earned yet)' : '';
  return { plannedPercent: pv / bac, actualPercent: ev / bac, spentPercent: ac / bac, cv: ev - ac, sv: ev - pv, cpi, spi, eac, eacLabel, etc, vac, tcpi, tcpiLabel };
}

export function calculateSeries(project) {
  return project.entries.map((entry) => ({ ...entry, metrics: calculateMetrics({ bac: project.bac, ...entry }) }));
}

/* ------------------------------------------------------------------ *
 * Integrated EVM (CostLens)
 * Same formulas as EVM App2 (calculateMetrics above), but tolerant of
 * missing inputs so the UI never shows misleading numbers.
 * ------------------------------------------------------------------ */
export const RAG = { green: 0.95, amber: 0.85 }; // same default thresholds as EVM App2
export const ragOf = (v) => (v === null || v === undefined ? 'na' : v >= RAG.green ? 'good' : v >= RAG.amber ? 'warn' : 'bad');

export const EVM_INFO = {
  bac: { label: 'BAC', name: 'Budget at Completion', formula: 'Approved total budget', text: 'The total approved budget for the whole project. By default it follows your total estimated cost.' },
  pv: { label: 'PV', name: 'Planned Value', formula: 'Budgeted value of work planned to date', text: 'How much work should be finished by the status date, expressed in budget terms.' },
  ev: { label: 'EV', name: 'Earned Value', formula: 'Budgeted value of work actually completed', text: 'The budgeted value of the work that has really been completed so far.' },
  ac: { label: 'AC', name: 'Actual Cost', formula: 'Money actually spent to date', text: 'What has been spent so far. Linked to the Actual Cost total in Cost data unless you override it.' },
  cv: { label: 'CV', name: 'Cost Variance', formula: 'EV − AC', text: 'Positive means the work done cost less than its budgeted value (under budget); negative means over budget. This is different from the line-item variance (Estimated − Actual).' },
  sv: { label: 'SV', name: 'Schedule Variance', formula: 'EV − PV', text: 'Positive means more work is complete than planned (ahead); negative means behind schedule.' },
  cpi: { label: 'CPI', name: 'Cost Performance Index', formula: 'EV ÷ AC', text: 'Value earned per unit of money spent. Above 1.00 is efficient; below 1.00 means cost overrun.' },
  spi: { label: 'SPI', name: 'Schedule Performance Index', formula: 'EV ÷ PV', text: 'Progress made versus progress planned. Above 1.00 is ahead; below 1.00 is behind schedule.' },
  eac: { label: 'EAC', name: 'Estimate at Completion', formula: 'BAC ÷ CPI', text: 'Forecast final project cost if current cost efficiency continues for the rest of the project.' },
  etc: { label: 'ETC', name: 'Estimate to Complete', formula: 'EAC − AC', text: 'Forecast money still needed to finish the project.' },
  vac: { label: 'VAC', name: 'Variance at Completion', formula: 'BAC − EAC', text: 'Expected budget surplus (positive) or shortfall (negative) at the end of the project.' },
  tcpi: { label: 'TCPI', name: 'To-Complete Performance Index', formula: '(BAC − EV) ÷ (BAC − AC)', text: 'Cost efficiency required on the remaining work to finish within BAC. Above 1.00 is harder than the current pace; above about 1.10 is usually unrealistic.' },
};

const list = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a.at(-1)}` : a[0] ?? '');
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Nullable-input twin of calculateMetrics. Returns value or null plus a reason for every null. */
export function computeEvm({ bac = null, pv = null, ev = null, ac = null } = {}) {
  const why = {};
  const bacOk = isNum(bac) && bac > 0, pvOk = isNum(pv) && pv >= 0, evOk = isNum(ev) && ev >= 0, acOk = isNum(ac) && ac >= 0;
  const need = (names) => names.filter((n) => !{ BAC: bacOk, PV: pvOk, EV: evOk, AC: acOk }[n]);
  const cv = evOk && acOk ? ev - ac : null;
  const sv = evOk && pvOk ? ev - pv : null;
  if (cv === null) why.cv = `Needs ${list(need(['EV', 'AC']))}`;
  if (sv === null) why.sv = `Needs ${list(need(['EV', 'PV']))}`;
  let cpi = null, spi = null, eac = null, etc = null, vac = null, tcpi = null, tcpiLabel = '';
  if (evOk && acOk) { if (ac === 0) why.cpi = 'Not available: AC is zero'; else cpi = ev / ac; } else why.cpi = `Needs ${list(need(['EV', 'AC']))}`;
  if (evOk && pvOk) { if (pv === 0) why.spi = 'Not available: PV is zero'; else spi = ev / pv; } else why.spi = `Needs ${list(need(['EV', 'PV']))}`;
  if (bacOk && cpi !== null) { if (ev === 0) why.eac = 'Undefined: no value earned yet'; else eac = bac / cpi; } else why.eac = cpi === null && bacOk ? (why.cpi || 'Needs CPI') : `Needs ${list(need(['BAC', 'EV', 'AC']))}`;
  if (eac !== null && acOk) { etc = eac - ac; vac = bac - eac; } else { why.etc = why.eac; why.vac = why.eac; }
  if (bacOk && evOk && acOk) {
    if (ac > bac) tcpiLabel = 'Budget exhausted, cannot be met';
    else if (ac === bac && ev < bac) tcpiLabel = 'N/A (no remaining budget)';
    else tcpi = ev === bac ? 0 : (bac - ev) / (bac - ac);
    if (tcpi === null) why.tcpi = tcpiLabel;
  } else why.tcpi = `Needs ${list(need(['BAC', 'EV', 'AC']))}`;
  return { cv, sv, cpi, spi, eac, etc, vac, tcpi, tcpiLabel, why,
    plannedPercent: bacOk && pvOk ? pv / bac : null, earnedPercent: bacOk && evOk ? ev / bac : null, spentPercent: bacOk && acOk ? ac / bac : null };
}

/** Resolve BAC / PV / EV / AC from the unified project (cost data + EVM inputs). */
export function resolveEvmInputs(project, totals) {
  const e = project.evm, hasCost = (totals?.count ?? 0) > 0;
  const bac = e.bacMode === 'linked' ? (hasCost && totals.estimated > 0 ? totals.estimated : null) : e.bac;
  const costAc = hasCost ? totals.actual : null;
  const ac = e.acMode === 'linked' ? costAc : e.ac;
  return { bac, pv: e.pv, ev: e.ev, ac, costAc, costBac: hasCost ? totals.estimated : null };
}

export function evmSnapshot(project, totals) {
  const inputs = resolveEvmInputs(project, totals);
  const m = computeEvm(inputs);
  const missing = ['bac', 'pv', 'ev', 'ac'].filter((k) => !isNum(inputs[k]) || (k === 'bac' && inputs.bac <= 0)).map((k) => k.toUpperCase());
  const warnings = [];
  if (isNum(inputs.bac)) {
    if (isNum(inputs.pv) && inputs.pv > inputs.bac) warnings.push('PV is greater than BAC. Planned value cannot exceed the budget.');
    if (isNum(inputs.ev) && inputs.ev > inputs.bac) warnings.push('EV is greater than BAC. Earned value cannot exceed the budget.');
  }
  const acDiff = project.evm.acMode === 'override' && isNum(inputs.ac) && inputs.costAc !== null ? inputs.ac - inputs.costAc : null;
  const costStatus = m.cv === null ? { key: 'na', text: 'Cost status unavailable' } : m.cv < 0 ? { key: 'bad', text: 'Over budget' } : m.cv > 0 ? { key: 'good', text: 'Under budget' } : { key: 'good', text: 'On budget' };
  const scheduleStatus = m.sv === null ? { key: 'na', text: 'Schedule status unavailable' } : m.sv < 0 ? { key: 'bad', text: 'Behind schedule' } : m.sv > 0 ? { key: 'good', text: 'Ahead of schedule' } : { key: 'good', text: 'On schedule' };
  return { inputs, metrics: m, missing, warnings, acDiff, costStatus, scheduleStatus, ready: missing.length === 0, hasAny: ['pv', 'ev'].some((k) => isNum(inputs[k])) };
}

/** Indicative schedule forecast from SPI (simple time-based extrapolation). */
export function forecastFinish(project, snap) {
  const { start, end, asOf } = project.evm, spi = snap.metrics.spi;
  if (!start || !end || !spi || !(spi > 0)) return null;
  const s = Date.parse(`${start}T00:00:00Z`), e = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
  const days = (e - s) / 864e5, forecastDays = days / spi;
  return { plannedEnd: end, forecastEnd: new Date(s + forecastDays * 864e5).toISOString().slice(0, 10), slipDays: Math.round(forecastDays - days) };
}

export const emptyEvm = () => ({ bacMode: 'linked', bac: null, start: '', end: '', asOf: '', pv: null, ev: null, acMode: 'linked', ac: null, history: [] });
