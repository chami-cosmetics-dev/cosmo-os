# Quickstart: KOKO Duplicate Order Minimization

**Feature**: `057-koko-duplicate-orders`  
**Date**: 2026-09-18  
**Contracts**: [contracts/koko-duplicate-orders.md](./contracts/koko-duplicate-orders.md) · **Data model**: [data-model.md](./data-model.md)

## Prerequisites

- Cosmo OS admin with sample manage + finance approvals permissions
- Role/user with `finance.approvals.cancel_koko_duplicate` for cancel tests
- Company with ERPNext ingest creating KOKO unpaid sales invoices
- `npm run env:use <target>` for your DB; after migration: `npm run db:generate` + `npm run db:deploy:<target>`

## Setup (after implementation)

```bash
npm run db:migrate:create
# name migration for Order koko link-time columns + permission seed if separate
npm run db:generate
npm run db:deploy:all   # when ready for all envs — needs explicit prod confirmation
npm test                # includes lib/koko-*.test.ts
```

## Validation scenarios

### 1 — Link time required before finance

1. Ingest/create an ERP KOKO unpaid order into OS (no finance approval row yet).
2. Open Sample / Free Issue (or order detail). Confirm order is visible for merchant handling.
3. Attempt advance to print without link time → blocked.
4. Enter portal link generated time (e.g. today 11:00) → Confirm.
5. Open Finance Approvals → pending payment approval appears with that link time.

**Expect**: SC-001 style — no finance-ready KOKO without recorded time.

### 2 — Duplicate group + approve one / cancel other

1. Two ERP KOKO orders, same customer phone, identical item set, two merchants (or same), link times 11:00 and 11:30.
2. Confirm link time on both → both pending in finance.
3. Open Approvals → both in one duplicate group with both times visible.
4. Match portal paid link to 11:30 → approve that approval (existing KOKO ref flow).
5. With cancel-duplicate permission → cancel the 11:00 sibling.

**Expect**: Approved order keeps payment path; cancelled sibling cancelled in OS + ERP; no auto-approve of sibling.

### 3 — Cross-day + already-approved sibling

1. Approve order A today (same phone + items).
2. Tomorrow ingest order B same phone + items; confirm link time.
3. Finance list shows B grouped with approved A.
4. Cancel B via cancel-duplicate.

**Expect**: Group includes approved anchor within 30-day lookback.

### 4 — Soft notice at confirm (not pre-ERP)

1. With order A already in OS (pending or approved KOKO).
2. Ingest order B same phone; open link-time confirm.
3. See duplicate notice; still able to confirm.

**Expect**: No ERP/portal warning; OS notice only.

### 5 — Permission gate

1. Finance user **without** `finance.approvals.cancel_koko_duplicate` sees group, can approve, **no** cancel-duplicate action.
2. User **with** permission can cancel.

### 6 — Non-KOKO unchanged

1. ERP bank-transfer unpaid order still gets immediate finance approval (no link-time gate).

## Unit checks

```bash
npm test -- koko-duplicate
npm test -- koko-order
```

Cover: fingerprint equality, phone canonicalization, lookback window, ERP KOKO defer predicate.

## Out of scope for this quickstart

- Creating orders inside ERP UI automation
- KOKO portal API / automated paid-link detection
