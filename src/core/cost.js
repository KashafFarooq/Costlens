// Cost variance engine.
// Convention (same as CV in EVM): Variance = Estimated - Actual.
//   positive = under budget (favourable), negative = over budget (overrun).
// % Variance = Variance / Estimated x 100 (null when Estimated is 0).
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function calcItem(item, thresholdPct = 10) {
  const variance = round2(item.estimated - item.actual);
  const pct = item.estimated === 0 ? null : round2((variance / item.estimated) * 100);
  let status = 'ok';
  if (variance < 0 && (pct === null || pct <= -thresholdPct)) status = 'over';
  else if (variance < 0) status = 'watch';
  return { ...item, variance, pct, status };
}

export function calcAll(project) {
  return project.items.map((item) => calcItem(item, project.threshold));
}

export function summarize(rows) {
  const estimated = round2(rows.reduce((s, r) => s + r.estimated, 0));
  const actual = round2(rows.reduce((s, r) => s + r.actual, 0));
  const variance = round2(estimated - actual);
  const pct = estimated === 0 ? null : round2((variance / estimated) * 100);
  const byCategory = new Map();
  for (const r of rows) {
    const c = byCategory.get(r.category) ?? { category: r.category, estimated: 0, actual: 0, count: 0 };
    c.estimated += r.estimated; c.actual += r.actual; c.count += 1;
    byCategory.set(r.category, c);
  }
  const categories = [...byCategory.values()].map((c) => {
    const v = round2(c.estimated - c.actual);
    return { ...c, estimated: round2(c.estimated), actual: round2(c.actual), variance: v, pct: c.estimated === 0 ? null : round2((v / c.estimated) * 100) };
  }).sort((a, b) => b.actual - a.actual);
  return { estimated, actual, variance, pct, count: rows.length, overCount: rows.filter((r) => r.status === 'over').length, categories };
}
