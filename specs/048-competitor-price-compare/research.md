# Research: Competitor Price Compare

**Feature**: `048-competitor-price-compare`  
**Date**: 2026-09-02

## R1 — Persist competitor data vs session-only

**Decision**: New Prisma models for links + price history; global `MarketCompetitor` seed table.

**Rationale**: Spec requires CSV bulk import, 14-day stale tracking, audit history (FR-012), and weekly refresh across hundreds of SKUs. Session-only (like purchasing calculator compare) cannot meet SC-002 or history requirements.

**Alternatives considered**:
- *Session-only UI state* — rejected; no persistence across users or weeks
- *JSON blob on ProductOsfProfile* — rejected; poor query/filter, no history normalization

---

## R2 — Competitor catalog: DB seed vs code constants

**Decision**: `MarketCompetitor` table seeded in migration with six fixed rows; `slug` is stable key for CSV import.

**Rationale**: FR-003 requires exactly six named retailers with domains for URL validation. DB seed allows future admin UI without code change while keeping v1 fixed set.

**Seed slugs**:

| slug | name | websiteDomain |
|------|------|---------------|
| `angels-beauty` | Angels Beauty | `angelsbeauty.lk` |
| `essentials` | Essentials | `essentials.lk` |
| `liberty-store` | Liberty Store | `libertystore.lk` |
| `kiki-beauty` | Kiki Beauty | `kikibeauty.lk` |
| `dreams-of-ceylonese` | Dreams of Ceylonese | `dreamsofceylonese.com` |
| `watsans` | Watsans | `watsans.lk` |

**Alternatives considered**:
- *Hard-coded enum in TypeScript only* — rejected; CSV import needs stable name→slug resolution documented for purchasing

---

## R3 — Cosmo price layers (MRP / PROMO / OGF)

**Decision**:
- **MRP** = `ProductItem.compareAtPrice` (same as OSF `Cosmetics MRP`)
- **PROMO** = `ProductItem.price` when on sale (`price` < `compareAtPrice` and both set); otherwise **no promo** — display PROMO as null or equals MRP with `hasPromo: false`
- **OGF** = `ProductOsfProfile.ogfPrice` for company + SKU

**Rationale**: Matches OSF workbook semantics (`lib/osf/catalog-rows.ts`, `lib/osf/formulas.ts`) and user clarification (all three layers compared independently).

**Alternatives considered**:
- *Single OGF-only baseline* — rejected per clarification session 2026-09-02
- *Manual override per compare row* — rejected; catalog is source of truth

---

## R4 — Gap calculation

**Decision**: For each SKU, collect latest `listedPriceLkr` per linked competitor (one row per competitor max). Compute **median** of those prices (even count: average of two middle values). Gap per layer:

```text
gapPct = ((ourPrice - competitorMedian) / competitorMedian) * 100
```

Blank when `ourPrice` or `competitorMedian` is null/≤0. **Cheapest** when our price < all linked competitor prices for that layer. **Above market** filter: gap > 5% on active layer.

**Rationale**: Spec FR-005/FR-007; median dampens one outlier competitor vs min alone.

**Alternatives considered**:
- *Compare vs min only* — rejected; one clearance listing would skew all gaps
- *Compare vs each competitor separately only* — kept in detail view; summary uses median

---

## R5 — Stale data

**Decision**: `stale = checkDate < today - 14 calendar days` (Asia/Colombo date for display; store `checkDate` as UTC date).

**Rationale**: FR-009; aligns with weekly purchasing workflow.

---

## R6 — CSV import workflow

**Decision**: Two-step API — `POST …/import?preview=1` returns validation report; `POST …/import` with `commitToken` applies. Reuse `parseCsvRecords`. Template columns:

```text
sku,competitor,competitor_title,product_url,price_lkr,in_stock,check_date,notes,pack_size
```

`competitor` accepts slug or display name (case-insensitive). `sku` required; barcode column optional future.

**Rationale**: FR-011/FR-012; matches contacts/allocation import preview pattern; purchasing fills offline weekly.

**Alternatives considered**:
- *Single-shot import without preview* — rejected; SC-002 requires validation feedback before commit
- *Automated scrape pipeline* — out of scope FR-017

---

## R7 — Permissions

**Decision**:
- `purchasing.market_prices.read` — view list, detail, export
- `purchasing.market_prices.manage` — create/update links, import CSV

Grant read to purchasing admin role seed; manage to same roles that have `purchasing.tools.manage` (or purchasing admin only — match item trends read pattern).

**Rationale**: FR-002; separates view from edit/import.

---

## R8 — UI placement

**Decision**: `/dashboard/purchasing/market-prices` — sibling to Item Trends and OSF tools; **not** embedded in SKU calculator.

**Rationale**: FR-001 explicitly separates market retail compare from supplier cost calculator (012).

---

## R9 — Item Trends badge (P3)

**Decision**: Shared `summarizeMarketGap(sku, layer)` in `lib/market-prices/summary.ts`; Item Trends movement API optionally includes `marketGap` field when link data exists.

**Rationale**: FR-018 SHOULD; avoids duplicate gap logic; core compare ships first.

---

## R10 — Pack size mismatch

**Decision**: Optional `packSizeNormalized` on link; on save compare to parsed size from Cosmo title if detectable (regex `\d+\s*ml|\d+\s*g`); warn + require `sizeMismatchConfirmed: true` to persist.

**Rationale**: FR-010; prevents 236ml vs 562ml silent mismatch.
