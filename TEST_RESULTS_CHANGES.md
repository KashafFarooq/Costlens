# Verification performed for the EVM integration

- `npm test`: 27 tests passing (formula equivalence with EVM App2, missing/invalid inputs, linking AC/BAC, reports in all formats, EVM import, AI proxy with mocked provider, security demos).
- Browser end-to-end (Chromium via Playwright): sample load, manual add, live EVM updates, AC override reconciliation, invalid input handling, CSV cost import, EVM import, rejected disguised file, AI fallback label, PDF/XLSX/CSV/HTML downloads, mobile layout without horizontal overflow, no unexpected console errors.
- Excel export recalculated in LibreOffice: 0 mismatches against cached values.
- .xlsx import uses a built-in reader (src/core/xlsxReader.js), tested with files written by Excel-compatible tools (openpyxl) including dates and unicode.
