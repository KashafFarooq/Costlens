# Risk register

| Risk | Likelihood | Impact | Mitigation | Covering test |
|---|---|---|---|---|
| Incorrect formula | Medium | High | Pure functions and reference case | TC-001 |
| Malicious import/XSS | Medium | High | Schema validation and textContent | TC-004 |
| Storage corruption | Medium | Medium | Safe empty-state fallback | Integration |
| Floating-point display error | Medium | Medium | Display-only formatting | TC-001 |
