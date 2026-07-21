# Research: OSF Purchasing Suite

**Feature**: `012-osf-purchasing-suite`  
**Date**: 2026-07-20

## R1 — Permission keys

**Decision**:
- `purchasing.tools.read` — margin calculator, supplier price compare, filtered reorder-only OSF download, purchasing tool sidebar links
- `purchasing.tools.manage` — edit `reorderThresholdPercent` (and any future tool settings); may also allow tools.read capabilities for simplicity in Roles UI grant
- `reminders.purchasing_rop_threshold` — reminder bubble only (add to `REMINDER_BUBBLE_PERMISSIONS`)
- Keep `purchasing.osf.read` / `purchasing.osf.manage` for classic OSF hub generate/columns/ROP qty/OGF/availability

**Rationale**: Spec clarification Option C — two independent new permission areas; matches existing `reminders.*` explicit-grant pattern.

**Alternatives considered**:
- Reuse `purchasing.osf.read` for tools — rejected (clarification C)
- Single mega `purchasing.suite` key — rejected (cannot split reminder vs tools)

## R2 — Signed order qty + TOTAL

**Decision**: Change `orderQty` to `floor(ROP) − floor(stock)` with no `Math.max(0, …)` (null when ROP missing). Per-warehouse cells show signed values. `TOTAL ORDER QTY` = sum of warehouse order qtys where value &gt; 0. `Common SKU Reorder` = sum of each variant’s TOTAL ORDER QTY (positive-only) across the base-SKU group (or equivalently sum of all positive per-warehouse order qtys in the group). Header row-1 SUM for per-warehouse ORDER QTY columns may still sum signed values for column totals; document that sheet TOTAL column is buy-only.

**Rationale**: Clarification example (+10, +3, −15 → TOTAL 13).

**Alternatives considered**:
- Net signed TOTAL — rejected by user
- Separate Surplus Total column — deferred (surplus visible per warehouse is enough for v1)

## R3 — Reorder threshold % storage

**Decision**: Add optional `reorderThresholdPercent` `Decimal` or `Int` (1–100) on `ProductOsfProfile`. Null/unset → treat as **70** for filtered export and reminders. Absolute `ProductOsfRop.ropQty` unchanged.

**Rationale**: Clarification A; default matches existing OSF 70% cue.

**Alternatives considered**:
- Company-wide setting only — rejected (clarification preferred per SKU)
- Replace warehouse ROP with % — rejected

## R4 — Below-threshold evaluation

**Decision**: SKU is below threshold when `totalRop > 0` and `(totalStock / totalRop) * 100 < thresholdPercent` (threshold from profile or 70). Missing/zero total ROP → unevaluable → exclude from filtered OSF and reminders.

**Rationale**: Spec US5 / FR-008; same basis as OSF “% of ROP”.

**Alternatives considered**: Per-warehouse threshold — rejected (spec: total stock vs total ROP)

## R5 — Filtered OSF generate

**Decision**: Extend `POST /api/admin/osf/generate` with `belowThresholdOnly: boolean` (default false). Require `purchasing.tools.read` when true (in addition to or instead of osf.read — **require tools.read for filtered**; full generate still osf.read). After building catalog + stock/ROP maps, drop rows not below threshold before workbook build. Empty set → 200 with empty Main + notice sheet/row OR 422 with clear message — prefer **200 empty workbook with a single notice row** so download UX stays consistent; UI also toasts “No SKUs below threshold”.

**Rationale**: Reuse pipeline; permission split per clarification.

**Alternatives considered**: Separate route — unnecessary duplication

## R6 — Calculator / price-compare API

**Decision**: One page with two panels. `GET /api/admin/purchasing/sku-pricing?q=` or `?sku=` returns identity, `discountedPrice`/`mrp`, `latestCost` / last purchase rate (allowlisted suppliers), blank if missing. Client computes margin and (new − last) / last; no persistence of new price or selling overwrite.

**Rationale**: Session-only compare; prefill sell from catalog; avoid N+1 by single-SKU ERP fetch.

**Alternatives considered**: Pure client with embedded costs — rejected (cost is ERP server-side)

## R7 — Reminder bubble evaluation

**Decision**: New category `purchasing_rop_threshold`. On reminder fetch for permitted users, run lean evaluation: company OSF columns + profiles/ROPs + ERP bins (batched), compute below-threshold SKUs, cap list like other categories, link to `/dashboard/purchasing/osf` or reorder page with filtered generate CTA. No SLA aging in v1 (list = currently below).

**Rationale**: Spec US6; live ERP matches generate truth; no new snapshot table (simplicity).

**Alternatives considered**:
- Nightly snapshot table — deferred
- Skip ERP and use Shopify qty — rejected (ordering accuracy)

## R8 — Sidebar

**Decision**: New `SidebarGroup` label **Purchasing**: Order Support File (`osf.*`), Calculator (`tools.*`), and optional Reorder / filtered entry (`tools.*`). Remove OSF link from Product Management group (or leave duplicate — **prefer move only** to avoid two homes).

**Rationale**: Spec US1.

## R9 — Excel “70% OF TOTAL ROP” columns

**Decision**: Keep existing fixed **0.7 × total ROP** Excel guidance columns unchanged. SKU `reorderThresholdPercent` drives filtered export + reminders only (may differ from 70). Do not rename Excel headers in v1.

**Rationale**: Spec FR-001 for OSF column parity; threshold is alert/filter policy, not a new Excel column unless tasks add it later.
