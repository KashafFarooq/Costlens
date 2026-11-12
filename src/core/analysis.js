// Project cost analysis. Two producers share one output shape:
//   * generateRuleBased(project)  -> deterministic, runs in the browser (clearly labelled, NOT generative AI)
//   * server/ai.js               -> real model call through the server proxy (API key never reaches the browser)
import { computeProject } from './model.js';
import { currency, index } from '../utils/format.js';
import { EVM_INFO, ragOf, emptyEvm } from './evm.js';

const pkr = (n) => currency(Math.abs(n));
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export const SOURCE = { rules: 'Rule-based analysis (not generative AI)', ai: 'Generative AI analysis' };

export function generateRuleBased(input) {
  const project = input.evm ? input : { ...input, evm: emptyEvm() };
  const model = computeProject(project), { totals: t, snap, anomalies, finish } = model, m = snap.metrics, bac = snap.inputs.bac;
  if (!t.count) return { source: 'rules', headline: 'No data yet', summary: 'Add cost items or import a file to generate an analysis.', unusual: [], categoryOverruns: [], performance: [], eacExplanation: '', risks: [], recommendations: [] };
  const state = t.variance < 0 ? 'over' : 'under';
  const headline = `${project.name} is ${Math.abs(t.pct ?? 0).toFixed(1)}% ${state} its line-item estimate${m.cpi !== null ? `, with CPI ${index(m.cpi)} and SPI ${index(m.spi)}` : ''}`;
  const summary = [`Across ${t.count} cost items the estimate is ${pkr(t.estimated)} and actual spend is ${pkr(t.actual)}: a line-item ${t.variance < 0 ? 'overrun' : 'saving'} of ${pkr(t.variance)} (${t.pct === null ? 'n/a' : `${t.pct.toFixed(1)}%`}). ${t.overCount} item${t.overCount === 1 ? '' : 's'} exceed the ${project.threshold}% tolerance.`];
  if (snap.hasAny && m.cv !== null) summary.push(`On an earned-value basis the project is ${snap.costStatus.text.toLowerCase()} (CV ${m.cv < 0 ? '-' : '+'}${pkr(m.cv)}) and ${snap.scheduleStatus.text.toLowerCase()} (SV ${m.sv === null ? 'n/a' : `${m.sv < 0 ? '-' : '+'}${pkr(m.sv)}`}). Note that CV = EV − AC is a different measure from the line-item variance (Estimated − Actual).`);
  const unusual = anomalies.slice(0, 8).map((a) => ({ title: a.title, detail: `${a.detail} Suggested action: ${a.action}`, severity: a.severity }));
  const categoryOverruns = t.categories.filter((c) => c.variance < 0).sort((a, b) => a.variance - b.variance).map((c) => ({ category: c.category, detail: `${pkr(c.variance)} over (${c.pct === null ? 'unbudgeted' : `${Math.abs(c.pct).toFixed(1)}%`}); estimated ${pkr(c.estimated)}, actual ${pkr(c.actual)}.`, severity: c.pct === null || c.pct <= -25 ? 'critical' : c.pct <= -project.threshold ? 'warning' : 'info' }));
  const performance = [];
  const totalOver = t.categories.filter((c) => c.variance < 0).reduce((s, c) => s - c.variance, 0);
  if (m.cpi !== null) {
    const top = categoryOverruns.slice(0, 2);
    const drivers = top.length && totalOver > 0 ? ` The biggest drivers are ${top.map((c) => `${c.category} (${Math.round((-t.categories.find((x) => x.category === c.category).variance / totalOver) * 100)}% of all overruns)`).join(' and ')}.` : '';
    performance.push({ title: `Cost performance (CPI ${index(m.cpi)})`, text: ragOf(m.cpi) === 'good' ? `CPI is at or near 1.00, so work is being delivered at about its budgeted cost.` : `CPI below 1.00 means every PKR 1 of earned work has cost about PKR ${(1 / m.cpi).toFixed(2)}.${drivers}` });
  }
  if (m.spi !== null) performance.push({ title: `Schedule performance (SPI ${index(m.spi)})`, text: ragOf(m.spi) === 'good' ? 'Progress is in line with, or ahead of, plan.' : `Only ${(m.spi * 100).toFixed(0)}% of the planned work is done (EV ${pkr(snap.inputs.ev)} vs PV ${pkr(snap.inputs.pv)}).${finish ? ` Extrapolating, the finish moves from ${finish.plannedEnd} to roughly ${finish.forecastEnd} (${finish.slipDays > 0 ? `${finish.slipDays} days late` : 'on time'}); this is an indicative estimate only.` : ''} Typical causes are late materials, rework or under-resourcing; confirm against the schedule.` });
  if (!performance.length) performance.push({ title: 'EVM not available', text: `CPI and SPI need ${snap.missing.join(', ') || 'EV and PV'}. Enter them on the Performance page.` });
  let eacExplanation = m.eac === null ? `EAC cannot be calculated yet: ${m.why.eac ?? 'enter BAC, EV and AC.'}` : `EAC = BAC ÷ CPI = ${pkr(bac)} ÷ ${index(m.cpi)} = ${pkr(m.eac)}. It assumes cost efficiency continues at today's CPI. That implies ${pkr(m.etc)} still to spend and a final ${m.vac < 0 ? `overrun of ${pkr(m.vac)}` : `saving of ${pkr(m.vac)}`} against budget.`;
  if (m.tcpi !== null) eacExplanation += ` To finish within BAC the remaining work would need TCPI ${index(m.tcpi)}${m.tcpi > 1.1 ? ', which is rarely realistic' : ''}.`;
  const risks = [];
  if (m.vac !== null && m.vac < 0) risks.push(`Forecast final cost exceeds the approved budget by ${pkr(m.vac)}.`);
  if (m.spi !== null && m.spi < 0.85) risks.push('Schedule delay is likely to push indirect costs (site, equipment hire, management) higher.');
  if (m.tcpi !== null && m.tcpi > 1.1) risks.push('Recovery to budget would require unusually high efficiency on remaining work.');
  const big = t.categories[0]; if (big && t.actual > 0 && big.actual / t.actual > 0.45) risks.push(`${big.category} is ${Math.round((big.actual / t.actual) * 100)}% of spend, so price changes there move the whole budget.`);
  if (anomalies.some((a) => a.type === 'Unbudgeted spend')) risks.push('Spending exists without an approved estimate; it bypasses budget control.');
  if (!snap.ready) risks.push(`EVM inputs are incomplete (${snap.missing.join(', ')}), so forecasts are unavailable.`);
  const recommendations = [];
  if (t.variance < 0 || (m.vac !== null && m.vac < 0)) recommendations.push('Re-forecast cost to complete and obtain approval before further commitments.');
  categoryOverruns.slice(0, 2).forEach((c) => recommendations.push(`Review the ${c.category} budget: renegotiate supplier rates or reduce scope where possible.`));
  if (m.spi !== null && m.spi < RAGMIN) recommendations.push('Review the critical path and add resources or re-sequence work to recover schedule.');
  anomalies.slice(0, 3).forEach((a) => recommendations.push(a.action));
  if (m.tcpi !== null && m.tcpi > 1.1) recommendations.push('Agree a revised budget (BAC) or a scope reduction; the current target is unlikely to be met.');
  if (!recommendations.length) recommendations.push('Maintain current controls and keep updating PV, EV and AC at each reporting date.');
  return { source: 'rules', headline, summary: summary.join(' '), unusual, categoryOverruns, performance, eacExplanation, risks, recommendations: [...new Set(recommendations)].slice(0, 7) };
}
const RAGMIN = 0.95;

/** Compact, non-secret snapshot sent to the server-side AI proxy. Numbers only plus short labels. */
export function buildAiPayload(input) {
  const project = input.evm ? input : { ...input, evm: emptyEvm() };
  const { totals: t, snap, anomalies, rows } = computeProject(project), m = snap.metrics, n = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  return {
    project: clip(project.name, 80), currency: 'PKR', tolerancePct: project.threshold,
    totals: { estimated: t.estimated, actual: t.actual, variance: t.variance, variancePct: n(t.pct), items: t.count, itemsOverTolerance: t.overCount },
    categories: t.categories.slice(0, 15).map((c) => ({ name: clip(c.category, 40), estimated: c.estimated, actual: c.actual, variance: c.variance, variancePct: n(c.pct) })),
    topItems: [...rows].sort((a, b) => a.variance - b.variance).slice(0, 12).map((r) => ({ name: clip(r.description, 60), category: clip(r.category, 40), estimated: r.estimated, actual: r.actual, variance: r.variance, variancePct: n(r.pct) })),
    ruleFlags: anomalies.slice(0, 12).map((a) => ({ type: clip(a.type, 40), title: clip(a.title, 100), severity: a.severity })),
    evm: { bac: n(snap.inputs.bac), pv: n(snap.inputs.pv), ev: n(snap.inputs.ev), ac: n(snap.inputs.ac), cv: n(m.cv), sv: n(m.sv), cpi: n(m.cpi), spi: n(m.spi), eac: n(m.eac), etc: n(m.etc), vac: n(m.vac), tcpi: n(m.tcpi), acLinkedToCostData: project.evm.acMode === 'linked', plannedStart: project.evm.start || null, plannedFinish: project.evm.end || null, asOf: project.evm.asOf || null },
  };
}

/** Validate and sanitise model output before it ever reaches the DOM or a report. */
export function sanitizeAnalysis(raw, source = 'ai', model = '') {
  const o = raw && typeof raw === 'object' ? raw : {};
  const list = (a, n, k) => (Array.isArray(a) ? a.slice(0, n).map((x) => (typeof x === 'string' ? clip(x, k) : '')).filter(Boolean) : []);
  const sev = (s) => (['critical', 'warning', 'info'].includes(s) ? s : 'info');
  const objs = (a, fields) => (Array.isArray(a) ? a.slice(0, 10).map((x) => ({ ...Object.fromEntries(fields.map(([f, k]) => [f, clip(x?.[f], k)])), severity: sev(x?.severity) })).filter((x) => x[fields[0][0]]) : []);
  return { source, model: clip(model, 60), headline: clip(o.headline, 200), summary: clip(o.summary, 1500),
    unusual: objs(o.unusualExpenses, [['title', 140], ['detail', 400]]), categoryOverruns: objs(o.categoryOverruns, [['category', 60], ['detail', 400]]),
    performance: (Array.isArray(o.performance) ? o.performance : []).slice(0, 4).map((x) => ({ title: clip(x?.title, 100), text: clip(x?.text, 700) })).filter((x) => x.title && x.text),
    eacExplanation: clip(o.eacExplanation, 900), risks: list(o.risks, 8, 300), recommendations: list(o.recommendations, 8, 300) };
}
export { EVM_INFO };
