# Quickstart: Dashboard Sales Filter Views

**Feature**: 030-dashboard-sales-filters  
**Date**: 2026-08-04

Validate the filter redesign against [spec.md](./spec.md), [data-model.md](./data-model.md), and [contracts/dashboard-sales-filters.md](./contracts/dashboard-sales-filters.md).

## Prerequisites

- Cosmo OS app running locally with a company that has mixed orders (placed, delivered, invoice-complete, bill-done-early).
- User with dashboard access.
- `npm test` available for unit checks.

## Automated checks

```bash
npx vitest run lib/page-data/dashboard-sales.test.ts
```

Expect: partition tally tests (All orders = Not delivered + Bill done early + Bill open + Done after delivery); POS excluded from delivery filters; bill-done-early not in Delivered.

## Manual today path

1. Open Dashboard (no date change).
2. Confirm From/To = **today**.
3. Confirm Group A chips show totals for **All orders**, **Not delivered**, **Bill done early**, **Bill open**, **Done after delivery**.
4. Confirm hint that those four (excluding All orders itself) add toward All orders.
5. Select **Bill open** → Grand Total matches that chip’s total.
6. Select **Bill done early** → only invoice-complete-not-delivered orders; none appear under Delivered chips.

## Manual range + old events

1. Set From/To to a known week.
2. Confirm Group B **Bill done (old orders)** / **Delivered (old orders)** totals move when range changes and can include orders placed before From.
3. Confirm those orders are **not** inside **All orders** for that range.

## Manual backlog

1. With From/To = today, note **Still bill open** / **Still not delivered** totals.
2. Change range to last month; backlog totals should stay the same (open work, any place day).

## Reconciliation (optional)

- Compare **Delivered in dates** (today) to ops delivery-complete report / Excel DL-style extract for the same day when using stage=`delivery_complete` rule from research.md.

## Done when

- Unit tests green for eligibility + tally.
- Today default + chip totals + selection sync verified once manually.
- No schema migrate required.
