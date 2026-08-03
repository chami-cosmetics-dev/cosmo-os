# Quickstart: Merchant Daily Book Note

**Feature**: `029-merchant-book-note`  
**Date**: 2026-08-03

Validate capture + retrieve end-to-end after implementation. Details: [data-model.md](./data-model.md), [contracts/book-notes.md](./contracts/book-notes.md).

## Prerequisites

- Local Cosmo env (`npm run env:use` for your target)
- `npm install` && `npm run db:generate`
- Migration applied: `npm run db:migrate:create` (during impl) then `npm run db:deploy:<target>` — never `db push` on shared DBs
- Test user A: `book_notes.manage` (merchant)
- Test user B: `book_notes.read` (finance)
- At least one `CompanyLocation` and a few POS/orders at that location with `erpnextInvoiceId` or POS `name`

## 1. Merchant entry

1. Sign in as user A → open **Book Notes** (nav gated by `book_notes.manage`).
2. Confirm outlet dropdown lists company locations; pick one; date defaults to today (Colombo).
3. Add rows: type partial SI → suggestions appear → select one → invoice + amounts fill; edit a split (e.g. Cash 500 / Bank 300).
4. Save → success. Reload page with same outlet/date → rows restored.
5. Optional: Export JSON → file matches on-screen ledger shape (`company`, `posting_date`, `rows`).

**Expect**: Multi-method row highlighted; column + grand totals correct.

## 2. Same-day edit + lock

1. Same day: change an amount, remove a row, save → GET retrieve shows new data only.
2. Temporarily set posting date to yesterday (or wait / clock mock in unit test) → Save → `DAY_LOCKED` / clear UI message; data unchanged.

## 3. Finance retrieve

1. Sign in as user B (or call API with B’s session).
2. `GET /api/admin/book-notes?companyLocationId=…&postingDate=YYYY-MM-DD`
3. Confirm `days[0].rows` match saved invoices and amounts (0.01 tolerance).
4. Call with user A → 403.
5. Empty day → `{ "days": [] }`.

Example (browser session cookie / logged-in fetch):

```http
GET /api/admin/book-notes?companyLocationId=cl_YOUR_LOCATION&postingDate=2026-08-03
```

Date range (max 31 days):

```http
GET /api/admin/book-notes?companyLocationId=cl_YOUR_LOCATION&from=2026-08-01&to=2026-08-07
```

## 4. Suggestions / autofill smoke

1. Order with `rawPayload.payments` multi-mop → suggestion maps amounts into Cash/Card/KOKO/Bank.
2. Order with only `paymentGatewayPrimary` + `totalPrice` → single column filled (FR-022).
3. Manual invoice with no match still saves.

## 5. Gates

```bash
npm test
npm run lint
```

Touching only web/lib: mobile typecheck optional unless CI requires full suite.

## Done when

- [ ] Merchant can save today’s split-payment ledger and reload it
- [ ] Past-day merchant save rejected
- [ ] Finance retrieve returns intern-shaped fields
- [ ] Permission boundaries enforced
- [ ] Migration deployable via constitution workflow
