# Section 8 test matrix (NFR-11)

Maps `docs/requirements.md` §8 user stories to automated tests.  
Status: **covered** | **todo** | **n/a-removed**

Run: `cd server && npm install --include=dev && npm test` (Postgres on `:5433`, DB `stockstay_test`).  
Frontend: `npm test -- --run` from repo root.

| ID | Status | Primary tests |
|----|--------|----------------|
| E1-1 | covered | `server/tests/api/e1-access.test.js`, `src/pages/LoginPage.test.tsx` |
| E1-2 | todo | Stripe manage lightly via E8 when configured |
| E1-3 | covered | `e1-access.test.js` invitations |
| E1-4 | covered | `e1-access.test.js` VIEWER_READ_ONLY; `AuthContext.test.tsx` |
| E1-5 | covered | `e1-access.test.js` org teams |
| E1-6 | covered | `e1-access.test.js` active-team switch |
| E1-7 | covered | `e1-access.test.js` AdminJS 404 when unset |
| E1-8 | covered | `e1-access.test.js` verify-email |
| E1-9 | covered | `e1-access.test.js` PLAN_LIMIT; `tests/unit/planConfig.test.js` |
| E1-10 | covered | `e1-access.test.js` `/api/contact`; `Layout.test.tsx` |
| E2-1 | covered | `e2-catalogue.test.js` |
| E2-2 | covered | `e2-catalogue.test.js` |
| E2-3 | covered | `e2-catalogue.test.js` |
| E2-4 | covered | `e2-catalogue.test.js` |
| E2-5 | covered | `e2-catalogue.test.js` |
| E2-6 | covered | `e2-catalogue.test.js` |
| E2-7 | covered | `e2-catalogue.test.js` |
| E2-8 | covered | `SupplyItem.category` string field (not localStorage); catalogue create/update in `e2-catalogue.test.js` |
| E2-9 | covered | `e2-catalogue.test.js` |
| E2-10 | covered | `e2-catalogue.test.js` |
| E2-11 | covered | `e2-catalogue.test.js` archive |
| E2-12 | covered | `e2-catalogue.test.js` low-stock |
| E3-1 | covered | `e3-e5-stock-flow.test.js` |
| E3-2 | covered | `e3-e5-stock-flow.test.js` |
| E3-3 | covered | via unbilled + property flows in E5/E6 |
| E3-4 | n/a-removed | asserted removed in `e3-e5-stock-flow.test.js` |
| E3-5 | covered | low-stock E2-12 / E7-3 |
| E3-6 | covered | `e3-e5-stock-flow.test.js` transfer |
| E3-7 | covered | `e3-e5-stock-flow.test.js` markup |
| E4-1 | covered | `e4-e5-flow.test.js` |
| E4-2 | covered | `e4-e5-flow.test.js` |
| E4-3 | todo | bulk import |
| E4-4 | covered | `ReportsPage` location-stock CSV export |
| E4-5 | covered | `e4-e5-flow.test.js` + `unit/stockLedger.test.js` |
| E4-6 | todo | locale units |
| E4-7 | covered | `security-tenancy.test.js` + `e4-e5-flow.test.js` (`allowedPropertyIds` server-side) |
| E4-8 | covered | `e4-e5-flow.test.js` SKU cap |
| E5-1 | covered | `e4-e5-flow.test.js` |
| E5-2 | covered | `e4-e5-flow.test.js` |
| E5-3 | covered | `e4-e5-flow.test.js` |
| E5-4 | covered | `e4-e5-flow.test.js` + unit |
| E5-5 | covered | `e4-e5-flow.test.js` bill-back |
| E5-6 | covered | `e4-e5-flow.test.js` unbilled |
| E5-7 | covered | `e4-e5-flow.test.js` return |
| E5-8 | covered | `e4-e5-flow.test.js` history |
| E5-9 | covered | `e3-e5-stock-flow.test.js` transfer |
| E5-10 | covered | `e4-e5-flow.test.js` insufficient stock |
| E6-1 | covered | `e6-billing.test.js` + `unit/clientBilling.test.js` |
| E6-2 | covered | `e6-billing.test.js` |
| E6-3 | covered | `e6-billing.test.js` |
| E6-4 | covered | `e6-billing.test.js` |
| E6-5 | covered | `e6-billing.test.js` (email mocked) |
| E6-6 | covered | `e6-billing.test.js` + unit CSV |
| E6-7 | covered | `e6-billing.test.js` |
| E6-8 | covered | `e6-billing.test.js` |
| E6-9 | covered | `e6-billing.test.js` |
| E6-10 | covered | `e6-billing.test.js` |
| E7-1 | todo | dedicated dashboard aggregates |
| E7-2 | covered | `e7-e8-and-removed.test.js` stock-transactions |
| E7-3 | covered | `e7-e8-and-removed.test.js` location-low-stock |
| E7-4 | todo | inventory value report |
| E7-5 | covered | `ReportsPage` CSV (location stock + stock transactions) |
| E7-6 | todo | usage by property |
| E8-1 | covered | checkout 503 without Stripe |
| E8-2 | covered | checkout 503 without Stripe |
| E8-3 | covered | portal 503 without Stripe |
| E8-4 | covered | (same billing surface) |
| E8-5 | covered | `e7-e8-and-removed.test.js`, `LandingPage.test.tsx`, `planConfig` unit |
| R-1 | covered | legacy `/api/sales` gone |
| R-2 | covered | legacy bill-to gone |

**Deferred:** Playwright E2E (signup → receive → replenish → invoice) — follow-up after this harness.
