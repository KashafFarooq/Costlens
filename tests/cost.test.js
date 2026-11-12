import test from 'node:test';
import assert from 'node:assert/strict';
import { calcItem, summarize } from '../src/core/cost.js';
import { detectAnomalies, generateNarrative } from '../src/core/anomaly.js';

test('variance and % variance', () => {
  const r = calcItem({ estimated: 1000, actual: 1250 });
  assert.equal(r.variance, -250); assert.equal(r.pct, -25); assert.equal(r.status, 'over');
  assert.equal(calcItem({ estimated: 0, actual: 5 }).pct, null);
  assert.equal(calcItem({ estimated: 100, actual: 50 }).status, 'ok');
});
test('summary totals', () => {
  const rows = [{ category: 'A', estimated: 100, actual: 150, status: 'over' }, { category: 'B', estimated: 100, actual: 50, status: 'ok' }].map((r) => ({ ...r, ...calcItem(r) }));
  const s = summarize(rows); assert.equal(s.estimated, 200); assert.equal(s.actual, 200); assert.equal(s.variance, 0); assert.equal(s.categories.length, 2);
});
test('anomaly detection flags outlier, unbudgeted and duplicates', () => {
  const mk = (d, e, a) => ({ id: d, category: 'C', description: d, estimated: e, actual: a });
  const items = [mk('a', 100, 101), mk('b', 100, 99), mk('c', 100, 102), mk('d', 100, 100), mk('e', 100, 98), mk('f', 100, 260), mk('g', 0, 40), mk('h', 50, 50), mk('h', 50, 50)];
  const out = detectAnomalies({ name: 'p', threshold: 10, items });
  assert.ok(out.some((a) => a.type === 'Statistical outlier' && a.itemId === 'f'));
  assert.ok(out.some((a) => a.type === 'Unbudgeted spend'));
  assert.ok(out.some((a) => a.type === 'Possible duplicate'));
  assert.match(generateNarrative({ name: 'p', threshold: 10, items }).headline, /over budget/);
});
