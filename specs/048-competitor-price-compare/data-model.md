# Data Model: Competitor Price Compare

**Feature**: `048-competitor-price-compare`  
**Date**: 2026-09-02

## New Prisma entities

### MarketCompetitor (global seed)

| Field | Type | Notes |
|-------|------|-------|
| id | String @id | cuid |
| slug | String @unique | Stable key: `angels-beauty`, `essentials`, … |
| name | String | Display name |
| websiteDomain | String | URL host validation hint |
| sortOrder | Int | Sidebar/table order |
| active | Boolean | Default true; v1 all active |
| createdAt / updatedAt | DateTime | |

**Seed**: Six rows inserted in migration (see [research.md](./research.md) R2).

---

### MarketCompetitorLink (company-scoped)

| Field | Type | Notes |
|-------|------|-------|
| id | String @id | cuid |
| companyId | String | FK → Company |
| sku | String | Cosmo catalog SKU |
| competitorId | String | FK → MarketCompetitor |
| productUrl | String | Competitor PDP URL |
| competitorTitle | String | As shown on their site |
| listedPriceLkr | Decimal(12,2) | Latest headline price |
| inStock | Boolean | Default true |
| checkDate | DateTime @db.Date | Last verified date |
| notes | String? | pre-order, sale, etc. |
| packSizeNormalized | String? | e.g. `236ml` |
| sizeMismatchConfirmed | Boolean | Default false; true when user overrides warning |
| createdById | String? | FK → User |
| updatedById | String? | FK → User |
| createdAt / updatedAt | DateTime | |

**Constraints**:
- `@@unique([companyId, sku, competitorId])` — one link per competitor per SKU
- `@@index([companyId, sku])` — list queries
- `@@index([companyId, checkDate])` — stale filter

**Validation (Zod + API)**:
- `listedPriceLkr` > 0
- `productUrl` valid URL; host should match competitor domain (warn if mismatch)
- `checkDate` not in future (Colombo calendar day)

---

### MarketCompetitorPriceHistory

| Field | Type | Notes |
|-------|------|-------|
| id | String @id | cuid |
| linkId | String | FK → MarketCompetitorLink |
| listedPriceLkr | Decimal(12,2) | Previous or new snapshot |
| inStock | Boolean | At change time |
| checkDate | DateTime @db.Date | |
| changedById | String? | FK → User |
| createdAt | DateTime | Insert-only audit |

**Behavior**: On link price/checkDate change, append history row with **prior** values before update (FR-014).

---

## Existing entities (read-only sources)

### ProductItem
| Field | Layer |
|-------|-------|
| compareAtPrice | **MRP** |
| price | **PROMO** (when on sale) |
| barcode | Matching hint |
| productTitle / variantTitle | Display + pack size parse |
| vendorId | Brand filter |

### ProductOsfProfile
| Field | Layer |
|-------|-------|
| ogfPrice | **OGF** |

---

## Derived read models (API, not persisted)

### PriceLayerSnapshot
| Field | Type | Notes |
|-------|------|-------|
| mrp | number \| null | |
| promo | number \| null | null when no active promo |
| ogf | number \| null | |
| hasPromo | boolean | price < compareAtPrice |

### CompetitorPriceSlot
| Field | Type | Notes |
|-------|------|-------|
| competitorSlug | string | |
| competitorName | string | |
| linked | boolean | |
| linkId | string \| null | |
| productUrl | string \| null | |
| competitorTitle | string \| null | |
| listedPriceLkr | number \| null | |
| inStock | boolean \| null | |
| checkDate | string \| null | ISO date |
| stale | boolean | |
| notes | string \| null | |
| gaps | { mrp, promo, ogf } | % vs our layer; null when N/A |

### MarketCompareSummaryRow
| Field | Type | Notes |
|-------|------|-------|
| sku | string | |
| title | string | |
| brand | string \| null | |
| barcode | string \| null | |
| priority | string \| null | ERP priority for filters |
| prices | PriceLayerSnapshot | |
| competitorMin | number \| null | |
| competitorMax | number \| null | |
| competitorMedian | number \| null | |
| competitorCount | number | Linked competitors |
| gapPctMrp | number \| null | |
| gapPctPromo | number \| null | |
| gapPctOgf | number \| null | |
| cheapestMrp | boolean | |
| cheapestPromo | boolean | |
| cheapestOgf | boolean | |
| anyStale | boolean | Any link stale |
| latestCheckDate | string \| null | Max checkDate across links |

---

## RBAC seed

| Key | Purpose |
|-----|---------|
| `purchasing.market_prices.read` | View compare list, detail, export |
| `purchasing.market_prices.manage` | Create/update links, CSV import |

---

## Relationships

```text
MarketCompetitor (global, 6 rows)
  └── MarketCompetitorLink (companyId + sku + competitorId)
        └── MarketCompetitorPriceHistory

Company
  └── ProductItem (sku) ── MRP, PROMO
  └── ProductOsfProfile (sku) ── OGF
```

---

## Migration notes

1. `npm run db:migrate:create` — add three models + competitor seed SQL
2. `npm run db:deploy:all` — vault, cosmo-dev, cosmo-prod
3. RBAC keys added in `lib/rbac.ts` (sync on boot like other permissions)
4. No backfill required — links created by purchasing over time
