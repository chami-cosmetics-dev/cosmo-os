# Research: OSF Live Refresh & ROP Assist

**Feature**: `023-osf-rop-assist`  
**Date**: 2026-07-24

## R1 — Refresh on OSF page open

**Decision**: On OSF hub mount (and manual Refresh), call existing `syncErpProductPriorities(companyId)` (same as Items page), then load assist **page-data** which fetches live Bin stock via existing OSF ERP stock helpers for active columns. Surface per-ERP ok/failed like Items sync. Do **not** require visiting Items first.

**Rationale**: Spec FR-001/002; priority sync already implemented; stock already live on generate — assist reuses the same ERP reads.

**Alternatives considered**:
- Background cron sync only — rejected (stale until cron; user asked open-page refresh)
- Full OSF generate on open — rejected (too heavy; assist needs a work list, not xlsx)

## R2 — Assist sales window

**Decision**: Pure helper:

```text
asOf = Colombo YYYY-MM-DD (OSF as-of / open day)
if lastPurchaseDate valid and <= asOf:
  windowStart = lastPurchaseDate
else:
  windowStart = asOf − 30 days
windowEndExclusive = asOf + 1 day
sales = Σ Cosmo sold units with completion date in [windowStart, windowEndExclusive)
```

Completion rules match `aggregateMonthlySalesBySku`: non-cancelled, `delivery_complete` | `invoice_complete`, date = `deliveryCompleteAt ?? invoiceCompleteAt`. Extract shared filter; add `aggregateSalesBySkuInRange(companyId, start, end)`.

**Inclusive calendar days**: purchase day and as-of day both count (half-open end = next calendar day in Colombo).

**Rationale**: Spec clarifications; reuse proven sales definition.

**Alternatives considered**: Fixed rolling 14/24 days — rejected by stakeholder; calendar month only — insufficient for purchase→today.

## R3 — Last purchase date source

**Decision**: Use same ERP last-purchase signal as OSF generate (`fetchLastPurchaseByItem` / merge across instances). Assist page-data builds purchase date map for listed SKUs (or catalog subset). Future/unparseable date → treat as missing → 30-day fallback.

**Rationale**: Spec assumption; one source of truth with Excel OSF.

**Alternatives considered**: Cosmo-only purchase history — rejected (OSF already ERP-based).

## R4 — Suggested ROP (Option A)

**Decision**: `suggestedRop = roundHalfUp(max(0, salesInWindow))` where `roundHalfUp` = nearest integer, `.5` up. Apply **one** suggested value to **all active `includeInRop` columns** for that SKU on accept (v1). UI may show current ROP per column as read-only summary (e.g. min/max or primary); edit field is single value unless later per-column UI.

**Rationale**: Spec Option A + assumption default; simplest path matching “replace what sold.”

**Alternatives considered**: Cover-days forecast — deferred; per-location suggested from location sales — Phase 2.

## R5 — Permissions & save

**Decision**:
- View assist / refresh: `purchasing.osf.read` (and/or tools read if only reorder users — default **osf.read** for view; manage users included).
- Save ROPs: `purchasing.osf.manage` only.
- PUT body: list of `{ sku, ropQty }` for accepted rows; server upserts `ProductOsfRop` for every active includeInRop column key.

**Rationale**: Spec FR-007/008; matches existing profile PATCH gate.

## R6 — UI placement & default filter

**Decision**: New **ROP Assist** section near top of OSF hub (above or beside generate). Default priority filter = exact string `Top Priority` (match ERP1 or ERP2 priority on ProductItem). Allow “All” and other ERP priority options. Show refresh status banner. Bulk checkbox + Accept selected + Save; per-row override before save.

**Rationale**: Spec Top Priority main; hub already crowded — assist is the daily path.

**Alternatives considered**: Replace product editor entirely — rejected (keep SKU search editor for edge edits).

## R7 — Performance

**Decision**: Paginate assist page-data (e.g. 50–100 rows). Priority sync runs once per open (reuse Items sync; optional short client debounce if remount). Stock/purchase ERP calls scoped to SKUs on current page when possible; if bin API is warehouse-batched globally (current generate style), document that first full stock pass may be slower and cache in-memory for the request only.

**Rationale**: Spec scale; avoid loading 2k rows of ERP detail at once in the UI.

**Alternatives considered**: Always full-catalog assist in one response — rejected for UX/timeouts.
