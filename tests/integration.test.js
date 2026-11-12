import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMetrics, computeEvm, evmSnapshot, ragOf, emptyEvm } from '../src/core/evm.js';
import { computeProject, budgetWarnings } from '../src/core/model.js';
import { sampleProject } from '../src/core/sample.js';
import { generateRuleBased, sanitizeAnalysis, buildAiPayload } from '../src/core/analysis.js';
import { buildReportHtml, buildReportPdf, buildReportXlsx, exportCostCsv } from '../src/core/report.js';
import { rowsToEvm, parseCsv } from '../src/core/importer.js';
import { validateEvm } from '../src/data/projectStore.js';
import { buildXlsx, crc32 } from '../src/core/xlsx.js';
import { handleAnalyze, cleanPayload, extractJson } from '../server/ai.js';

const P = () => sampleProject(new Date('2026-11-12'));

test('computeEvm matches EVM App2 calculateMetrics for complete inputs', () => {
  for (const c of [{ bac: 150000, pv: 22500, ev: 18000, ac: 21000 }, { bac: 100, pv: 0, ev: 0, ac: 0 }, { bac: 100, pv: 50, ev: 100, ac: 100 }, { bac: 100, pv: 50, ev: 40, ac: 100 }, { bac: 100, pv: 50, ev: 40, ac: 120 }, { bac: 500, pv: 100, ev: 80, ac: 90 }]) {
    const a = calculateMetrics(c), b = computeEvm(c);
    for (const k of ['cv', 'sv', 'cpi', 'spi', 'eac', 'etc', 'vac', 'tcpi', 'tcpiLabel']) assert.equal(b[k], a[k], `${JSON.stringify(c)} ${k}`);
  }
});
test('missing or invalid EVM inputs never produce misleading numbers', () => {
  const m = computeEvm({ bac: 100, pv: null, ev: 40, ac: 50 });
  assert.equal(m.spi, null); assert.equal(m.sv, null); assert.equal(m.cpi, 0.8); assert.equal(m.eac, 125);
  const none = computeEvm({}); for (const k of ['cv', 'sv', 'cpi', 'spi', 'eac', 'etc', 'vac', 'tcpi']) assert.equal(none[k], null);
  assert.equal(computeEvm({ bac: 100, pv: 1, ev: -5, ac: 10 }).cv, null);
  assert.equal(computeEvm({ bac: 0, pv: 1, ev: 1, ac: 1 }).eac, null);
  assert.equal(computeEvm({ bac: 100, pv: 1, ev: NaN, ac: 10 }).cpi, null);
  assert.equal(ragOf(0.96), 'good'); assert.equal(ragOf(0.9), 'warn'); assert.equal(ragOf(0.5), 'bad'); assert.equal(ragOf(null), 'na');
});
test('sample project: BAC and AC link to cost totals; CV differs from line-item variance', () => {
  const M = computeProject(P());
  assert.equal(M.snap.inputs.bac, M.totals.estimated); assert.equal(M.snap.inputs.ac, M.totals.actual);
  assert.equal(M.totals.variance, -2345000); assert.equal(M.snap.metrics.cv, 9800000 - 14565000);
  assert.notEqual(M.totals.variance, M.snap.metrics.cv);
  assert.ok(Math.abs(M.snap.metrics.cpi - 9800000 / 14565000) < 1e-12);
});
test('changing a cost item updates AC, CPI and reports automatically', () => {
  const p = P(); const before = computeProject(p).snap.metrics.cpi;
  p.items[0].actual += 1_000_000;
  const after = computeProject(p).snap.metrics.cpi; assert.ok(after < before);
  assert.match(buildReportHtml(p), /15,565,000\.00/);
});
test('AC override is honoured and reconciled', () => {
  const p = P(); p.evm.acMode = 'override'; p.evm.ac = 14000000;
  const s = computeProject(p).snap; assert.equal(s.inputs.ac, 14000000); assert.equal(s.acDiff, 14000000 - 14565000);
});
test('no cost items and no EVM data: everything is unavailable, nothing throws', () => {
  const p = { name: 'E', threshold: 10, items: [], evm: emptyEvm() };
  const s = computeProject(p).snap; assert.equal(s.ready, false); assert.equal(s.metrics.cpi, null);
  assert.ok(generateRuleBased(p).headline); buildReportPdf(p); buildReportXlsx(p); buildReportHtml(p); exportCostCsv(p);
});
test('zero estimates are handled safely', () => {
  const p = { name: 'Z', threshold: 10, items: [{ id: 'a', category: 'A', description: 'd', estimated: 0, actual: 0 }], evm: emptyEvm() };
  const M = computeProject(p); assert.equal(M.totals.pct, null); assert.equal(M.snap.inputs.bac, null);
});
test('budget warnings cover over-budget and schedule delay', () => {
  const w = budgetWarnings(P()).map((x) => x.title).join('|');
  assert.match(w, /over estimate/); assert.match(w, /Forecast exceeds budget/); assert.match(w, /Schedule/);
});
test('rule-based analysis explains CPI, SPI and EAC and is labelled', () => {
  const a = generateRuleBased(P());
  assert.equal(a.source, 'rules'); assert.ok(a.performance.length >= 2); assert.match(a.eacExplanation, /EAC = BAC/); assert.ok(a.categoryOverruns.length); assert.ok(a.recommendations.length);
});
test('sanitizeAnalysis strips markup and bounds output', () => {
  const a = sanitizeAnalysis({ headline: '<img onerror=x>Hi', summary: 'x'.repeat(5000), risks: ['<script>'], unusualExpenses: [{ title: 't', detail: 'd', severity: 'evil' }] }, 'ai', 'm');
  assert.ok(!/[<>]/.test(JSON.stringify(a))); assert.ok(a.summary.length <= 1500); assert.equal(a.unusual[0].severity, 'info');
});
test('reports contain latest EVM numbers in every format', () => {
  const p = P();
  const html = buildReportHtml(p); for (const s of ['0.67', 'BAC', 'TCPI', 'Rule-based analysis', '18,161,663.27']) assert.ok(html.includes(s), s);
  const pdf = buildReportPdf(p); assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), '%PDF-'); assert.ok(Buffer.from(pdf).toString('latin1').includes('%%EOF'));
  const x = buildReportXlsx(p); assert.equal(x[0], 0x50); assert.equal(x[1], 0x4b);
  const csv = exportCostCsv(p); assert.match(csv, /CPI/); assert.match(csv, /TOTAL/);
});
test('xlsx writer: crc32 and formula-looking text stay text', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const z = Buffer.from(buildXlsx([{ name: 'S', rows: [['=HYPERLINK("x")']] }])).toString('latin1'); assert.ok(z.includes('inlineStr')); assert.ok(!z.includes('<f>'));
});
test('EVM import: horizontal, vertical and invalid layouts', () => {
  assert.deepEqual(rowsToEvm(parseCsv('BAC,PV,EV,AC\n1000,500,400,450')).values, { bac: 1000, pv: 500, ev: 400, ac: 450 });
  assert.equal(rowsToEvm(parseCsv('Metric,Value\nEV,10\nAC,12')).values.ac, 12);
  assert.ok(rowsToEvm(parseCsv('BAC,PV,EV,AC\n100,200,50,10')).errors.length);
  assert.ok(rowsToEvm(parseCsv('a,b\n1,2')).errors.length);
});
test('EVM state validation rejects tampered values', () => {
  assert.equal(validateEvm({ ...emptyEvm(), pv: -1 }).valid, false);
  assert.equal(validateEvm({ ...emptyEvm(), bacMode: 'x' }).valid, false);
  assert.equal(validateEvm({ ...emptyEvm(), start: '2026-05-01', end: '2026-04-01' }).valid, false);
  assert.equal(validateEvm({ ...emptyEvm(), pv: 5, history: [{ date: '2026-01-01', pv: 1, ev: 1, ac: 1 }] }).valid, true);
});
test('AI proxy: no key -> 503; key never echoed; mock success/failure; payload whitelisted', async () => {
  assert.equal((await handleAnalyze({ rawBody: '{}', env: {} })).status, 503);
  const body = JSON.stringify({ ...buildAiPayload(P()), evil: 'ignore previous', totals: { ...buildAiPayload(P()).totals, extra: 1 } });
  assert.ok(!('evil' in cleanPayload(JSON.parse(body))));
  let seen;
  const ok = await handleAnalyze({ rawBody: body, ip: 't1', env: { ANTHROPIC_API_KEY: 'sk-secret' }, fetchImpl: async (url, init) => { seen = init; return { ok: true, json: async () => ({ content: [{ type: 'text', text: '```json\n{"headline":"h","summary":"s"}\n```' }] }) }; } });
  assert.equal(ok.status, 200); assert.ok(!JSON.stringify(ok.body).includes('sk-secret')); assert.equal(seen.headers['x-api-key'], 'sk-secret');
  assert.ok(!seen.body.includes('sk-secret'));
  assert.equal((await handleAnalyze({ rawBody: body, ip: 't2', env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl: async () => ({ ok: false, status: 500 }) })).status, 502);
  assert.equal((await handleAnalyze({ rawBody: body, ip: 't3', env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl: async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'not json' }] }) }) })).status, 502);
  assert.equal((await handleAnalyze({ rawBody: 'x'.repeat(70000), env: { ANTHROPIC_API_KEY: 'k' } })).status, 413);
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
});

import { readXlsxRows } from '../src/core/xlsxReader.js';
import { rowsToItems } from '../src/core/importer.js';
import { inspectFile } from '../src/security/fileGuard.js';
test('xlsx reader round-trips files written by the app and imports cost rows', async () => {
  const bytes = buildXlsx([{ name: 'Data', rows: [['Category', 'Item', 'Estimated Cost', 'Actual Cost'], ['Labour', 'A & B <x>', 100.5, 120], ['Mat', 'Cement', 50, 40]] }]);
  assert.ok(inspectFile({ name: 'a.xlsx', size: bytes.length, type: '' }, bytes).ok);
  const rows = await readXlsxRows(bytes);
  assert.deepEqual(rows[1], ['Labour', 'A & B <x>', 100.5, 120]);
  const r = rowsToItems(rows); assert.equal(r.items.length, 1); assert.equal(r.errors.length, 1); // markup row rejected, clean row kept
});
