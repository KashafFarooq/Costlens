import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMetrics } from '../src/core/evm.js';
import { parseDecimal, validateDate } from '../src/core/validation.js';

test('reference metrics are correct', () => {
  const result = calculateMetrics({ bac: 150000, pv: 22500, ev: 18000, ac: 21000 });
  assert.equal(result.plannedPercent, 0.15);
  assert.equal(result.actualPercent, 0.12);
  assert.equal(result.cv, -3000);
  assert.equal(result.sv, -4500);
  assert.equal(result.cpi, 18000 / 21000);
  assert.equal(result.spi, 0.8);
  assert.equal(result.eac, 175000);
  assert.equal(result.etc, 154000);
  assert.equal(result.vac, -25000);
});
test('zero denominators are explicit and finite', () => {
  const result = calculateMetrics({ bac: 100, pv: 0, ev: 0, ac: 0 });
  assert.equal(result.cpi, null);
  assert.equal(result.spi, null);
  assert.equal(result.eac, null);
  assert.equal(result.tcpi, 1);
});
test('strict decimal and calendar validation', () => {
  assert.equal(parseDecimal('1e5').error !== null, true);
  assert.equal(parseDecimal('1,000.25').value, 1000.25);
  assert.equal(validateDate('2026-02-30') !== null, true);
});
