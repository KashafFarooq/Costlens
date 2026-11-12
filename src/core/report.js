// Report builders. Every format (HTML, PDF, Excel, CSV) is generated from the same model so downloads always match the screen.
import { computeProject, budgetWarnings } from './model.js';
import { generateRuleBased, SOURCE } from './analysis.js';
import { groupedBarChart, varianceChart, donutChart, evmChart, bacEacChart, esc, COLORS } from './charts.js';
import { EVM_INFO, ragOf, emptyEvm } from './evm.js';
import { currency, pctPoints, index, signedCurrency } from '../utils/format.js';
import { csvEscape } from '../data/storage.js';
import { Pdf } from './pdf.js';
import { buildXlsx, S } from './xlsx.js';

const statusText = { over: 'Over budget', watch: 'Watch', ok: 'On track' };
const RAG_COLOR = { good: COLORS.good, warn: COLORS.warn, bad: COLORS.bad, na: '#7b8a80' };

export function buildReportModel(input, when = new Date(), analysis = null) {
  const project = input.evm ? input : { ...input, evm: emptyEvm() };
  const model = computeProject(project);
  const a = analysis ?? generateRuleBased(project);
  return { project, when, ...model, analysis: a, analysisLabel: SOURCE[a.source] ?? SOURCE.rules, warnings: budgetWarnings(project, model) };
}

/** Ordered EVM rows used by every format. */
export function evmRows(model) {
  const m = model.snap.metrics, i = model.snap.inputs;
  const na = (why) => `N/A (${why})`;
  const money = (v, why) => (v === null || v === undefined ? na(why ?? 'not entered') : currency(v));
  return [
    ['BAC', EVM_INFO.bac.name, money(i.bac), i.bac, 'money', 'na'], ['PV', EVM_INFO.pv.name, money(i.pv), i.pv, 'money', 'na'],
    ['EV', EVM_INFO.ev.name, money(i.ev), i.ev, 'money', 'na'], ['AC', EVM_INFO.ac.name, money(i.ac), i.ac, 'money', 'na'],
    ['CV', EVM_INFO.cv.name, m.cv === null ? na(m.why.cv) : signedCurrency(m.cv), m.cv, 'money', m.cv === null ? 'na' : m.cv < 0 ? 'bad' : 'good'],
    ['SV', EVM_INFO.sv.name, m.sv === null ? na(m.why.sv) : signedCurrency(m.sv), m.sv, 'money', m.sv === null ? 'na' : m.sv < 0 ? 'bad' : 'good'],
    ['CPI', EVM_INFO.cpi.name, m.cpi === null ? na(m.why.cpi) : index(m.cpi), m.cpi, 'idx', ragOf(m.cpi)], ['SPI', EVM_INFO.spi.name, m.spi === null ? na(m.why.spi) : index(m.spi), m.spi, 'idx', ragOf(m.spi)],
    ['EAC', EVM_INFO.eac.name, m.eac === null ? na(m.why.eac) : currency(m.eac), m.eac, 'money', 'na'], ['ETC', EVM_INFO.etc.name, m.etc === null ? na(m.why.etc) : currency(m.etc), m.etc, 'money', 'na'],
    ['VAC', EVM_INFO.vac.name, m.vac === null ? na(m.why.vac) : signedCurrency(m.vac), m.vac, 'money', m.vac === null ? 'na' : m.vac < 0 ? 'bad' : 'good'],
    ['TCPI', EVM_INFO.tcpi.name, m.tcpi === null ? na(m.tcpiLabel || m.why.tcpi) : index(m.tcpi), m.tcpi, 'idx', m.tcpi === null ? 'na' : m.tcpi > 1.1 ? 'bad' : m.tcpi > 1 ? 'warn' : 'good'],
  ].map(([k, name, text, value, kind, rag]) => ({ key: k, name, text, value, kind, rag, formula: EVM_INFO[k.toLowerCase()].formula }));
}

export function exportCostCsv(input) {
  const model = buildReportModel(input), { rows, totals: t } = model;
  const line = (a) => a.map(csvEscape).join(',');
  const out = [line(['Category', 'Description', 'Estimated', 'Actual', 'Cost variance (Estimated - Actual)', 'Variance %', 'Status'])];
  rows.forEach((r) => out.push(line([r.category, r.description, r.estimated, r.actual, r.variance, r.pct ?? '', r.status])));
  out.push(line(['TOTAL', '', t.estimated, t.actual, t.variance, t.pct ?? '', '']));
  out.push('', line(['EVM metric', 'Name', 'Value', 'Formula']));
  evmRows(model).forEach((r) => out.push(line([r.key, r.name, r.value === null || r.value === undefined ? r.text : r.value, r.formula])));
  return out.join('\n');
}

/* ------------------------------- HTML ------------------------------- */
export function buildReportHtml(input, when = new Date(), analysis = null) {
  const R = buildReportModel(input, when, analysis), { project, rows, totals: t, snap, analysis: n, warnings } = R;
  const cls = (v) => (v < 0 ? 'neg' : 'pos'), ragCls = (r) => ({ good: 'pos', bad: 'neg', warn: 'warn', na: '' }[r]);
  const kpi = (l, v, c = '') => `<div class="kpi"><span>${esc(l)}</span><strong class="${c}">${esc(v)}</strong></div>`;
  const tr = (r) => `<tr><td>${esc(r.category)}</td><td>${esc(r.description)}</td><td class="n">${currency(r.estimated)}</td><td class="n">${currency(r.actual)}</td><td class="n ${cls(r.variance)}">${currency(r.variance)}</td><td class="n ${cls(r.variance)}">${pctPoints(r.pct)}</td><td>${statusText[r.status]}</td></tr>`;
  const list = (a) => (a?.length ? `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p>None.</p>');
  const hist = project.evm.history;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>CostLens Project Report - ${esc(project.name)}</title><style>
body{font:14px/1.55 system-ui,Segoe UI,Arial,sans-serif;color:#23352c;max-width:1000px;margin:0 auto;padding:32px;background:#fff}h1{margin:0;color:#1f5f46}h2{margin:30px 0 10px;color:#1f5f46;border-bottom:2px solid #e4e8df;padding-bottom:4px}h3{color:#1f5f46}
.meta{color:#5d6e64;margin:4px 0 20px}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px}.kpi{border:1px solid #e4e8df;border-left:4px solid #1f5f46;border-radius:8px;padding:10px;background:#f7f4ea}.kpi span{display:block;color:#5d6e64;font-size:12px}.kpi strong{font-size:16px}
.neg{color:#c8412b}.pos{color:#2e8b57}.warn{color:#c9731a}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #e4e8df;padding:6px 8px;text-align:left;vertical-align:top}th{background:#1f5f46;color:#fff}td.n,th.n{text-align:right}tfoot td{font-weight:700;background:#f7f4ea}
svg{width:100%;height:auto;border:1px solid #e4e8df;border-radius:8px;margin:8px 0}.charts{display:grid;grid-template-columns:1fr 1fr;gap:10px}.sev{display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;padding:1px 8px;border-radius:99px;background:#e4e8df}.sev.critical{background:#f8d9d2;color:#8e2a18}.sev.warning{background:#fbe6c9;color:#8a4d0b}
.note{font-size:12px;color:#5d6e64;margin-top:24px}.tag{display:inline-block;font-size:11px;font-weight:700;padding:2px 10px;border-radius:99px;background:#fbe6c9;color:#8a4d0b}@media(max-width:700px){.kpis,.charts{grid-template-columns:1fr 1fr}.charts{grid-template-columns:1fr}}@media print{body{padding:0}h2{break-after:avoid}svg,tr{break-inside:avoid}}</style></head><body>
<h1>CostLens · Project Cost &amp; Earned Value Report</h1><p class="meta">${esc(project.name)} · Generated ${esc(R.when.toISOString().slice(0, 16).replace('T', ' '))} UTC · Line-item variance = Estimated − Actual (negative = overrun) · Tolerance ${esc(project.threshold)}%</p>
<h2>1. Project information</h2><table><tbody><tr><td>Project</td><td>${esc(project.name)}</td><td>Cost items</td><td>${t.count}</td></tr><tr><td>Planned start</td><td>${esc(project.evm.start || 'not set')}</td><td>Planned finish</td><td>${esc(project.evm.end || 'not set')}</td></tr><tr><td>Status date</td><td>${esc(project.evm.asOf || 'not set')}</td><td>BAC source / AC source</td><td>${project.evm.bacMode === 'linked' ? 'Total estimated cost' : 'Manual'} / ${project.evm.acMode === 'linked' ? 'Cost data total' : 'Manual override'}</td></tr></tbody></table>
<h2>2. Cost analysis (line items)</h2><div class="kpis">${kpi('Total estimated cost', currency(t.estimated))}${kpi('Total actual cost', currency(t.actual))}${kpi('Cost variance (Est − Act)', currency(t.variance), cls(t.variance))}${kpi('% variance', pctPoints(t.pct), cls(t.variance))}</div>
<h2>3. Earned value management</h2><table><thead><tr><th>Metric</th><th>Name</th><th class="n">Value</th><th>Formula</th></tr></thead><tbody>${evmRows(R).map((r) => `<tr><td><strong>${esc(r.key)}</strong></td><td>${esc(r.name)}</td><td class="n ${ragCls(r.rag)}">${esc(r.text)}</td><td>${esc(r.formula)}</td></tr>`).join('')}</tbody></table>
<p class="note">CV = EV − AC is the earned-value cost variance. It is not the same as the line-item cost variance (Estimated − Actual) in section 2. Cost status: <strong>${esc(snap.costStatus.text)}</strong> · Schedule status: <strong>${esc(snap.scheduleStatus.text)}</strong>.</p>
${hist.length ? `<h3>Reporting history</h3><table><thead><tr><th>Date</th><th class="n">PV</th><th class="n">EV</th><th class="n">AC</th></tr></thead><tbody>${hist.map((h) => `<tr><td>${esc(h.date)}</td><td class="n">${currency(h.pv)}</td><td class="n">${currency(h.ev)}</td><td class="n">${currency(h.ac)}</td></tr>`).join('')}</tbody></table>` : ''}
<h2>4. Budget warnings</h2>${warnings.length ? `<table><tbody>${warnings.map((w) => `<tr><td><span class="sev ${esc(w.severity)}">${esc(w.severity)}</span></td><td><strong>${esc(w.title)}</strong><br>${esc(w.text)}</td></tr>`).join('')}</tbody></table>` : '<p>No budget warnings.</p>'}
<h2>5. Charts</h2>${rows.length ? `<div class="charts">${groupedBarChart(t.categories)}${varianceChart(t.categories)}${evmChart(snap, project.evm.history, project.evm.asOf || 'Current')}${bacEacChart(snap)}</div>${donutChart(t.categories)}` : '<p>No data.</p>'}
<h2>6. Analysis and recommendations</h2><p><span class="tag">${esc(R.analysisLabel)}</span></p><p><strong>${esc(n.headline)}</strong></p><p>${esc(n.summary)}</p>
<h3>Why CPI and SPI look this way</h3>${n.performance.map((p) => `<p><strong>${esc(p.title)}.</strong> ${esc(p.text)}</p>`).join('') || '<p>Not available.</p>'}<h3>Forecast final cost (EAC)</h3><p>${esc(n.eacExplanation || 'Not available.')}</p>
<h3>Unusual expenses</h3>${n.unusual.length ? `<table><thead><tr><th>Severity</th><th>Finding</th></tr></thead><tbody>${n.unusual.map((a) => `<tr><td><span class="sev ${esc(a.severity)}">${esc(a.severity)}</span></td><td><strong>${esc(a.title)}</strong><br>${esc(a.detail)}</td></tr>`).join('')}</tbody></table>` : '<p>None flagged.</p>'}
<h3>Category overruns</h3>${n.categoryOverruns.length ? `<ul>${n.categoryOverruns.map((c) => `<li><strong>${esc(c.category)}:</strong> ${esc(c.detail)}</li>`).join('')}</ul>` : '<p>No category is over estimate.</p>'}<h3>Budget risks</h3>${list(n.risks)}<h3>Recommended actions</h3>${list(n.recommendations)}
<h2>7. Cost detail</h2><table><thead><tr><th>Category</th><th>Description</th><th class="n">Estimated</th><th class="n">Actual</th><th class="n">Variance</th><th class="n">Var %</th><th>Status</th></tr></thead><tbody>${rows.map(tr).join('')}</tbody><tfoot><tr><td colspan="2">Total</td><td class="n">${currency(t.estimated)}</td><td class="n">${currency(t.actual)}</td><td class="n ${cls(t.variance)}">${currency(t.variance)}</td><td class="n ${cls(t.variance)}">${pctPoints(t.pct)}</td><td></td></tr></tfoot></table>
<p class="note">${n.source === 'ai' ? `The analysis section was generated by an AI model (${esc(n.model || 'unspecified')}) from the figures above; verify it before acting.` : 'The analysis section is produced by statistical and rule-based logic, not by a generative AI model.'} It is decision support, not audit evidence.</p></body></html>`;
}

/* ------------------------------- Excel ------------------------------- */
export function buildReportXlsx(input, when = new Date(), analysis = null) {
  const R = buildReportModel(input, when, analysis), { project, rows, totals: t, snap, analysis: n, warnings } = R, h = (v) => ({ v, s: S.header });
  const summary = [
    [{ v: 'CostLens · Project report', s: S.title }], [`Project: ${project.name}`], [`Generated: ${R.when.toISOString().slice(0, 16).replace('T', ' ')} UTC`], [],
    [h('Cost analysis (line items)'), h('Value')],
    ['Total estimated cost', { v: t.estimated, s: S.money, f: `SUM('Cost items'!C2:C${rows.length + 1})` }], ['Total actual cost', { v: t.actual, s: S.money, f: `SUM('Cost items'!D2:D${rows.length + 1})` }],
    ['Cost variance (Estimated − Actual)', { v: t.variance, s: S.money, f: 'B6-B7' }], ['Percentage variance', t.pct === null ? 'N/A' : { v: t.pct, s: S.pct, f: 'IF(B6=0,0,B8/B6*100)' }], [],
    [h('Status'), h('Result')], ['Cost status (EVM)', snap.costStatus.text], ['Schedule status (EVM)', snap.scheduleStatus.text], ['Planned start / finish', `${project.evm.start || 'not set'} / ${project.evm.end || 'not set'}`], ['Status date', project.evm.asOf || 'not set'], [],
    [h('Budget warnings'), h('Detail')], ...(warnings.length ? warnings.map((w) => [`[${w.severity}] ${w.title}`, { v: w.text, s: S.wrap }]) : [['None', '']]),
  ];
  const cost = [['Category', 'Description', 'Estimated', 'Actual', 'Variance (Est − Act)', 'Variance %', 'Status'].map(h),
    ...rows.map((r, i) => [r.category, r.description, { v: r.estimated, s: S.money }, { v: r.actual, s: S.money }, { v: r.variance, s: S.money, f: `C${i + 2}-D${i + 2}` }, r.pct === null ? 'N/A' : { v: r.pct, s: S.pct, f: `IF(C${i + 2}=0,0,E${i + 2}/C${i + 2}*100)` }, statusText[r.status]]),
    [{ v: 'TOTAL', s: S.bold }, '', { v: t.estimated, s: S.boldMoney }, { v: t.actual, s: S.boldMoney }, { v: t.variance, s: S.boldMoney }, t.pct === null ? 'N/A' : { v: t.pct, s: S.pct }]];
  const cats = [['Category', 'Items', 'Estimated', 'Actual', 'Variance (Est − Act)', 'Variance %'].map(h), ...t.categories.map((c) => [c.category, c.count, { v: c.estimated, s: S.money }, { v: c.actual, s: S.money }, { v: c.variance, s: S.money }, c.pct === null ? 'N/A' : { v: c.pct, s: S.pct }])];
  const er = evmRows(R), pos = Object.fromEntries(er.map((r, i) => [r.key, i + 2]));
  const cell = (r, f) => (r.value === null || r.value === undefined ? r.text : { v: r.value, s: r.kind === 'idx' ? S.idx : S.money, ...(f ? { f } : {}) });
  const fm = { CV: `B${pos.EV}-B${pos.AC}`, SV: `B${pos.EV}-B${pos.PV}`, CPI: `B${pos.EV}/B${pos.AC}`, SPI: `B${pos.EV}/B${pos.PV}`, EAC: `B${pos.BAC}/B${pos.CPI}`, ETC: `B${pos.EAC}-B${pos.AC}`, VAC: `B${pos.BAC}-B${pos.EAC}`, TCPI: `(B${pos.BAC}-B${pos.EV})/(B${pos.BAC}-B${pos.AC})` };
  const evm = [['Metric', 'Value', 'Name', 'Formula', 'Assessment'].map(h), ...er.map((r) => [{ v: r.key, s: S.bold }, cell(r, fm[r.key]), r.name, r.formula, r.rag === 'na' ? '' : { good: 'Good', warn: 'Attention', bad: 'Poor' }[r.rag]]),
    [], [{ v: 'Note: CV (EV − AC) is not the same as the line-item cost variance (Estimated − Actual).', s: S.bold }],
    ...(project.evm.history.length ? [[], ['Date', 'PV', 'EV', 'AC'].map(h), ...project.evm.history.map((x) => [x.date, { v: x.pv, s: S.money }, { v: x.ev, s: S.money }, { v: x.ac, s: S.money }])] : [])];
  const ai = [[{ v: R.analysisLabel, s: S.bold }], [], [{ v: n.headline, s: S.bold }], [{ v: n.summary, s: S.wrap }], [], [h('CPI / SPI explanation')], ...n.performance.map((p) => [p.title, { v: p.text, s: S.wrap }]), [], [h('Forecast final cost (EAC)')], [{ v: n.eacExplanation, s: S.wrap }], [],
    [h('Unusual expenses')], ...n.unusual.map((a) => [`[${a.severity}] ${a.title}`, { v: a.detail, s: S.wrap }]), [], [h('Category overruns')], ...n.categoryOverruns.map((c) => [c.category, { v: c.detail, s: S.wrap }]), [], [h('Risks')], ...n.risks.map((x) => [x]), [], [h('Recommendations')], ...n.recommendations.map((x) => [x])];
  return buildXlsx([{ name: 'Summary', rows: summary, widths: [38, 60] }, { name: 'Cost items', rows: cost, widths: [18, 34, 16, 16, 20, 12, 14] }, { name: 'Categories', rows: cats, widths: [20, 8, 16, 16, 20, 12] }, { name: 'EVM', rows: evm, widths: [10, 22, 34, 28, 14] }, { name: 'Analysis', rows: ai, widths: [48, 90] }]);
}

/* -------------------------------- PDF -------------------------------- */
function pdfBarChart(pdf, { title, bars, height = 130, format = (v) => currency(v) }) { // bars: [{ label, value, color }]
  const x0 = pdf.m + 70, w = pdf.W - 2 * pdf.m - 80; pdf.ensure(height + 34); pdf.text(title, pdf.m, pdf.y + 10, { size: 9.5, bold: true });
  const top = pdf.y + 22, h = height - 30, max = Math.max(1, ...bars.map((b) => Math.abs(b.value))), hasNeg = bars.some((b) => b.value < 0), lo = hasNeg ? -max : 0, span = max - lo;
  const yOf = (v) => top + h - ((v - lo) / span) * h;
  for (let i = 0; i <= 4; i++) { const v = lo + (span * i) / 4, y = yOf(v); pdf.line(x0, y, x0 + w, y, { color: '#e4e8df', lw: 0.5 }); pdf.text(Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(Math.round(v)), x0 - 4, y + 3, { size: 7, align: 'right', color: '#7b8a80' }); }
  const slot = w / bars.length, bw = Math.min(28, slot * 0.6);
  bars.forEach((b, i) => { const cx = x0 + slot * i + slot / 2, y1 = yOf(Math.max(b.value, 0)), y2 = yOf(Math.min(b.value, 0)); pdf.rect(cx - bw / 2, y1, bw, Math.max(0.8, y2 - y1), { fill: b.color }); pdf.text(b.label.slice(0, 14), cx, top + h + 11, { size: 7, align: 'center' }); });
  pdf.y += height + 14;
}
function pdfGroupChart(pdf, cats) {
  const x0 = pdf.m + 70, w = pdf.W - 2 * pdf.m - 80, height = 140; pdf.ensure(height + 34); pdf.text('Estimated vs actual cost by category', pdf.m, pdf.y + 10, { size: 9.5, bold: true });
  pdf.rect(pdf.W - pdf.m - 150, pdf.y + 2, 8, 8, { fill: COLORS.est }); pdf.text('Estimated', pdf.W - pdf.m - 138, pdf.y + 9, { size: 7.5 }); pdf.rect(pdf.W - pdf.m - 80, pdf.y + 2, 8, 8, { fill: COLORS.act }); pdf.text('Actual', pdf.W - pdf.m - 68, pdf.y + 9, { size: 7.5 });
  const top = pdf.y + 22, h = height - 32, max = Math.max(1, ...cats.flatMap((c) => [c.estimated, c.actual])), yOf = (v) => top + h - (v / max) * h;
  for (let i = 0; i <= 4; i++) { const v = (max * i) / 4, y = yOf(v); pdf.line(x0, y, x0 + w, y, { color: '#e4e8df', lw: 0.5 }); pdf.text(v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${(v / 1e3).toFixed(0)}K`, x0 - 4, y + 3, { size: 7, align: 'right', color: '#7b8a80' }); }
  const slot = w / Math.max(cats.length, 1), bw = Math.min(20, slot / 3);
  cats.forEach((c, i) => { const cx = x0 + slot * i + slot / 2; pdf.rect(cx - bw - 1, yOf(c.estimated), bw, Math.max(0.8, yOf(0) - yOf(c.estimated)), { fill: COLORS.est }); pdf.rect(cx + 1, yOf(c.actual), bw, Math.max(0.8, yOf(0) - yOf(c.actual)), { fill: COLORS.act }); pdf.text(c.category.slice(0, 12), cx, top + h + 11, { size: 7, align: 'center' }); });
  pdf.y += height + 14;
}
function pdfEvmChart(pdf, R) {
  const { pv, ev, ac } = R.snap.inputs, hist = R.project.evm.history, pts = [...hist.map((x) => ({ l: x.date.slice(2), pv: x.pv, ev: x.ev, ac: x.ac })), { l: R.project.evm.asOf || 'Now', pv, ev, ac }];
  if (!(hist.length && pts.every((p) => ['pv', 'ev', 'ac'].every((k) => typeof p[k] === 'number')))) return pdfBarChart(pdf, { title: 'EVM performance: PV, EV and AC', bars: [{ label: 'PV planned', value: pv ?? 0, color: COLORS.pv }, { label: 'EV earned', value: ev ?? 0, color: COLORS.ev }, { label: 'AC actual', value: ac ?? 0, color: COLORS.ac }] });
  const x0 = pdf.m + 70, w = pdf.W - 2 * pdf.m - 90, height = 140; pdf.ensure(height + 34); pdf.text('EVM performance: PV, EV and AC over time', pdf.m, pdf.y + 10, { size: 9.5, bold: true });
  [['PV', COLORS.pv], ['EV', COLORS.ev], ['AC', COLORS.ac]].forEach(([l, c], i) => { const x = pdf.W - pdf.m - 150 + i * 50; pdf.rect(x, pdf.y + 2, 8, 8, { fill: c }); pdf.text(l, x + 12, pdf.y + 9, { size: 7.5 }); });
  const top = pdf.y + 22, h = height - 32, max = Math.max(1, ...pts.flatMap((p) => [p.pv, p.ev, p.ac])), yOf = (v) => top + h - (v / max) * h, xOf = (i) => x0 + 10 + (w - 20) * i / Math.max(1, pts.length - 1);
  for (let i = 0; i <= 4; i++) { const v = (max * i) / 4, y = yOf(v); pdf.line(x0, y, x0 + w, y, { color: '#e4e8df', lw: 0.5 }); pdf.text(`${(v / 1e6).toFixed(1)}M`, x0 - 4, y + 3, { size: 7, align: 'right', color: '#7b8a80' }); }
  [['pv', COLORS.pv], ['ev', COLORS.ev], ['ac', COLORS.ac]].forEach(([k, c]) => pdf.polyline(pts.map((p, i) => [xOf(i), yOf(p[k])]), { color: c, lw: 2 }));
  pts.forEach((p, i) => pdf.text(p.l, xOf(i), top + h + 11, { size: 7, align: 'center' })); pdf.y += height + 14;
}

export function buildReportPdf(input, when = new Date(), analysis = null) {
  const R = buildReportModel(input, when, analysis), { project, rows, totals: t, snap, analysis: n, warnings } = R, pdf = new Pdf({ title: `CostLens report - ${project.name}` });
  const rc = (r) => RAG_COLOR[r], vc = (v) => (v < 0 ? COLORS.bad : COLORS.good);
  pdf.rect(0, 0, pdf.W, 74, { fill: '#1f5f46' }); pdf.rect(0, 74, pdf.W, 4, { fill: '#e8913a' });
  pdf.text('CostLens', pdf.m, 34, { size: 22, bold: true, color: '#ffffff' }); pdf.text('Project Cost & Earned Value Report', pdf.m, 54, { size: 11, color: '#e8f1ea' });
  pdf.text(`Generated ${R.when.toISOString().slice(0, 16).replace('T', ' ')} UTC`, pdf.W - pdf.m, 34, { size: 8.5, color: '#e8f1ea', align: 'right' });
  pdf.y = 92; pdf.text(project.name, pdf.m, pdf.y + 14, { size: 16, bold: true }); pdf.y += 24;
  pdf.paragraph(`Cost items: ${t.count}   |   Planned: ${project.evm.start || 'not set'} to ${project.evm.end || 'not set'}   |   Status date: ${project.evm.asOf || 'not set'}   |   Tolerance: ${project.threshold}%`, { size: 8.5, color: '#5d6e64' });
  pdf.heading('1. Cost analysis (line items)');
  pdf.tiles([{ label: 'TOTAL ESTIMATED COST', value: currency(t.estimated) }, { label: 'TOTAL ACTUAL COST', value: currency(t.actual), color: COLORS.act }, { label: 'COST VARIANCE (EST - ACT)', value: currency(t.variance), color: vc(t.variance) }, { label: '% VARIANCE', value: pctPoints(t.pct), color: vc(t.variance) }]);
  pdf.heading('2. Earned value management');
  const e = Object.fromEntries(evmRows(R).map((r) => [r.key, r]));
  const SHORT = { BAC: 'BUDGET (BAC)', PV: 'PLANNED VALUE (PV)', EV: 'EARNED VALUE (EV)', AC: 'ACTUAL COST (AC)', CV: 'COST VARIANCE (CV)', SV: 'SCHEDULE VAR. (SV)', CPI: 'COST INDEX (CPI)', SPI: 'SCHEDULE INDEX (SPI)', EAC: 'EST. AT COMPLETION', ETC: 'EST. TO COMPLETE', VAC: 'VAR. AT COMPLETION', TCPI: 'TO-COMPLETE (TCPI)' };
  const tile = (k) => ({ label: SHORT[k], value: e[k].value === null || e[k].value === undefined ? 'N/A' : e[k].text, color: rc(e[k].rag === 'na' ? 'na' : e[k].rag), sub: e[k].value === null ? e[k].text.replace(/^N\/A \(|\)$/g, '') : `${e[k].key === 'BAC' || e[k].key === 'PV' || e[k].key === 'EV' || e[k].key === 'AC' ? '' : '= '}${e[k].formula}` });
  pdf.tiles(['BAC', 'PV', 'EV', 'AC'].map(tile), 4); pdf.tiles(['CV', 'SV', 'CPI', 'SPI'].map(tile), 4); pdf.tiles(['EAC', 'ETC', 'VAC', 'TCPI'].map(tile), 4);
  pdf.paragraph(`Cost status: ${snap.costStatus.text}.  Schedule status: ${snap.scheduleStatus.text}.  CV (EV - AC) is the earned-value variance and is different from the line-item cost variance (Estimated - Actual) shown in section 1.`, { size: 8.5, color: '#5d6e64' });
  pdf.heading('3. Budget warnings');
  if (warnings.length) pdf.table(['Severity', 'Warning'], warnings.map((w) => [{ t: w.severity.toUpperCase(), b: true, c: w.severity === 'critical' ? COLORS.bad : w.severity === 'warning' ? '#c9731a' : '#5d6e64' }, `${w.title}. ${w.text}`]), { widths: [1, 7] }); else pdf.paragraph('No budget warnings.');
  pdf.heading('4. Charts and visual summaries', { keep: 190 });
  pdfGroupChart(pdf, t.categories.slice(0, 8));
  pdfBarChart(pdf, { title: 'Cost variance by category (Estimated - Actual): green = under budget, red = over', bars: t.categories.slice(0, 8).map((c) => ({ label: c.category, value: c.variance, color: vc(c.variance) })) });
  pdfEvmChart(pdf, R);
  if (snap.metrics.eac !== null) pdfBarChart(pdf, { title: `Project budget (BAC) vs forecast final cost (EAC): VAC ${signedCurrency(snap.metrics.vac)}`, bars: [{ label: 'BAC budget', value: snap.inputs.bac, color: COLORS.est }, { label: 'AC to date', value: snap.inputs.ac, color: COLORS.act }, { label: 'EAC forecast', value: snap.metrics.eac, color: snap.metrics.eac > snap.inputs.bac ? COLORS.bad : COLORS.good }], height: 120 });
  else pdf.paragraph(`BAC vs EAC chart unavailable: ${snap.metrics.why.eac ?? 'EVM inputs missing'}.`, { size: 9, color: '#5d6e64' });
  pdf.heading('5. Analysis and recommendations');
  pdf.paragraph(`Source: ${R.analysisLabel}${n.source === 'ai' && n.model ? ` (${n.model})` : ''}`, { size: 8.5, bold: true, color: '#c9731a' });
  pdf.paragraph(n.headline, { size: 11, bold: true }); pdf.paragraph(n.summary);
  if (n.performance.length) { pdf.paragraph('Why CPI and SPI look this way', { bold: true, color: '#1f5f46', gap: 2 }); n.performance.forEach((p) => pdf.paragraph(`${p.title}. ${p.text}`, { gap: 3 })); }
  if (n.eacExplanation) { pdf.paragraph('Forecast final cost (EAC)', { bold: true, color: '#1f5f46', gap: 2 }); pdf.paragraph(n.eacExplanation); }
  if (n.unusual.length) { pdf.paragraph('Unusual expenses', { bold: true, color: '#1f5f46', gap: 2 }); pdf.bullets(n.unusual.map((a) => `[${a.severity}] ${a.title}. ${a.detail}`)); }
  if (n.categoryOverruns.length) { pdf.paragraph('Category overruns', { bold: true, color: '#1f5f46', gap: 2 }); pdf.bullets(n.categoryOverruns.map((c) => `${c.category}: ${c.detail}`)); }
  if (n.risks.length) { pdf.paragraph('Budget risks', { bold: true, color: '#1f5f46', gap: 2 }); pdf.bullets(n.risks); }
  if (n.recommendations.length) { pdf.paragraph('Recommended actions', { bold: true, color: '#1f5f46', gap: 2 }); pdf.bullets(n.recommendations); }
  pdf.heading('6. Cost detail');
  pdf.table(['Category', 'Description', 'Estimated', 'Actual', 'Variance', 'Var %'], [...rows.map((r) => [r.category, r.description, currency(r.estimated), currency(r.actual), { t: currency(r.variance), c: vc(r.variance) }, { t: pctPoints(r.pct), c: vc(r.variance) }]), [{ t: 'TOTAL', b: true }, '', { t: currency(t.estimated), b: true }, { t: currency(t.actual), b: true }, { t: currency(t.variance), b: true, c: vc(t.variance) }, { t: pctPoints(t.pct), b: true, c: vc(t.variance) }]], { widths: [2, 3, 2.3, 2.3, 2.3, 1.2], aligns: ['l', 'l', 'r', 'r', 'r', 'r'] });
  pdf.paragraph(n.source === 'ai' ? 'The analysis was generated by an AI model from the figures in this report; verify before acting.' : 'The analysis was produced by statistical and rule-based logic, not by a generative AI model. It is decision support, not audit evidence.', { size: 8, color: '#7b8a80' });
  return pdf.finish(`CostLens - ${project.name}`);
}
