# Security notes

See `docs/SECURITY_ANALYSIS.md` for the full threat analysis, checklist, test evidence and deployment notes.

Summary: no backend and no accounts; all data stays in the browser. Strict CSP (no inline script/style, `connect-src 'none'`), upload allow-list with magic-byte and zip inspection, strict validation, escaped output, CSV formula neutralisation, client-side rate limiting, re-validation of stored data. Multi-user access control is future work and required before any shared deployment.

## Update: AI proxy and exports

- `/api/analyze` is the only network call. The API key exists only in server environment variables; request bodies are size-limited, rebuilt from a whitelist, and rate-limited; model output is validated and sanitised before display.
- The CSP changed from `connect-src 'none'` to `connect-src 'self'` for this endpoint only.
- PDF and Excel files are produced in the browser by dependency-free writers. Text in Excel is always written as string cells, so formula injection is not possible.
