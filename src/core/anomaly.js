import { calcAll, summarize } from './cost.js';

const fmt = (n) => `PKR ${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const SEV = { critical: 0, warning: 1, info: 2 };

// Statistical + rule-based anomaly detection (runs locally; no data leaves the browser).
export function detectAnomalies(project) {
  const rows = calcAll(project);
  const total = summarize(rows);
  const out = [];
  const add = (a) => out.push(a);

  // 1. Robust outlier test on % overrun (modified z-score, Iglewicz & Hoffman threshold 3.5)
  const measurable = rows.filter((r) => r.pct !== null);
  if (measurable.length >= 5) {
    const xs = measurable.map((r) => -r.pct);
    const med = median(xs);
    const mad = median(xs.map((x) => Math.abs(x - med)));
    if (mad > 0) measurable.forEach((r) => {
      const z = (0.6745 * (-r.pct - med)) / mad;
      if (Math.abs(z) > 3.5) add({ id: `outlier-${r.id}`, severity: z > 0 ? 'critical' : 'warning', type: 'Statistical outlier', itemId: r.id, title: `${r.description}: ${z > 0 ? 'unusually high overrun' : 'unusually large underspend'}`, detail: `${Math.abs(r.pct).toFixed(1)}% ${z > 0 ? 'over' : 'under'} estimate, far from the typical line item (modified z-score ${z.toFixed(1)}).`, action: z > 0 ? 'Verify the invoice and whether scope changed.' : 'Check for unrecorded invoices or an over-padded estimate.' });
    });
  }
  // 2. Rule checks per line item
  for (const r of rows) {
    if (r.estimated === 0 && r.actual > 0) add({ id: `unbudgeted-${r.id}`, severity: 'critical', type: 'Unbudgeted spend', itemId: r.id, title: `${r.description}: spend with no estimate`, detail: `${fmt(r.actual)} was spent but no estimate exists.`, action: 'Approve through change control or reclassify.' });
    else if (r.pct !== null && r.pct <= -25 && !out.some((a) => a.itemId === r.id)) add({ id: `overrun-${r.id}`, severity: 'critical', type: 'Large overrun', itemId: r.id, title: `${r.description}: ${Math.abs(r.pct).toFixed(1)}% over estimate`, detail: `Actual ${fmt(r.actual)} vs estimate ${fmt(r.estimated)} (${fmt(r.variance)} over).`, action: 'Request a cost-to-complete re-forecast.' });
    else if (r.pct !== null && r.pct <= -project.threshold && r.pct > -25 && !out.some((a) => a.itemId === r.id)) add({ id: `watch-${r.id}`, severity: 'warning', type: 'Over threshold', itemId: r.id, title: `${r.description}: ${Math.abs(r.pct).toFixed(1)}% over estimate`, detail: `Exceeds your ${project.threshold}% tolerance.`, action: 'Review the cost drivers.' });
    if (r.estimated > 0 && r.actual === 0) add({ id: `nospend-${r.id}`, severity: 'info', type: 'No spend recorded', itemId: r.id, title: `${r.description}: nothing spent yet`, detail: `${fmt(r.estimated)} estimated but actual is zero. It may be pending or missing invoices.`, action: 'Confirm the item is not yet started.' });
    if (total.actual > 0 && r.actual / total.actual > 0.3 && rows.length >= 4) add({ id: `conc-${r.id}`, severity: 'warning', type: 'Cost concentration', itemId: r.id, title: `${r.description}: ${((r.actual / total.actual) * 100).toFixed(0)}% of all spend`, detail: 'A single line item dominates total spend, so errors here move the whole budget.', action: 'Break the item into sub-items and check it closely.' });
  }
  // 3. Possible duplicates
  const seen = new Map();
  for (const r of rows) {
    const k = `${r.category}|${r.description.toLowerCase()}|${r.actual}`;
    if (r.actual > 0 && seen.has(k)) add({ id: `dup-${r.id}`, severity: 'warning', type: 'Possible duplicate', itemId: r.id, title: `${r.description}: identical entry found`, detail: `Same category, description and amount (${fmt(r.actual)}) appear more than once.`, action: 'Check whether this was entered or invoiced twice.' });
    else seen.set(k, r.id);
  }
  // 4. Category-level overrun
  for (const c of total.categories) if (c.pct !== null && c.pct <= -project.threshold && c.count > 1) add({ id: `cat-${c.category}`, severity: 'warning', type: 'Category overrun', title: `${c.category}: ${Math.abs(c.pct).toFixed(1)}% over budget`, detail: `${c.count} items, ${fmt(c.variance)} over in total.`, action: 'Review the category budget.' });

  return out.sort((a, b) => SEV[a.severity] - SEV[b.severity]);
}

// Generates a plain-language cost analysis summary from the numbers.
export function generateNarrative(project) {
  const rows = calcAll(project);
  if (!rows.length) return { headline: 'No data yet', paragraphs: ['Add cost items or import a file to generate an analysis.'], recommendations: [] };
  const t = summarize(rows);
  const anomalies = detectAnomalies(project);
  const crit = anomalies.filter((a) => a.severity === 'critical').length;
  const state = t.variance < 0 ? 'over' : 'under';
  const headline = `${project.name} is ${Math.abs(t.pct ?? 0).toFixed(1)}% ${state} budget`;
  const p = [];
  p.push(`Across ${t.count} cost items, the estimate was ${fmt(t.estimated)} and actual spend is ${fmt(t.actual)}, a ${t.variance < 0 ? 'cost overrun' : 'saving'} of ${fmt(t.variance)} (${t.pct === null ? 'n/a' : `${t.pct.toFixed(1)}%`}). ${t.overCount} item${t.overCount === 1 ? '' : 's'} exceed the ${project.threshold}% tolerance.`);
  const worst = [...t.categories].filter((c) => c.variance < 0).sort((a, b) => a.variance - b.variance)[0];
  const best = [...t.categories].filter((c) => c.variance > 0).sort((a, b) => b.variance - a.variance)[0];
  if (worst) p.push(`The largest overrun is in "${worst.category}" at ${fmt(worst.variance)} over (${worst.pct === null ? 'unbudgeted' : `${Math.abs(worst.pct).toFixed(1)}%`}).`);
  if (best) p.push(`The biggest saving is in "${best.category}" at ${fmt(best.variance)} under estimate.`);
  p.push(anomalies.length ? `The anomaly scan flagged ${anomalies.length} item${anomalies.length === 1 ? '' : 's'}, ${crit} of them critical. See the list for evidence and suggested follow-up.` : 'The anomaly scan found nothing unusual.');
  const rec = [...new Set(anomalies.slice(0, 6).map((a) => a.action))];
  if (t.variance < 0) rec.unshift('Re-forecast the cost to complete before approving further spend.');
  return { headline, paragraphs: p, recommendations: rec.slice(0, 5), anomalies, totals: t };
}
