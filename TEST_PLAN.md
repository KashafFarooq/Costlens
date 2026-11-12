# Test plan

The pure core is covered with unit tests for formulas, strict parsing, boundaries and insight decision tables. Integration tests exercise persistence, import/export and series validation. Browser acceptance tests should cover add/edit/delete, reload persistence, reset, keyboard operation and axe-core accessibility checks. Security regression includes XSS payloads, CSV injection, prototype-pollution keys, invalid JSON, oversized files and local-storage corruption. Cross-browser checks target current Chrome, Firefox and Edge.
