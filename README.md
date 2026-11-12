# CostLens: Cost Analysis & Earned Value Management

A browser-based project cost application with integrated Earned Value Management (EVM), interactive charts, AI-assisted analysis and downloadable PDF / Excel / CSV / HTML reports.

## What's inside

- **Cost data**: add, edit, delete expenses (category, item, estimated, actual); import CSV or Excel (.xlsx, read by a built-in dependency-free reader); validated with clear errors.
  Totals, Cost Variance (Estimated − Actual) and % Variance (zero-safe).
- **Performance (EVM)**: BAC, PV, EV, AC with live CV, SV, CPI, SPI, EAC, ETC, VAC, TCPI, status banners (under/over budget, ahead/behind schedule), explanations, progress bars and reporting snapshots.
  - **BAC** follows total estimated cost and **AC** follows total actual cost by default (no double entry); each can be overridden, with a reconciliation panel showing the difference.
  - EVM formulas are identical to EVM App2 (`CV=EV−AC, SV=EV−PV, CPI=EV/AC, SPI=EV/PV, EAC=BAC/CPI, ETC=EAC−AC, VAC=BAC−EAC, TCPI=(BAC−EV)/(BAC−AC)`).
  - Missing/invalid inputs show "—" with the reason; nothing misleading is displayed.
  - EVM CV is deliberately shown separately from the line-item variance.
- **Dashboard**: all cost + EVM KPIs with green / orange / red indicators, budget warnings, 5 charts (Estimated vs Actual, Variance by category, PV/EV/AC, BAC vs EAC, cost share) with tooltips.
- **Import**: cost items or EVM values (BAC, PV, EV, AC, dates) from CSV / .xlsx, with preview before applying.
- **AI analysis**: real generative analysis through a server-side proxy (`/api/analyze`) when `ANTHROPIC_API_KEY` is set; otherwise a clearly labelled **rule-based fallback**. Covers summary, unusual expenses, category overruns, CPI/SPI explanation, EAC explanation, risks and recommendations.
- **Reports**: PDF, Excel (.xlsx with live formulas), CSV and HTML, all generated from the current data and analysis.

## Run locally

Requirements: Node.js 18+ and npm.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + integration tests (no browser needed)
npm run build && npm run preview
```

Click **Load sample project** on the dashboard to see everything populated.

## Enabling generative AI (optional)

1. Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY=...` (optionally `ANTHROPIC_MODEL`).
2. Restart `npm run dev`. The key is read only by the server middleware (`server/ai.js`); it is never bundled into frontend code.
3. Open **AI analysis → Generate AI analysis**.

For Vercel, add the same variable in Project Settings → Environment Variables; `api/analyze.js` serves the endpoint.
Without a key the app keeps working and shows the rule-based fallback with a visible label. AI mode sends project/category/item names and figures to your server, which forwards them to the AI provider.

## Import formats

- Cost sheet columns: `Category, Description/Item, Estimated Cost, Actual Cost` (aliases such as Budget/Spent recognised).
- EVM sheet: one row with `BAC, PV, EV, AC` (optional `Status Date, Planned Start, Planned Finish`) or rows of `Metric, Value`. Templates are downloadable on the Import page.

## Project structure

```
src/core      calculations (cost, evm, model, analysis), charts, importer, report, pdf.js, xlsx.js
src/data      unified project store (+ migration of older saved data)
src/ui        app screens and components
server/ai.js  AI proxy logic;  api/analyze.js  Vercel function
tests         node --test suites
```

## Notes

Data is stored in the browser (localStorage). Analysis output is decision support, not an audit opinion. See `SECURITY.md` and `docs/SECURITY_ANALYSIS.md` for the security model; the CSP now allows same-origin requests (`connect-src 'self'`) solely for the AI proxy.
