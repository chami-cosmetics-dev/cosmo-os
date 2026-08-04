# Research: Dashboard Sales Filter Views

**Feature**: 030-dashboard-sales-filters  
**Date**: 2026-08-04

## 1. Filter taxonomy and plain names

**Decision**: Three UI groups with canonical keys and plain labels.

| Group | Key | Plain label | Clock / rule (summary) |
|-------|-----|-------------|-------------------------|
| A Status | `all_orders` | All orders | `createdAt` in range; paid/pending |
| A Status | `not_delivered` | Not delivered | Placed in range; not delivered; **exclude** bill done early |
| A Status | `bill_done_early` | Bill done early | Placed in range; `invoiceCompleteAt` set; not delivered |
| A Status | `bill_open` | Bill open | Placed in range; delivered; invoice not complete |
| A Status | `done_after_delivery` | Done after delivery | Placed in range; delivered and invoice complete (status remainder for tally) |
| B Dual/event | `bill_done_in_dates` | Bill done in dates | Placed in range **and** invoice complete in range |
| B Dual/event | `delivered_in_dates` | Delivered in dates | Placed in range **and** delivery complete in range; physically delivered (not bill-done-early) |
| B Dual/event | `bill_done_old` | Bill done (old orders) | Invoice complete in range; placed **before** range |
| B Dual/event | `delivered_old` | Delivered (old orders) | Delivery complete in range; placed **before** range |
| C Backlog | `still_bill_open` | Still bill open | Any place date; delivered; invoice not complete |
| C Backlog | `still_not_delivered` | Still not delivered | Any place date; not delivered (include bill-done-early in backlog delivery sense, or split later—default: not delivered yet, non-POS) |

**Tally (Group A only)**:  
`not_delivered + bill_done_early + bill_open + done_after_delivery = all_orders`  
Group B/C do **not** add into All orders.

**Rationale**: Matches clarify session (Option B tally; Bill done early separate; count once). Plain names address stakeholder confusion.

**Alternatives considered**: Keep old `placed_*` / `closed_in_period` labels only — rejected (hard to explain). Force all filters to sum to All orders — rejected (double clocks).

**Legacy mapping** (one release):

| Legacy | New |
|--------|-----|
| `placed_all` / `order` | `all_orders` |
| `placed_open` | `not_delivered` (plus exclude early invoice-complete) |
| `placed_pending_invoice` | `bill_open` |
| `placed_invoice_completed` | closer to `done_after_delivery` or status complete; dual-date complete → `bill_done_in_dates` |
| `closed_in_period` / `completed` | Prefer `bill_done_old` semantics when place before range; also support `bill_done_in_dates` for place∩close — document in tasks |
| `delivered_all` / `delivery_completed` | `delivered_in_dates` (with place-in-range) or `delivered_old` when place before |
| `delivered_pending_invoice` | Closest to `bill_open` by delivery date — deprecate in favor of place-based `bill_open` + backlog `still_bill_open` |

## 2. How to compute many filter totals efficiently

**Decision**: On range change, server returns **`filterSummaries: { key, total, orderCount }[]`** for all Group A+B filters scoped to the range, plus Group C backlog totals (range-independent). Active filter still drives full location/merchant chart payload via existing `sales-by-location` (or overview) fetch.

**Rationale**: SC-002 needs all chip totals visible; N full chart queries is wasteful. Summaries can use SQL aggregates / Prisma `groupBy` or a single company order scan with in-memory bucketing for the range window.

**Alternatives considered**: Client-only bucketing after one huge order dump — riskier for large months. Per-chip full chart fetch — fails 10s UX goal.

## 3. Bill done early detection

**Decision**: `invoiceCompleteAt != null` AND `deliveryCompleteAt == null` (and not voided; placed in range for Group A). Do not require specific approval-request row for v1.

**Rationale**: Spec and ops language: paid/finance path sets invoice complete before delivery; timestamp pair is sufficient and testable.

**Alternatives considered**: Require pending/approved finance approval type — more accurate but brittle; defer to later if false positives appear.

## 4. Delivered vs invoice-complete-not-delivered

**Decision**: **Delivered** filters require physical delivery (`deliveryCompleteAt` set and/or stage/outcome indicating delivered). Bill done early never appears under Delivered.

For **Delivered in dates** (place ∩ delivery date): include orders with delivery in range that were physically delivered; exclude bill-done-early. Prefer still-at-`delivery_complete` **or** delivered-with-invoice-complete for dual-date “what arrived”—clarify in tasks: default **any physically delivered in range with place in range**, while Excel-DL-style “still at delivery_complete only” remains available as `delivered_in_dates` with stage constraint if ops still need DL parity (implement as same key with stage=`delivery_complete` first to match prior 026/DL reconciliation work, then document).

**Revised default for this plan**: `delivered_in_dates` = place in range + `deliveryCompleteAt` in range + stage `delivery_complete` + non-POS + not voided (matches recent DL-aligned behavior). Orders that already moved to invoice_complete after delivery fall under `done_after_delivery` / `bill_done_in_dates`, not this chip.

## 5. Backlog independence

**Decision**: `still_bill_open` and `still_not_delivered` ignore From–To place range (FR-012). Totals always computed for company open work.

**Rationale**: Spec backlog stories; aging work must not disappear when viewing “today.”

## 6. UI layout

**Decision**: Single filters card with three labeled sections (A/B/C); each filter is a selectable chip/radio showing **label + total**. Default selection `all_orders` with From=To=today. Helper text under Group A: “Not delivered + Bill done early + Bill open + Done after delivery ≈ All orders.”

**Alternatives considered**: Separate tabs per process — deferred; more clicks. Always-visible chips without selection — still need one active chart filter.

## 7. Schema / migrations

**Decision**: No DB migration.

**Rationale**: All clocks exist on `Order`.

## 8. Agent context script

**Decision**: No `.specify` agent-context update script present in this repo’s powershell scripts; skip silently.

---

All Technical Context unknowns from planning are resolved above; no remaining NEEDS CLARIFICATION blockers for `/speckit-tasks`.
