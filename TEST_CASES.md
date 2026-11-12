# Test cases

| ID | Requirement | Description | Expected result | Technique | Priority |
|---|---|---|---|---|---|
| TC-001 | FR-01 | Reference case 150000/22500/18000/21000 | CPI 0.86, SPI 0.80, EAC 175000, VAC -25000 | Decision table | P0 |
| TC-002 | FR-02 | PV=EV=AC | CPI and SPI equal 1 | Equivalence partition | P0 |
| TC-003 | NFR-01 | Invalid date 2026-02-30 | Validation error, no result | Negative/BVA | P0 |
| TC-004 | SEC-01 | Import unknown key or oversized file | Import rejected | Security | P0 |
| TC-005 | SEC-02 | Export note beginning with `=` | CSV cell prefixed with apostrophe | Security | P0 |
| TC-006 | FR-03 | AC=0, PV=0 | Explicit N/A/undefined labels, no Infinity | Boundary | P0 |
