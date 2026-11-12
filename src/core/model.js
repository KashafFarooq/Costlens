// One place that turns the unified project into every number the UI, AI and reports use.
import { calcAll, summarize } from './cost.js';
import { evmSnapshot, forecastFinish, ragOf, emptyEvm } from './evm.js';
import { detectAnomalies } from './anomaly.js';
import { currency, index } from '../utils/format.js';

export function computeProject(input) {
  const project = input.evm ? input : { ...input, evm: emptyEvm() };
  const rows = calcAll(project);
  const totals = summarize(rows);
  const snap = evmSnapshot(project, totals);
  const finish = forecastFinish(project, snap);
  return { rows, totals, snap, finish, anomalies: detectAnomalies(project) };
}

/** Budget warnings shown on the dashboard and in reports. severity: critical | warning | info */
export function budgetWarnings(project, model = computeProject(project)) {
  const { totals: t, snap, finish } = model, m = snap.metrics, bac = snap.inputs.bac, w = [];
  const add = (severity, title, text) => w.push({ severity, title, text });
  if (t.count && t.variance < 0) add(t.pct !== null && t.pct <= -project.threshold ? 'critical' : 'warning', 'Line items are over estimate', `Actual cost exceeds the estimate by ${currency(-t.variance)}${t.pct === null ? '' : ` (${Math.abs(t.pct).toFixed(1)}%)`}.`);
  if (t.overCount) add('warning', `${t.overCount} item${t.overCount === 1 ? '' : 's'} beyond the ${project.threshold}% tolerance`, 'Review these on the Cost data page.');
  if (m.cpi !== null && ragOf(m.cpi) === 'bad') add('critical', 'Poor cost performance', `CPI is ${index(m.cpi)}: each PKR 1 of planned work is costing about PKR ${(1 / m.cpi).toFixed(2)}.`);
  else if (m.cpi !== null && ragOf(m.cpi) === 'warn') add('warning', 'Cost performance needs attention', `CPI is ${index(m.cpi)}, below the 0.95 healthy threshold.`);
  if (m.spi !== null && ragOf(m.spi) === 'bad') add('critical', 'Project is significantly behind schedule', `SPI is ${index(m.spi)}${finish ? `; at this pace the finish moves from ${finish.plannedEnd} to about ${finish.forecastEnd}` : ''}.`);
  else if (m.spi !== null && ragOf(m.spi) === 'warn') add('warning', 'Schedule is slipping', `SPI is ${index(m.spi)}, below the 0.95 healthy threshold.`);
  if (m.vac !== null && m.vac < 0) add(bac && -m.vac / bac >= 0.05 ? 'critical' : 'warning', 'Forecast exceeds budget', `EAC ${currency(m.eac)} is ${currency(-m.vac)} above BAC ${currency(bac)}.`);
  if (bac && snap.inputs.ac !== null && snap.inputs.ac > bac) add('critical', 'Budget already exhausted', `Actual cost ${currency(snap.inputs.ac)} has passed BAC ${currency(bac)}.`);
  else if (m.tcpi !== null && m.tcpi > 1.1) add('warning', 'Recovery target is unrealistic', `TCPI is ${index(m.tcpi)}: the remaining work would need to be delivered ${((m.tcpi - 1) * 100).toFixed(0)}% more efficiently than budgeted.`);
  for (const x of snap.warnings) add('warning', 'Input check', x);
  if (snap.acDiff !== null && Math.abs(snap.acDiff) > 0.005) add('info', 'AC differs from cost data', `The AC override is ${currency(Math.abs(snap.acDiff))} ${snap.acDiff > 0 ? 'above' : 'below'} the cost-data total.`);
  if (!snap.ready && t.count) add('info', 'EVM inputs incomplete', `Missing: ${snap.missing.join(', ')}. Dependent metrics are hidden rather than guessed.`);
  return w;
}
