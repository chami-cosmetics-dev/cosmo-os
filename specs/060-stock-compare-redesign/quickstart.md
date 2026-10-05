# Quickstart: Stock Compare Redesign

**Feature**: `060-stock-compare-redesign`  
**Contracts**: [contracts/stock-comparer.md](./contracts/stock-comparer.md)  
**Data model**: [data-model.md](./data-model.md)

## Prerequisites

- Local app against a tenant with catalog SKUs, `ErpnextInstance`, and OSF columns that include **Main Warehouse - Cosmo** plus at least one non-shop warehouse and one shop warehouse
- User role with `reports.stock_comparer` (and a second user **without** it)
- Known SKUs:
  - Cosmetics main qty `0` with online stock and shop stock
  - Cosmetics main qty above 0 (excluded at default threshold)
  - A Company 1-only brand (e.g. Acnes / Hada Labo) with qty on ERP2
  - Website-channel Cosmetics.lk orders in the last 90 days for at least one low-main SKU

## Setup

```bash
npm install
npm run db:generate
npm run env:use <your-target>
npm run dev
```

## Automated checks

```bash
npm test -- lib/cosmetics-stock-comparer
```

Expect Vitest for:

- threshold inclusion (main qty ≤ threshold; missing Cosmo main skipped)
- skip `All Warehouses` aggregates
- shop-floor preferred over shop-main
- **online group before shops** (no Priority 1/2/3)
- brand violations both directions; zero qty not a violation
- Critical: top 20% of SKUs with sales ≥ 1; zero-sale never Critical; threshold does not change who is Critical
- sales unavailable → no Critical invented

## Manual UAT

### 1. Permission

1. Log in without `reports.stock_comparer` → no sidebar **Stock Comparer**; direct URL denied.
2. Grant permission → page opens with **main tab** selected.

### 2. Main tab default (threshold 0)

1. Run report.
2. SKU with Cosmetics main `0` appears; SKU with main `5` does not.
3. Row with both online and shop stock lists **online names first**, then shops.
4. SKU with no surplus elsewhere shows a clear “no stock elsewhere” / `No`.

### 3. Threshold + Critical

1. Set threshold `3`, run again.
2. SKU with main `2` now appears.
3. High 90-day website seller shows **Critical**; a low-sale SKU at the same main qty does not.
4. If sales fail (or in a tenant with no orders), stock rows still show and Critical is absent with a sales-unavailable note.

### 4. Brand tab

1. After the same run, open **brand** tab — no second fetch.
2. Restricted brand on the wrong company appears with rule text.
3. Same brand only on the allowed company does not appear.
4. Empty violations → explicit empty state (not the main table).

### 5. Exports

1. Main tab → Export stock report → online columns then shops, sales, Critical; no brand sheet as the primary file.
2. Brand tab → Export brand report → violation columns only.
3. Disable/hide each export when that tab’s set is empty.

### 6. Tab reuse

1. Change threshold without running → last run still shown, labeled with the **run** threshold.
2. Run again → both tabs update together.

## Done when

- [ ] Permission deny/allow works
- [ ] Default 0 and raised threshold match inclusion rules
- [ ] Online warehouses render before shops
- [ ] Critical follows 90-day top 20% and survives a raised threshold
- [ ] Brand tab + both exports match the contract
- [ ] Unit tests for comparer helpers pass
