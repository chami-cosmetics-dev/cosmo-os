# Quickstart: Competitor Price Compare

**Feature**: `048-competitor-price-compare`  
**Date**: 2026-09-02

Validation guide after implementation (not a full test suite).

## Prerequisites

- Cosmo target env (`npm run env:use cosmo-dev` or local with DB)
- Migration applied: `npm run db:migrate:create` (feature branch) then `npm run db:deploy:cosmo-dev`
- User with `purchasing.market_prices.read` and `purchasing.market_prices.manage`
- Sample catalog SKUs with MRP (`compareAtPrice`), optional promo (`price` < MRP), and OGF on `ProductOsfProfile`
- Six competitors visible in API `meta.competitors`

## Setup

```bash
npm install
npm run db:generate
npm run db:deploy:cosmo-dev
npm run dev
```

RBAC sync adds new permissions on existing `ensureRbac` boot path.

## 1) Permission gate

1. Open `/dashboard/purchasing/market-prices` without permission → `PermissionDeniedCard`
2. Grant `purchasing.market_prices.read` → list page loads (empty or with data)
3. Attempt POST link without `manage` → `403`

## 2) Manual link + three-layer gaps

1. Pick SKU with known MRP, promo, OGF (e.g. CeraVe 236ml)
2. Add Liberty Store link: URL, title, price 8200, check date today, in stock
3. Add Kiki Beauty link at 8500
4. Confirm list shows:
   - MRP, PROMO, OGF columns
   - Median competitor = 8350
   - Gap % differs per layer
5. Toggle layer **OGF** → sort/highlight uses OGF gap
6. Set OGF below all competitors → **cheapest** indicator on OGF layer

## 3) Stale warning

1. Edit link with `check_date` 20 days ago
2. Row shows **stale** badge
3. Filter **stale only** → row appears

## 4) Pack size mismatch

1. Link competitor title "562ml" variant to Cosmo 236ml SKU
2. Save without confirm → blocked with pack size warning
3. Confirm mismatch → link saved; notes visible

## 5) CSV import

1. Download template from UI
2. Fill 5 rows (1 invalid competitor name, 1 bad SKU)
3. Upload preview → 3 valid, 2 errors listed with line numbers
4. Commit → valid rows applied; list refreshes
5. Re-import same rows with new prices → history shows prior price

## 6) Export

1. Filter **above market** on OGF layer
2. Export CSV → row count matches screen; columns include all three gap %

## 7) Detail drawer

1. Open SKU detail → six competitor slots (linked + **not tracked**)
2. Click competitor URL → opens new tab
3. Sort by gap on PROMO column

## 8) Item Trends badge (P3, if implemented)

1. Open Item Trends movement list
2. SKU with competitor links shows badge e.g. `OGF -3.7%`
3. SKU without links → no badge
4. Click badge → opens Market Prices detail for SKU

## 9) Gap math reconciliation

1. Export one SKU with 3 competitor prices: 7800, 8200, 8500
2. Median = 8200
3. Manual spreadsheet: `(ogf - 8200) / 8200 * 100` matches UI gap

## Automated checks

```bash
npx vitest run lib/market-prices/
npm run lint
npx next build
```

Unit tests should cover: median (even/odd count), gap % null cases, promo detection, stale threshold, CSV row validation, competitor slug resolution.

## Competitor reference (v1 seed)

| Name | Slug | Domain |
|------|------|--------|
| Angels Beauty | `angels-beauty` | angelsbeauty.lk |
| Essentials | `essentials` | essentials.lk |
| Liberty Store | `liberty-store` | libertystore.lk |
| Kiki Beauty | `kiki-beauty` | kikibeauty.lk |
| Dreams of Ceylonese | `dreams-of-ceylonese` | dreamsofceylonese.com |
| Watsans | `watsans` | watsans.lk |
