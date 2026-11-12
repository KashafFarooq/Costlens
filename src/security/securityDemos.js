// Safe, self-contained security demonstrations. They only use synthetic data and the app's real guards.
import { inspectFile } from './fileGuard.js';
import { parseCsv, rowsToItems } from '../core/importer.js';
import { createLimiter } from './rateLimit.js';
import { importJson, csvEscape } from '../data/storage.js';
import { validateCostProject } from '../core/costValidation.js';
import { buildReportHtml } from '../core/report.js';

const bytes = (...b) => new Uint8Array(b);
const enc = (s) => new TextEncoder().encode(s);

export function runSecurityDemos() {
  const results = [];
  const test = (id, name, input, expected, fn) => { let actual, pass = false; try { ({ actual, pass } = fn()); } catch (e) { actual = `Unhandled error: ${e.message}`; } results.push({ id, name, input, expected, actual, pass }); };

  // 1. Invalid file uploads
  test('T1', 'Invalid file uploads are refused before parsing', 'payroll.csv.exe; macro.xlsm; "report.xlsx" containing an MZ executable header; 5 MB file; NUL-byte "CSV"', 'Every file rejected with a specific reason', () => {
    const cases = [
      inspectFile({ name: 'payroll.csv.exe', size: 100, type: '' }, bytes(0x4d, 0x5a)),
      inspectFile({ name: 'macro.xlsm', size: 100, type: '' }, bytes(0x50, 0x4b, 3, 4)),
      inspectFile({ name: 'report.xlsx', size: 100, type: '' }, bytes(0x4d, 0x5a, 0x90, 0)),
      inspectFile({ name: 'big.csv', size: 5 * 1024 * 1024, type: 'text/csv' }, enc('a,b')),
      inspectFile({ name: 'fake.csv', size: 50, type: 'text/csv' }, bytes(0x61, 0x2c, 0, 0, 1)),
    ];
    return { pass: cases.every((c) => !c.ok), actual: cases.map((c) => c.error).join(' | ') };
  });

  // 2. Malicious cell content (XSS + formula injection)
  test('T2', 'Script/markup and spreadsheet formulas in data are neutralised', 'CSV rows containing <img onerror>, <script>, =HYPERLINK(...) and a 5,000-char cell', 'Markup rows rejected; formula neutralised on export; report HTML escapes text', () => {
    const csv = 'Category,Description,Estimated,Actual\nLabour,"<img src=x onerror=alert(1)>",100,120\nLabour,<script>alert(1)</script>,100,90\nLabour,"=HYPERLINK(""http://evil.test"",""x"")",100,90\nLabour,' + 'A'.repeat(5000) + ',1,1';
    const { items, errors } = rowsToItems(parseCsv(csv));
    const exported = csvEscape(items[0]?.description ?? '');
    const html = buildReportHtml({ name: 'Demo', threshold: 10, items: [{ id: '1', category: 'X', description: 'a&b "q"', estimated: 1, actual: 2 }] });
    const ok = errors.length === 3 && items.length === 1 && exported.startsWith('"\'=') && html.includes('a&amp;b &quot;q&quot;') && !/<script|onerror/i.test(html.replace(/<style>[\s\S]*?<\/style>/, ''));
    return { pass: ok, actual: `${errors.length} rows rejected (${errors.map((e) => e.message.slice(0, 30)).join('; ')}); exported formula cell: ${exported}; report text escaped` };
  });

  // 3. Excessive requests
  test('T3', 'Excessive requests are throttled', '20 rapid import requests against a limit of 5 per minute', '5 allowed, 15 blocked with a retry delay', () => {
    let t = 0; const lim = createLimiter({ max: 5, windowMs: 60_000, now: () => t });
    const r = Array.from({ length: 20 }, () => { t += 100; return lim.tryAcquire(); });
    const allowed = r.filter((x) => x.ok).length; t += 61_000; const later = lim.tryAcquire().ok;
    return { pass: allowed === 5 && later, actual: `${allowed} allowed, ${20 - allowed} blocked; allowed again after window: ${later}` };
  });

  // 4. Tampered / unauthorised data injected into storage or JSON import
  test('T4', 'Tampered stored data and prototype-pollution payloads are rejected', 'Project JSON with __proto__ key, a negative amount, and 100,000 items', 'All rejected; no global object polluted', () => {
    let rejected = 0;
    for (const payload of ['{"name":"x","bac":100,"start":"2026-01-01","end":"2026-02-01","entries":[],"__proto__":{"polluted":true}}', '{"constructor":{"prototype":{"polluted":true}}}']) { try { importJson(payload); } catch { rejected++; } }
    const neg = validateCostProject({ name: 'p', threshold: 10, items: [{ category: 'A', description: 'd', estimated: -5, actual: 1 }] });
    const huge = validateCostProject({ name: 'p', threshold: 10, items: new Array(100000).fill({}) });
    if (!neg.valid) rejected++; if (!huge.valid) rejected++;
    return { pass: rejected === 4 && ({}).polluted === undefined, actual: `${rejected}/4 payloads rejected; Object.prototype.polluted = ${({}).polluted}` };
  });
  return results;
}
