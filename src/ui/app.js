import { calcAll, summarize } from '../core/cost.js';
import { validateCostItem, cleanText, newId, MAX_ITEMS } from '../core/costValidation.js';
import { groupedBarChart, varianceChart, donutChart, evmChart, bacEacChart } from '../core/charts.js';
import { buildReportHtml, buildReportPdf, buildReportXlsx, exportCostCsv } from '../core/report.js';
import { parseCsv, rowsToItems, rowsToEvm, EVM_TEMPLATE_CSV } from '../core/importer.js';
import { SAMPLE_ITEMS, TEMPLATE_CSV, sampleProject } from '../core/sample.js';
import { readXlsxRows } from '../core/xlsxReader.js';
import { inspectFile, FILE_LIMITS } from '../security/fileGuard.js';
import { createLimiter } from '../security/rateLimit.js';
import { runSecurityDemos } from '../security/securityDemos.js';
import { loadProject, saveProject, parseOptionalMoney, validateEvm } from '../data/projectStore.js';
import { currency, pctPoints, index, signedCurrency } from '../utils/format.js';
import { computeProject, budgetWarnings } from '../core/model.js';
import { EVM_INFO, ragOf } from '../core/evm.js';
import { generateRuleBased, buildAiPayload, sanitizeAnalysis } from '../core/analysis.js';
import { h, download, openBlob } from './dom.js';
import { icon, kpiCard, badge, bar, table, chartNode } from './components.js';

const NAV = [['dashboard', 'Dashboard', 'home'], ['data', 'Cost data', 'list'], ['performance', 'Performance (EVM)', 'gauge'], ['import', 'Import', 'upload'], ['ai', 'AI analysis', 'spark'], ['report', 'Reports', 'file'], ['security', 'Security', 'shield']];
const statusLabel = { over: 'Over budget', watch: 'Watch', ok: 'On track' };
const tone = (v) => (v === null || v === undefined ? '' : v < 0 ? 'neg' : 'pos');
const today = () => new Date().toISOString().slice(0, 10);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project';

/* Metric presentation shared by the dashboard and the performance page. */
const KIND = { bac: 'money', pv: 'money', ev: 'money', ac: 'money', eac: 'money', etc: 'money', cv: 'signed', sv: 'signed', vac: 'signed', cpi: 'idx', spi: 'idx', tcpi: 'idx' };
const ICON = { bac: 'wallet', pv: 'calendar', ev: 'check', ac: 'coins', cv: 'scale', sv: 'clock', cpi: 'gauge', spi: 'trend', eac: 'target', etc: 'flag', vac: 'percent', tcpi: 'target' };
export function metricView(key, snap, project) {
  const i = snap.inputs, m = snap.metrics, v = ['bac', 'pv', 'ev', 'ac'].includes(key) ? i[key] : m[key];
  let text = '—', hint = '', t = 'neutral';
  if (v === null || v === undefined) {
    if (key === 'tcpi' && m.tcpiLabel) { text = 'N/A'; hint = m.tcpiLabel; t = 'bad'; }
    else hint = key === 'bac' ? 'Add cost items or enter a budget' : ['pv', 'ev'].includes(key) ? 'Not entered yet' : key === 'ac' ? 'Add cost items or enter AC' : (m.why[key] ?? 'Not available');
    return { text, hint, tone: t === 'neutral' ? 'na' : t };
  }
  text = KIND[key] === 'idx' ? index(v) : KIND[key] === 'signed' ? signedCurrency(v) : currency(v);
  if (key === 'cpi' || key === 'spi') { t = ragOf(v); hint = t === 'good' ? (key === 'cpi' ? 'Efficient spend' : 'On or ahead of plan') : t === 'warn' ? 'Needs attention' : (key === 'cpi' ? 'Cost overrun' : 'Behind schedule'); }
  else if (key === 'cv') { t = v < 0 ? 'bad' : 'good'; hint = v < 0 ? 'Over budget' : v > 0 ? 'Under budget' : 'On budget'; }
  else if (key === 'sv') { t = v < 0 ? 'bad' : 'good'; hint = v < 0 ? 'Behind schedule' : v > 0 ? 'Ahead of schedule' : 'On schedule'; }
  else if (key === 'vac') { t = v < 0 ? 'bad' : 'good'; hint = v < 0 ? 'Forecast over budget' : 'Forecast within budget'; }
  else if (key === 'eac') { t = m.vac !== null && m.vac < 0 ? 'bad' : 'good'; hint = 'Forecast final cost'; }
  else if (key === 'etc') hint = 'Forecast cost still to spend';
  else if (key === 'tcpi') { t = v > 1.1 ? 'bad' : v > 1 ? 'warn' : 'good'; hint = v > 1.1 ? 'Unrealistic recovery target' : v > 1 ? 'Must improve efficiency' : 'Achievable at current pace'; }
  else if (key === 'bac') hint = project.evm.bacMode === 'linked' ? 'Linked to total estimated cost' : 'Entered manually';
  else if (key === 'ac') { hint = project.evm.acMode === 'linked' ? 'Linked to cost data' : 'Manual override'; if (i.bac && v > i.bac) { t = 'warn'; hint += ' · exceeds BAC'; } }
  else hint = key === 'pv' ? 'Planned work to date' : 'Completed work to date';
  return { text, hint, tone: t };
}

export function renderApp(root) {
  let project = loadProject();
  let view = 'dashboard', editingId = null, pending = null, importMode = 'cost', analysis = null, aiBusy = false, aiNotice = null, query = '', sort = { key: 'category', dir: 1 }, demos = null, saveTimer;
  const limits = { import: createLimiter({ max: 8, windowMs: 60_000 }), analysis: createLimiter({ max: 10, windowMs: 60_000 }), report: createLimiter({ max: 15, windowMs: 60_000 }) };
  const toast = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite', 'data-testid': 'notice' });
  const main = h('main', { class: 'main', id: 'main', tabindex: '-1' });
  const nav = h('nav', { class: 'nav', 'aria-label': 'Sections' });
  const app = h('div', { class: 'app' });
  let timer;
  const notify = (msg, kind = 'info') => { toast.textContent = msg; toast.className = `toast show ${kind}`; clearTimeout(timer); timer = setTimeout(() => { toast.className = 'toast'; }, 7000); };
  const throttle = (name) => { const r = limits[name].tryAcquire(); if (!r.ok) notify(`Too many requests. Please wait ${Math.ceil(r.retryAfterMs / 1000)}s and try again.`, 'error'); return r.ok; };
  const save = () => { try { saveProject(project); } catch (e) { notify(e.message, 'error'); } };
  const persist = () => { analysis = null; aiNotice = null; clearTimeout(saveTimer); save(); };
  const persistSoon = () => { analysis = null; aiNotice = null; clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); };
  const go = (v) => { view = v; app.classList.remove('menu-open'); render(); main.focus(); window.scrollTo(0, 0); };
  const model = () => computeProject(project);

  const menuBtn = h('button', { type: 'button', class: 'menu-btn', 'aria-label': 'Open navigation', onclick: () => app.classList.toggle('menu-open') }, icon('menu'));
  app.append(
    h('header', { class: 'topbar' }, menuBtn, h('span', { class: 'logo sm', 'aria-hidden': 'true' }, icon('bars')), h('strong', {}, 'CostLens')),
    h('aside', { class: 'side' }, h('div', { class: 'brand' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, icon('bars')), h('div', {}, h('strong', {}, 'CostLens'), h('small', {}, 'Cost & earned value'))), nav,
      h('div', { class: 'side-foot' }, h('p', {}, 'Your data stays in this browser unless you choose AI analysis.'))),
    h('div', { class: 'scrim', onclick: () => app.classList.remove('menu-open') }), main);
  root.replaceChildren(h('a', { class: 'skip', href: '#main' }, 'Skip to content'), app, toast);

  const head = (title, sub, ...actions) => h('div', { class: 'page-head' }, h('div', {}, h('h2', {}, title), sub && h('p', { class: 'muted' }, sub)), h('div', { class: 'row' }, ...actions));
  const btn = (text, onclick, cls = '', testid, ic) => h('button', { type: 'button', class: `btn ${cls}`, onclick, 'data-testid': testid }, ic ? icon(ic, 'ico sm') : null, text);
  const panel = (cls, ...kids) => h('section', { class: `panel ${cls}` }, ...kids);
  const chartPanel = (markup, testid, cls = '') => h('div', { class: `panel chart ${cls}`, 'data-testid': testid }, chartNode(markup));
  const sectionTitle = (kicker, title, sub) => h('div', { class: 'sec-title' }, h('span', { class: 'kicker' }, kicker), h('h3', {}, title), sub && h('p', { class: 'muted' }, sub));
  const loadSample = () => { project = sampleProject(); persist(); notify('Sample project loaded.'); render(); };
  const empty = () => h('div', { class: 'panel empty', 'data-testid': 'empty-state' }, h('div', { class: 'empty-art' }, icon('bars', 'ico xl')), h('h3', {}, 'Start your project'), h('p', { class: 'muted' }, 'Enter costs, import a CSV/Excel file, or load a sample project with cost items and EVM data to explore every feature.'),
    h('div', { class: 'row center' }, btn('Load sample project', loadSample, 'primary', 'load-sample'), btn('Import a file', () => go('import')), btn('Add manually', () => go('data'))));

  /* ============================== Dashboard ============================== */
  function dashboard() {
    const M = model(), { totals: t, snap } = M;
    const hasData = t.count > 0 || snap.hasAny || snap.inputs.bac !== null;
    if (!hasData) return [head('Dashboard', project.name), empty()];
    const warnings = budgetWarnings(project, M);
    const worst = M.rows.filter((r) => r.variance < 0).sort((a, b) => a.variance - b.variance).slice(0, 5);
    const card = (k, extra = {}) => { const v = metricView(k, snap, project); return kpiCard({ abbr: EVM_INFO[k].label, label: EVM_INFO[k].name, value: v.text, hint: v.hint, tone: v.tone, icon: ICON[k], testid: `kpi-${k}`, ...extra }); };
    const vt = t.variance < 0 ? 'bad' : 'good';
    const sevTone = { critical: 'bad', warning: 'warn', info: 'neutral' };
    return [
      head('Dashboard', `${project.name}${snap.inputs.bac ? '' : ''}`, badge(snap.costStatus.text, snap.costStatus.key === 'na' ? 'neutral' : snap.costStatus.key), badge(snap.scheduleStatus.text, snap.scheduleStatus.key === 'na' ? 'neutral' : snap.scheduleStatus.key), btn('Add expense', () => go('data'), '', null, 'plus'), btn('Reports', () => go('report'), 'primary', null, 'download')),
      warnings.length ? h('div', { class: 'alerts', 'data-testid': 'warnings' }, ...warnings.slice(0, 4).map((w) => h('div', { class: `alert ${sevTone[w.severity]}` }, icon('alert', 'ico sm'), h('div', {}, h('strong', {}, w.title), h('span', {}, ` ${w.text}`)))), warnings.length > 4 ? h('button', { class: 'linkbtn', type: 'button', onclick: () => go('report') }, `+${warnings.length - 4} more in the report`) : null) : null,
      sectionTitle('Line-item cost analysis', 'Estimated vs actual', 'Variance = Estimated − Actual. Positive is under budget.'),
      h('div', { class: 'kpis four' }, kpiCard({ label: 'Total estimated cost', value: currency(t.estimated), icon: 'receipt', hint: `${t.count} cost items`, testid: 'kpi-estimated' }), kpiCard({ label: 'Total actual cost', value: currency(t.actual), icon: 'coins', tone: 'neutral', hint: 'Sum of all actual costs', testid: 'kpi-actual' }),
        kpiCard({ label: 'Cost variance', value: signedCurrency(t.variance), icon: 'scale', tone: vt, hint: t.variance < 0 ? 'Over estimate' : t.variance > 0 ? 'Under estimate' : 'On estimate', testid: 'kpi-variance' }), kpiCard({ label: 'Percentage variance', value: pctPoints(t.pct), icon: 'percent', tone: t.pct === null ? 'na' : vt, hint: t.pct === null ? 'Estimate is zero' : `${t.overCount} item${t.overCount === 1 ? '' : 's'} beyond ${project.threshold}% tolerance`, testid: 'kpi-pct' })),
      sectionTitle('Earned value management', 'Inputs', 'BAC follows total estimated cost and AC follows total actual cost unless you override them on the Performance page.'),
      h('div', { class: 'kpis four' }, card('bac'), card('pv'), card('ev'), card('ac')),
      sectionTitle('Earned value management', 'Performance and forecast', 'CV = EV − AC is separate from the line-item variance above.'),
      h('div', { class: 'kpis four' }, card('cpi'), card('spi'), card('cv'), card('sv')),
      h('div', { class: 'kpis four' }, card('eac'), card('etc'), card('vac'), card('tcpi')),
      !snap.ready ? h('div', { class: 'note-strip' }, icon('alert', 'ico sm'), h('span', {}, `Missing EVM input${snap.missing.length === 1 ? '' : 's'}: ${snap.missing.join(', ')}. Dependent metrics are hidden instead of guessed.`), btn('Enter EVM data', () => go('performance'), 'sm')) : null,
      sectionTitle('Visual summary', 'Charts', 'Hover or tap a bar for exact values.'),
      h('div', { class: 'charts' }, chartPanel(groupedBarChart(t.categories), 'chart-compare'), chartPanel(varianceChart(t.categories), 'chart-variance'), chartPanel(evmChart(snap, project.evm.history, project.evm.asOf || 'Current'), 'chart-evm'), chartPanel(bacEacChart(snap), 'chart-bac-eac'), chartPanel(donutChart(t.categories), 'chart-share', 'wide')),
      worst.length ? panel('', h('h3', {}, 'Largest overruns'), table(['Item', 'Category', 'Estimated', 'Actual', 'Variance', '%'], worst.map((r) => [r.description, r.category, [currency(r.estimated), 'n'], [currency(r.actual), 'n'], [currency(r.variance), 'neg n'], [pctPoints(r.pct), 'neg n']]))) : null,
    ];
  }

  /* ============================== Cost data ============================== */
  function data() {
    const rows = calcAll(project), t = summarize(rows), editing = project.items.find((i) => i.id === editingId);
    const cats = [...new Set(project.items.map((i) => i.category))];
    const inp = (label, name, v, extra = {}) => h('label', { class: 'field' }, h('span', {}, label), h('input', { name, type: 'text', value: v ?? '', required: true, autocomplete: 'off', maxlength: name === 'description' ? 120 : 40, inputmode: name === 'estimated' || name === 'actual' ? 'decimal' : null, 'data-testid': name, ...extra }));
    const err = h('div', { class: 'form-error', role: 'alert', 'data-testid': 'form-error' });
    const form = h('form', { class: 'panel grid-form', onsubmit: (e) => {
      e.preventDefault(); const r = validateCostItem(Object.fromEntries(new FormData(e.target)));
      if (!r.valid) { err.textContent = r.errors.join(' · '); return; }
      if (editing) Object.assign(editing, r.value); else { if (project.items.length >= MAX_ITEMS) return notify(`Limit of ${MAX_ITEMS} items reached`, 'error'); project.items.push({ id: newId(), ...r.value }); }
      editingId = null; persist(); notify(editing ? 'Expense updated.' : 'Expense added.'); render(); } },
      h('h3', {}, editing ? 'Edit expense' : 'Add expense'), inp('Category', 'category', editing?.category, { list: 'cat-list' }), h('datalist', { id: 'cat-list' }, ...cats.map((c) => h('option', { value: c }))), inp('Item name', 'description', editing?.description), inp('Estimated cost (PKR)', 'estimated', editing?.estimated), inp('Actual cost (PKR)', 'actual', editing?.actual),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit', 'data-testid': 'save-item' }, editing ? 'Save changes' : 'Add expense'), editing && btn('Cancel', () => { editingId = null; render(); })), err);
    const settings = panel('row spread', h('label', { class: 'field inline' }, h('span', {}, 'Project name'), h('input', { value: project.name, maxlength: 80, 'data-testid': 'project-name', onchange: (e) => { const v = cleanText(e.target.value); if (!v || /[<>]/.test(v)) { notify('Invalid project name', 'error'); e.target.value = project.name; return; } project.name = v; persist(); notify('Project renamed.'); } })),
      h('label', { class: 'field inline' }, h('span', {}, 'Over-budget tolerance (%)'), h('input', { type: 'number', min: 1, max: 100, step: 1, value: project.threshold, onchange: (e) => { const n = Number(e.target.value); if (!(n > 0 && n <= 100)) { notify('Tolerance must be 1-100', 'error'); e.target.value = project.threshold; return; } project.threshold = n; persist(); render(); } })));
    const q = query.toLowerCase();
    const list = rows.filter((r) => !q || `${r.category} ${r.description}`.toLowerCase().includes(q)).sort((a, b) => (a[sort.key] > b[sort.key] ? 1 : a[sort.key] < b[sort.key] ? -1 : 0) * sort.dir || 0);
    const cols = [['category', 'Category'], ['description', 'Item'], ['estimated', 'Estimated'], ['actual', 'Actual'], ['variance', 'Variance'], ['pct', '% Var'], ['status', 'Status']];
    const th = cols.map(([k, l]) => h('th', { class: ['estimated', 'actual', 'variance', 'pct'].includes(k) ? 'n' : '', 'aria-sort': sort.key === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none' }, h('button', { class: 'sortbtn', type: 'button', onclick: () => { sort = { key: k, dir: sort.key === k ? -sort.dir : 1 }; render(); } }, l, sort.key === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : '')));
    const tbl = h('div', { class: 'table-wrap' }, h('table', { 'data-testid': 'cost-table' }, h('thead', {}, h('tr', {}, ...th, h('th', {}, ''))),
      h('tbody', {}, ...list.map((r) => h('tr', {}, h('td', {}, r.category), h('td', {}, r.description), h('td', { class: 'n' }, currency(r.estimated)), h('td', { class: 'n' }, currency(r.actual)), h('td', { class: `n ${tone(r.variance)}` }, currency(r.variance)), h('td', { class: `n ${tone(r.variance)}` }, pctPoints(r.pct)), h('td', {}, h('span', { class: `badge ${r.status === 'over' ? 'bad' : r.status === 'watch' ? 'warn' : 'good'}` }, statusLabel[r.status])),
        h('td', { class: 'row nowrap' }, btn('Edit', () => { editingId = r.id; render(); window.scrollTo(0, 0); }, 'sm'), btn('Delete', () => { if (confirm('Delete this expense?')) { project.items = project.items.filter((i) => i.id !== r.id); persist(); notify('Expense deleted.'); render(); } }, 'sm danger'))))),
      rows.length ? h('tfoot', {}, h('tr', {}, h('td', { colspan: 2 }, 'Total'), h('td', { class: 'n' }, currency(t.estimated)), h('td', { class: 'n' }, currency(t.actual)), h('td', { class: `n ${tone(t.variance)}` }, currency(t.variance)), h('td', { class: `n ${tone(t.variance)}` }, pctPoints(t.pct)), h('td', { colspan: 2 }))) : null));
    return [head('Cost data', 'Enter costs manually. Variance, % variance and status update everywhere automatically.'), settings, form,
      h('div', { class: 'row spread' }, h('input', { class: 'search', type: 'search', placeholder: 'Search items…', 'aria-label': 'Search items', value: query, oninput: (e) => { query = e.target.value; const pos = e.target.selectionStart; render(); const s = main.querySelector('.search'); s.focus(); s.setSelectionRange(pos, pos); } }), rows.length ? btn('Clear all cost data', () => { if (confirm('Delete ALL cost items?')) { project.items = []; persist(); render(); } }, 'danger') : null),
      rows.length ? tbl : empty()];
  }

  /* ============================ Performance (EVM) ============================ */
  function performance() {
    const live = h('div', { class: 'live', 'data-testid': 'evm-live' });
    const errs = {};
    const field = (label, name, value, { hint, disabled = false, onInput, type = 'text' } = {}) => {
      const err = (errs[name] = h('small', { class: 'field-err', role: 'alert' }));
      const input = h('input', { name, type, value: value ?? '', disabled, autocomplete: 'off', inputmode: type === 'text' ? 'decimal' : null, 'data-testid': `evm-${name}`, id: `evm-${name}` });
      if (onInput) input.addEventListener(type === 'date' ? 'change' : 'input', (e) => onInput(e.target.value, err));
      return h('label', { class: `field${disabled ? ' disabled' : ''}` }, h('span', {}, label), input, hint ? h('small', { class: 'field-hint' }, hint) : null, err);
    };
    const num = (key, label) => (raw, err) => { const r = parseOptionalMoney(raw, label); if (r.error) { err.textContent = r.error; project.evm[key] = null; } else { err.textContent = ''; project.evm[key] = r.value; } persistSoon(); drawLive(); };
    const date = (key, label) => (raw, err) => { const e = project.evm, prev = e[key]; e[key] = raw; const v = validateEvm(e); if (!v.valid && raw) { err.textContent = v.errors.find((x) => /date|start|finish/i.test(x)) ?? v.errors[0]; e[key] = prev; if (key !== 'asOf') return; } else err.textContent = ''; persistSoon(); drawLive(); };
    const M0 = model(), costAc = M0.snap.inputs.costAc, costBac = M0.snap.inputs.costBac;
    const sel = (value, opts, onchange, testid) => h('select', { onchange: (e) => onchange(e.target.value), 'data-testid': testid }, ...opts.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
    const inputs = h('section', { class: 'panel evm-inputs' }, sectionTitle('01 · Inputs', 'Earned value inputs', 'Values update the scorecard instantly. Leave a field empty if it is not known yet; related metrics will show “—” instead of a guess.'),
      h('div', { class: 'grid-form' },
        h('div', { class: 'field' }, h('span', {}, 'BAC source'), sel(project.evm.bacMode, [['linked', `Linked: total estimated cost (${costBac === null ? 'no items yet' : currency(costBac)})`], ['manual', 'Enter manually']], (v) => { project.evm.bacMode = v; persist(); render(); }, 'evm-bac-mode')),
        field('Budget at Completion · BAC (PKR)', 'bac', project.evm.bacMode === 'manual' ? project.evm.bac : costBac, { disabled: project.evm.bacMode === 'linked', onInput: num('bac', 'BAC'), hint: project.evm.bacMode === 'linked' ? 'Follows your total estimated cost.' : 'Approved total project budget.' }),
        field('Planned Value · PV (PKR)', 'pv', project.evm.pv, { onInput: num('pv', 'PV'), hint: 'Budgeted value of work planned to the status date.' }),
        field('Earned Value · EV (PKR)', 'ev', project.evm.ev, { onInput: num('ev', 'EV'), hint: 'Budgeted value of work actually completed.' }),
        h('div', { class: 'field' }, h('span', {}, 'AC source'), sel(project.evm.acMode, [['linked', `Linked: total actual cost (${costAc === null ? 'no items yet' : currency(costAc)})`], ['override', 'Override (reconcile manually)']], (v) => { project.evm.acMode = v; if (v === 'override' && project.evm.ac === null) project.evm.ac = costAc; persist(); render(); }, 'evm-ac-mode')),
        field('Actual Cost · AC (PKR)', 'ac', project.evm.acMode === 'override' ? project.evm.ac : costAc, { disabled: project.evm.acMode === 'linked', onInput: num('ac', 'AC'), hint: project.evm.acMode === 'linked' ? 'Follows your total actual cost, so no double entry.' : 'Use when AC for the status date differs from the cost sheet.' }),
        field('Planned start', 'start', project.evm.start, { type: 'date', onInput: date('start', 'Planned start') }), field('Planned finish', 'end', project.evm.end, { type: 'date', onInput: date('end', 'Planned finish') }), field('Status date', 'asOf', project.evm.asOf, { type: 'date', onInput: date('asOf', 'Status date'), hint: 'Date these PV / EV / AC values refer to.' })));
    function drawLive() {
      const M = model(), { snap, finish } = M, m = snap.metrics, e = project.evm;
      const nodes = [];
      nodes.push(h('div', { class: 'status-row' }, h('div', { class: `status-card ${snap.costStatus.key}` }, icon('coins', 'ico'), h('div', {}, h('small', {}, 'COST STATUS (CV)'), h('strong', {}, snap.costStatus.text))), h('div', { class: `status-card ${snap.scheduleStatus.key}` }, icon('clock', 'ico'), h('div', {}, h('small', {}, 'SCHEDULE STATUS (SV)'), h('strong', {}, snap.scheduleStatus.text), finish && finish.slipDays > 0 ? h('em', {}, `Indicative finish ≈ ${finish.forecastEnd} (+${finish.slipDays} days)`) : null))));
      if (!snap.ready) nodes.push(h('div', { class: 'note-strip' }, icon('alert', 'ico sm'), h('span', {}, snap.missing.length ? `Missing: ${snap.missing.join(', ')}. Metrics that need them are shown as “—”.` : '')));
      snap.warnings.forEach((w) => nodes.push(h('div', { class: 'alert warn' }, icon('alert', 'ico sm'), h('div', {}, w))));
      if (e.acMode === 'override' && snap.inputs.costAc !== null) nodes.push(h('div', { class: 'recon' }, h('div', {}, h('small', {}, 'Cost-data total'), h('strong', {}, currency(snap.inputs.costAc))), h('div', {}, h('small', {}, 'AC used in EVM'), h('strong', {}, snap.inputs.ac === null ? '—' : currency(snap.inputs.ac))), h('div', {}, h('small', {}, 'Reconciling difference'), h('strong', { class: snap.acDiff ? 'warn' : 'pos' }, snap.acDiff === null ? '—' : signedCurrency(snap.acDiff))), btn('Re-link to cost data', () => { project.evm.acMode = 'linked'; persist(); render(); })));
      nodes.push(h('div', { class: 'metric-grid' }, ...['cpi', 'spi', 'cv', 'sv', 'eac', 'etc', 'vac', 'tcpi'].map((k) => { const v = metricView(k, snap, project); return h('article', { class: `metric ${v.tone}`, 'data-testid': `metric-${k}` }, h('div', { class: 'metric-top' }, h('b', {}, EVM_INFO[k].label), h('span', {}, EVM_INFO[k].name)), h('strong', { class: v.text === '—' ? 'dash' : '' }, v.text), h('em', {}, v.hint), h('code', {}, EVM_INFO[k].formula), h('p', {}, EVM_INFO[k].text)); })));
      if (m.plannedPercent !== null || m.earnedPercent !== null) nodes.push(h('div', { class: 'progress-panel panel' }, ...[['Planned progress (PV ÷ BAC)', m.plannedPercent, 'neutral'], ['Earned progress (EV ÷ BAC)', m.earnedPercent, 'good'], ['Budget spent (AC ÷ BAC)', m.spentPercent, m.spentPercent > 1 ? 'bad' : 'warn']].filter((x) => x[1] !== null).map(([l, v, t]) => h('div', { class: 'prog' }, h('div', { class: 'row spread' }, h('strong', {}, l), h('span', {}, `${(v * 100).toFixed(1)}%`)), bar(v * 100, t)))));
      nodes.push(h('div', { class: 'charts' }, chartPanel(evmChart(snap, e.history, e.asOf || 'Current'), 'evm-chart-pv-ev-ac'), chartPanel(bacEacChart(snap), 'evm-chart-bac-eac')));
      live.replaceChildren(...nodes);
    }
    const snapshots = () => {
      const hist = project.evm.history;
      return panel('', sectionTitle('02 · History', 'Reporting snapshots', 'Save the current PV, EV and AC at each status date to draw the EVM trend line.'),
        h('div', { class: 'row' }, btn('Save snapshot of current values', () => {
          const M = model(), i = M.snap.inputs; const date = project.evm.asOf || today();
          if (![i.pv, i.ev, i.ac].every((v) => typeof v === 'number')) return notify('Enter PV, EV and AC before saving a snapshot.', 'error');
          project.evm.asOf = date; project.evm.history = [...hist.filter((x) => x.date !== date), { date, pv: i.pv, ev: i.ev, ac: i.ac }].sort((a, b) => a.date.localeCompare(b.date));
          persist(); notify(`Snapshot saved for ${date}.`); render(); }, 'primary', 'save-snapshot')),
        hist.length ? table(['Date', 'PV', 'EV', 'AC', 'CPI', 'SPI', ''], hist.map((s, i) => [s.date, [currency(s.pv), 'n'], [currency(s.ev), 'n'], [currency(s.ac), 'n'], [s.ac ? index(s.ev / s.ac) : 'N/A', 'n'], [s.pv ? index(s.ev / s.pv) : 'N/A', 'n'], h('button', { class: 'btn sm danger', type: 'button', onclick: () => { project.evm.history.splice(i, 1); persist(); render(); } }, 'Delete')])) : h('p', { class: 'muted' }, 'No snapshots yet.'));
    };
    const glossary = h('details', { class: 'details panel' }, h('summary', {}, 'Metric reference (formulas and meaning)'), h('div', { class: 'formula-grid' }, ...Object.entries(EVM_INFO).map(([k, x]) => h('div', {}, h('strong', {}, `${x.label} · ${x.name}`), h('code', {}, x.formula), h('p', {}, x.text)))));
    drawLive();
    return [head('Performance (EVM)', 'Earned value analysis linked to your cost data. Different from line-item variance: CV = EV − AC, not Estimated − Actual.', btn('Reset EVM inputs', () => { if (confirm('Clear BAC, PV, EV, AC overrides and snapshots?')) { project.evm = { ...project.evm, bacMode: 'linked', bac: null, pv: null, ev: null, acMode: 'linked', ac: null, history: [] }; persist(); render(); } }, 'danger sm')), inputs, sectionTitle('Live results', 'Scorecard', 'Recalculated on every keystroke.'), live, snapshots(), glossary];
  }

  /* ================================ Import ================================ */
  async function readRows(file) {
    if (!file) return null;
    if (!throttle('import')) return null;
    try {
      if (file.size > FILE_LIMITS.maxBytes) { notify('File exceeds the 2 MB limit', 'error'); return null; }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const check = inspectFile({ name: file.name, size: file.size, type: file.type }, bytes);
      if (!check.ok) { notify(`Rejected: ${check.error}`, 'error'); return null; }
      if (check.kind === 'csv') return parseCsv(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      return await readXlsxRows(bytes, { maxRows: FILE_LIMITS.maxRows + 1, maxCols: FILE_LIMITS.maxCols });
    } catch (e) { notify(`Could not read the file: ${e instanceof TypeError ? 'not valid UTF-8 text' : e.message}`, 'error'); return null; }
  }
  async function handleFile(file) {
    pending = null;
    const rows = await readRows(file); if (!rows) return render();
    if (importMode === 'cost') { const res = rowsToItems(rows); pending = { kind: 'cost', name: file.name, ...res }; if (!res.items.length) notify(res.errors[0]?.message ?? 'No valid rows found', 'error'); else notify(`Parsed ${res.items.length} valid row(s). Review and confirm below.`); }
    else { const res = rowsToEvm(rows); pending = { kind: 'evm', name: file.name, ...res }; if (!Object.keys(res.values).length) notify(res.errors[0]?.message ?? 'No EVM values found', 'error'); else notify('EVM values parsed. Review and apply below.'); }
    render();
  }
  function importView() {
    const commit = (replace) => { const next = replace ? pending.items : [...project.items, ...pending.items]; if (next.length > MAX_ITEMS) return notify(`Limit of ${MAX_ITEMS} items would be exceeded`, 'error'); project.items = next; if (replace) project.name = cleanText(pending.name.replace(/\.[^.]+$/, '')).slice(0, 80) || project.name; pending = null; persist(); notify('Import complete. Totals, charts, EVM and reports are updated.'); go('dashboard'); };
    const applyEvm = () => { const v = pending.values, e = { ...project.evm };
      if (v.bac !== undefined) { e.bacMode = 'manual'; e.bac = v.bac; } if (v.pv !== undefined) e.pv = v.pv; if (v.ev !== undefined) e.ev = v.ev; if (v.ac !== undefined) { e.acMode = 'override'; e.ac = v.ac; }
      for (const k of ['asOf', 'start', 'end']) if (v[k]) e[k] = v[k];
      const chk = validateEvm(e); if (!chk.valid) return notify(chk.errors[0], 'error');
      project.evm = chk.value; pending = null; persist(); notify('EVM values applied. AC is set as an override; reconcile it on the Performance page.'); go('performance'); };
    const seg = h('div', { class: 'seg', role: 'tablist' }, ...[['cost', 'Cost items'], ['evm', 'EVM values (BAC, PV, EV, AC)']].map(([k, l]) => h('button', { type: 'button', role: 'tab', 'aria-selected': importMode === k, class: importMode === k ? 'on' : '', 'data-testid': `import-mode-${k}`, onclick: () => { importMode = k; pending = null; render(); } }, l)));
    const drop = h('label', { class: 'drop', ondragover: (e) => e.preventDefault(), ondrop: (e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); } }, icon('upload', 'ico xl'), h('strong', {}, 'Drop a .csv or .xlsx file here'), h('span', { class: 'muted' }, 'or click to browse · max 2 MB · 1,000 rows'), h('input', { type: 'file', accept: '.csv,.xlsx', hidden: true, 'data-testid': 'import-file', onchange: (e) => { handleFile(e.target.files[0]); e.target.value = ''; } }));
    const out = [head('Import from Excel / CSV', 'Files are validated first, then read locally in your browser. Nothing is uploaded.', importMode === 'cost' ? btn('Cost template (CSV)', () => download(TEMPLATE_CSV, 'costlens-cost-template.csv', 'text/csv')) : btn('EVM template (CSV)', () => download(EVM_TEMPLATE_CSV, 'costlens-evm-template.csv', 'text/csv'))), seg, drop,
      panel('', h('h3', {}, 'Expected columns'), h('p', { class: 'muted' }, importMode === 'cost' ? 'Category, Item (Description), Estimated Cost, Actual Cost. Alternatives such as Budget, Planned or Spent are recognised. Rows with errors are listed and skipped; macro-enabled, legacy .xls and renamed files are refused.' : 'Either one row with columns BAC, PV, EV, AC (optional: Status Date, Planned Start, Planned Finish), or rows of “Metric, Value”. Values replace the current EVM inputs after you confirm.'))];
    if (pending?.kind === 'cost') {
      const { items, errors } = pending;
      const cp = panel('', h('h3', {}, `Preview: ${pending.name}`), h('p', {}, h('strong', { class: 'pos' }, `${items.length} valid`), ' · ', h('strong', { class: errors.length ? 'neg' : '' }, `${errors.length} rejected`)),
        items.length ? table(['Category', 'Item', 'Estimated', 'Actual'], items.slice(0, 5).map((i) => [i.category, i.description, [currency(i.estimated), 'n'], [currency(i.actual), 'n']])) : null,
        errors.length ? h('details', { class: 'details', open: true }, h('summary', {}, 'Rejected rows'), table(['Row', 'Reason'], errors.slice(0, 20).map((e) => [String(e.row), e.message]))) : null,
        items.length ? h('div', { class: 'row' }, btn('Add to existing data', () => commit(false), 'primary', 'import-append'), btn('Replace existing data', () => commit(true), '', 'import-replace'), btn('Cancel', () => { pending = null; render(); })) : null);
      cp.setAttribute('data-testid', 'import-preview'); out.push(cp);
    }
    if (pending?.kind === 'evm') {
      const { values, errors } = pending, labels = { bac: 'BAC', pv: 'PV', ev: 'EV', ac: 'AC', asOf: 'Status date', start: 'Planned start', end: 'Planned finish' };
      const p = panel('', h('h3', {}, `Preview: ${pending.name}`),
        Object.keys(values).length ? table(['Field', 'Value'], Object.entries(values).map(([k, v]) => [labels[k], [typeof v === 'number' ? currency(v) : v, 'n']])) : null,
        errors.length ? h('details', { class: 'details', open: true }, h('summary', {}, `${errors.length} problem${errors.length === 1 ? '' : 's'}`), table(['Row', 'Reason'], errors.map((e) => [String(e.row), e.message]))) : null,
        Object.keys(values).length && !errors.length ? h('div', { class: 'row' }, btn('Apply EVM values', applyEvm, 'primary', 'import-evm-apply'), btn('Cancel', () => { pending = null; render(); })) : btn('Dismiss', () => { pending = null; render(); }));
      p.setAttribute('data-testid', 'import-evm-preview'); out.push(p);
    }
    return out;
  }

  /* ============================== AI analysis ============================== */
  async function runAi() {
    if (!project.items.length) return notify('Add cost data first', 'error');
    if (!throttle('analysis')) return;
    aiBusy = true; aiNotice = null; render();
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 60_000);
      const res = await fetch('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(buildAiPayload(project)), signal: ctl.signal }).finally(() => clearTimeout(t));
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(body.message || `HTTP ${res.status}`), { code: body.error });
      const a = sanitizeAnalysis(body.analysis, 'ai', body.model);
      if (!a.headline || !a.summary) throw new Error('The AI response was incomplete.');
      analysis = a;
    } catch (e) {
      analysis = generateRuleBased(project);
      aiNotice = e.code === 'AI_NOT_CONFIGURED' || /404|405/.test(String(e.message)) ? 'Generative AI is not configured on the server (set ANTHROPIC_API_KEY). Showing the rule-based fallback instead.' : `AI analysis was unavailable (${e.name === 'AbortError' ? 'timed out' : e.message}). Showing the rule-based fallback instead.`;
    }
    aiBusy = false; if (view === 'ai') render();
  }
  function aiView() {
    if (!analysis) analysis = generateRuleBased(project);
    const a = analysis, isAi = a.source === 'ai';
    const sev = { critical: 'bad', warning: 'warn', info: 'neutral' };
    const actions = [btn(aiBusy ? 'Generating…' : 'Generate AI analysis', runAi, 'primary', 'generate-ai', 'spark'), btn('Refresh rule-based', () => { if (!project.items.length) return notify('Add data first', 'error'); analysis = generateRuleBased(project); aiNotice = null; render(); }, '', 'generate')];
    if (aiBusy) actions[0].disabled = true;
    const out = [head('AI analysis', 'Cost summary, unusual expenses, CPI/SPI drivers, risks and recommendations.', ...actions),
      h('div', { class: `source-banner ${isAi ? 'ai' : 'rules'}`, 'data-testid': 'ai-source' }, icon(isAi ? 'spark' : 'shield', 'ico sm'), h('div', {}, h('strong', {}, isAi ? `Generative AI analysis${a.model ? ` · ${a.model}` : ''}` : 'Rule-based fallback · not generative AI'), h('span', {}, isAi ? ' Produced by an AI model from a summary of your figures. Verify before acting.' : ' Produced by deterministic statistical and rule-based logic that runs in your browser. Use “Generate AI analysis” for a generative model (requires server configuration).')))];
    if (aiNotice) out.push(h('div', { class: 'alert warn', role: 'alert', 'data-testid': 'ai-notice' }, icon('alert', 'ico sm'), h('div', {}, aiNotice)));
    if (!project.items.length) return [...out, panel('empty', h('p', { class: 'muted' }, 'Add cost items or load the sample project to generate an analysis.'), btn('Load sample project', loadSample, 'primary'))];
    const list = (items) => (items.length ? h('ul', {}, ...items.map((x) => h('li', {}, x))) : h('p', { class: 'muted' }, 'Nothing to report.'));
    const finding = (f, titleKey) => h('div', { class: `finding ${f.severity}` }, h('div', { class: 'row' }, badge(f.severity, sev[f.severity]), h('strong', {}, f[titleKey])), h('p', {}, f.detail));
    out.push(panel('ai-main', h('h3', { 'data-testid': 'ai-headline' }, a.headline), h('p', { 'data-testid': 'ai-summary' }, a.summary)),
      h('div', { class: 'two' }, panel('', h('h3', {}, 'Why CPI and SPI look this way'), ...(a.performance.length ? a.performance.map((p) => h('div', { class: 'explain' }, h('strong', {}, p.title), h('p', {}, p.text))) : [h('p', { class: 'muted' }, 'Not available.')])), panel('', h('h3', {}, 'Forecast final cost (EAC)'), h('p', {}, a.eacExplanation || 'Not available.'))),
      panel('', h('h3', {}, `Unusual expenses (${a.unusual.length})`), a.unusual.length ? h('div', { class: 'findings' }, ...a.unusual.map((f) => finding(f, 'title'))) : h('p', { class: 'muted' }, 'No unusual expenses were flagged.')),
      panel('', h('h3', {}, `Categories with cost overruns (${a.categoryOverruns.length})`), a.categoryOverruns.length ? h('div', { class: 'findings' }, ...a.categoryOverruns.map((f) => finding(f, 'category'))) : h('p', { class: 'muted' }, 'No category is over its estimate.')),
      h('div', { class: 'two' }, panel('', h('h3', {}, 'Budget risks'), list(a.risks)), panel('', h('h3', {}, 'Recommended actions'), list(a.recommendations))),
      h('p', { class: 'muted small' }, isAi ? 'Privacy: AI mode sends project name, category and item names, amounts and EVM figures to your server, which forwards them to the AI provider. The API key stays on the server.' : 'Method: modified z-score outliers on % overrun plus rules for unbudgeted spend, duplicates, concentration and category overruns; EVM drivers are derived from CPI, SPI, EAC and TCPI. No data leaves your browser in this mode.'));
    return out;
  }

  /* ================================= Reports ================================= */
  function reportView() {
    const M = model(), t = M.totals, a = analysis ?? generateRuleBased(project);
    const guard = (fn) => () => { if (!project.items.length && !M.snap.hasAny) return notify('Add data first', 'error'); if (!throttle('report')) return; try { fn(); } catch (e) { notify(`Report failed: ${e.message}`, 'error'); } };
    const name = `costlens-${slug(project.name)}-${today()}`;
    const row = (ic, title, text, ...actions) => h('div', { class: 'dl-card' }, h('span', { class: 'kpi-ico' }, icon(ic)), h('div', {}, h('strong', {}, title), h('p', { class: 'muted' }, text)), h('div', { class: 'row' }, ...actions));
    return [head('Reports', 'Every download is generated from your latest data, EVM calculations and analysis.'),
      panel('', h('h3', {}, 'Current snapshot'), h('div', { class: 'kpis four compact' }, kpiCard({ label: 'Estimated', value: currency(t.estimated), icon: 'receipt' }), kpiCard({ label: 'Actual', value: currency(t.actual), icon: 'coins' }), kpiCard({ label: 'Cost variance', value: signedCurrency(t.variance), tone: t.variance < 0 ? 'bad' : 'good', icon: 'scale' }), kpiCard({ label: 'CPI / SPI', value: `${index(M.snap.metrics.cpi)} / ${index(M.snap.metrics.spi)}`, tone: ragOf(Math.min(M.snap.metrics.cpi ?? 9, M.snap.metrics.spi ?? 9)) === 'na' || M.snap.metrics.cpi === null ? 'na' : ragOf(Math.min(M.snap.metrics.cpi ?? 9, M.snap.metrics.spi ?? 9)), icon: 'gauge' })),
        h('p', { class: 'muted' }, `Analysis in the report: ${isAiLabel(a)}. ${budgetWarnings(project, M).length} budget warning(s) will be included.`)),
      panel('', h('h3', {}, 'Download'), row('file', 'PDF report', 'Project info, costs, EVM metrics, budget warnings, four charts, analysis and recommendations.', btn('Download PDF', guard(() => download(buildReportPdf(project, new Date(), analysis), `${name}.pdf`, 'application/pdf')), 'primary', 'download-pdf', 'download')),
        row('list', 'Excel workbook', 'Summary, cost items with live formulas, categories, EVM metrics and analysis sheets.', btn('Download Excel (.xlsx)', guard(() => download(buildReportXlsx(project, new Date(), analysis), `${name}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')), 'primary', 'download-xlsx', 'download')),
        row('upload', 'CSV data', 'Cost items, totals and EVM metrics as plain CSV.', btn('Download CSV', guard(() => download(exportCostCsv(project), `${name}.csv`, 'text/csv')), '', 'download-csv', 'download')),
        row('bars', 'Web report (HTML)', 'Full report with inline charts; open the printable view to save as PDF from your browser.', btn('Download HTML', guard(() => download(buildReportHtml(project, new Date(), analysis), `${name}.html`, 'text/html')), '', 'download-report'), btn('Printable view', guard(() => openBlob(buildReportHtml(project, new Date(), analysis), 'text/html')))))];
  }
  const isAiLabel = (a) => (a.source === 'ai' ? `generative AI (${a.model || 'model'})` : 'rule-based (not generative AI)');

  /* ================================= Security ================================= */
  function securityView() {
    const done = ['Strict CSP: no inline scripts or styles; network access limited to this site (connect-src self) for the optional AI proxy', 'AI API key lives only in server environment variables; the browser never sees it; requests are whitelisted, size-limited and rate-limited', 'Upload allow-list: .csv/.xlsx only, 2 MB cap, MIME and magic-byte check, zip-bomb and macro scan', 'Strict numeric/text validation; markup characters rejected; 1,000-row cap', 'All output via textContent or escaped SVG/HTML; AI output is sanitised before display; reports are escaped', 'CSV formula-injection neutralisation on export; Excel text always written as strings', 'Client-side rate limiting on import, analysis and report actions', 'Stored data re-validated on load; legacy data migrated safely', 'No third-party scripts'];
    const todo = ['User accounts, authentication and per-project authorisation (needed for any shared/multi-user version)', 'Durable server-side rate limiting (the bundled limiter is per server instance)', 'Encryption of data at rest in browser storage', 'Audit log of changes and imports', 'Dependency scanning in CI and Subresource Integrity / lockfile pinning', 'Independent penetration test'];
    const out = [head('Security', 'Implemented controls, future work, and live safe-data security tests.', btn('Run security tests', () => { demos = runSecurityDemos(); render(); }, 'primary', 'run-tests')),
      h('div', { class: 'two' }, panel('', h('h3', {}, 'Implemented'), h('ul', { class: 'ticks' }, ...done.map((x) => h('li', {}, x)))), panel('', h('h3', {}, 'Future work'), h('ul', {}, ...todo.map((x) => h('li', {}, x)))))];
    if (demos) { const tp = panel('', h('h3', {}, 'Test results (synthetic data only)'), table(['Result', 'ID', 'Test', 'Input', 'Expected', 'Observed'], demos.map((d) => [[d.pass ? 'PASS' : 'FAIL', `badge ${d.pass ? 'good' : 'bad'}`], d.id, d.name, d.input, d.expected, d.actual]))); tp.setAttribute('data-testid', 'test-results'); out.push(tp); }
    return out;
  }

  function render() {
    nav.replaceChildren(...NAV.map(([k, l, ic]) => h('button', { type: 'button', class: 'navbtn', 'aria-current': k === view ? 'page' : null, 'data-testid': `nav-${k}`, onclick: () => go(k) }, icon(ic), h('span', {}, l))));
    const pages = { dashboard, data, performance, import: importView, ai: aiView, report: reportView, security: securityView };
    main.replaceChildren(...pages[view]().filter(Boolean));
  }
  render();
  return { go, getProject: () => project };
}
