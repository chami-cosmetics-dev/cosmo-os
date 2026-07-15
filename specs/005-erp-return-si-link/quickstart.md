# Quickstart: ERP Return SI Link

**Feature**: `005-erp-return-si-link`  
**Date**: 2026-07-15

Validation after implementation. See [contracts](./contracts/erp-return-si-link.md) and [data-model](./data-model.md).

## Prerequisites

- Feature branch implemented; migration present at `prisma/migrations/20260715133000_add_order_erp_return_sales_invoice_ids/`
- **Deploy gate (ask user first)**: after confirmation run `npm run db:deploy:all` (or `db:deploy:<target>` for one env). Do not use `db:push` on shared DBs.
- Optional legacy JSON backfill: `npx tsx scripts/backfill-erp-return-si-ids.ts [--dry-run]`
- Env: `npm run env:use vault` or `cosmo-dev` as appropriate
- ERP instance credentials on a company location
- User who can open Orders (+ `orders.manage` for recovery)

## 1. Unit tests

```bash
npx vitest run lib/erp-credit-note-order-sync.test.ts
# plus any new erp-return-si / search helper tests
npm test
```

**Expected**: Merge/dedupe Return SI ids; skip-void still records ids; search OR includes Return SI.

## 2. Live credit note → original stores Return SI

1. Pick (or create) an original OS order with known `erpnextInvoiceId`.
2. In ERP, issue a credit note / Return SI against that invoice (or replay webhook with `is_return`, `return_against`, `name`).
3. Confirm OS original order is voided/returned (unless protected).
4. Confirm `erpReturnSalesInvoiceIds` contains the Return SI name (DB or order detail UI).

**Expected**: Original SI field unchanged; Return SI listed separately.

## 3. Search by Return SI

1. On Orders, search the full Return SI number.
2. Repeat with a unique suffix (e.g. last 5–6 characters).

**Expected**: Original order appears; not only a stray `erp-{return}` stub if one exists.

## 4. Order detail display

1. Open the original order.
2. Confirm Return SI label(s) visible and distinct from original SI / Shopify id.

## 5. Multiple Return SIs

1. Issue a second return against the same original (if ERP allows).
2. Confirm both IDs present once each; search either finds the same original.

## 6. Historical recovery (if shipped)

1. Find a voided order missing Return SI but with ERP return documents.
2. `dryRun: true` recovery → list expected Return SI names.
3. Run with `dryRun: false` → column updated; search finds order.

**Expected**: Active non-credit-noted orders are not wrongly voided by recovery alone.

## 7. Migration discipline

```bash
npm run db:migrate:create
# review migration SQL
# after user confirmation:
npm run db:deploy:all
```

**Expected**: All three shared databases receive `erpReturnSalesInvoiceIds`.
