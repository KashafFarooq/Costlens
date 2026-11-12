import test from 'node:test';
import assert from 'node:assert/strict';
import { runSecurityDemos } from '../src/security/securityDemos.js';
import { inspectFile } from '../src/security/fileGuard.js';
import { parseCsv, rowsToItems } from '../src/core/importer.js';

for (const r of runSecurityDemos()) test(`${r.id} ${r.name}`, () => assert.equal(r.pass, true, r.actual));
test('valid csv accepted', () => assert.equal(inspectFile({ name: 'a.csv', size: 10, type: 'text/csv' }, new TextEncoder().encode('a,b\n1,2')).ok, true));
test('header aliases + european delimiter', () => {
  const { items, errors } = rowsToItems(parseCsv('Item;Budget;Spent\nCement;1,000.50;1200\n'));
  assert.equal(errors.length, 0); assert.equal(items[0].estimated, 1000.5); assert.equal(items[0].actual, 1200);
});
