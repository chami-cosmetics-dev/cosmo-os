# Quickstart: Shopify Stock Showdown

**Feature**: `059-shopify-stock-showdown`  
**Contracts**: [contracts/shopify-stock-showdown.md](./contracts/shopify-stock-showdown.md)  
**Data model**: [data-model.md](./data-model.md)

## Prerequisites

- Local app running against a tenant with at least one Shopify-linked `CompanyLocation` and synced `ProductItem.inventoryQuantity`
- At least one ERP instance configured (`ErpnextInstance`) with warehouses mapped in OSF columns (shops + non-shop locations)
- User role with `purchasing.shopify_stock_showdown.read` assigned (and a second user **without** it for denial checks)
- Known fixture SKUs (or seed) with:
  - Shopify stock `0`, `3`, and `>= 4`
  - Positive bin qty at a shop warehouse and an ERP location warehouse
  - Recent Shopify/web orders in the last 30 days for at least one low-stock SKU

## Setup

```bash
npm install
npm run db:generate
npm run env:use <your-target>
npm run dev
```

Assign permission via existing Roles UI (or ensure `DEFAULT_PERMISSIONS` upsert ran for the new key).

## Automated checks

```bash
npm test -- lib/shopify-stock-showdown
```

Expect Vitest coverage for:

- threshold (`lte3` / `oos`)
- suggestion allocation + cap
- destination warehouse exclusion / source dedupe

## Manual UAT

### 1. Permission gate

1. Log in **without** `purchasing.shopify_stock_showdown.read` → no sidebar entry; direct URL denied.
2. Grant permission → sidebar entry and page load.

### 2. Default <=3 list

1. Open **Shopify Stock Showdown**.
2. Select destination (if prompted).
3. Confirm items with Shopify stock `0` and `3` appear; stock `4+` do not.
4. Switch filter to **out of stock only** → only stock `0` remains; return to default → `1–3` return.

### 3. Elsewhere ERP + shops

1. Pick a low-stock SKU known to have shop floor stock and main/ERP location stock.
2. Confirm both **shop** and **erp_location** kinds appear with quantities.
3. Confirm destination’s own Shopify/website warehouse is **not** listed as a source.
4. Pick a SKU with no stock elsewhere → clear “no stock elsewhere” empty state.

### 4. Transfer suggestions

1. SKU with `last30ShopifyUnits > shopifyStock` and sources with stock → suggestions with qty summing toward demand gap, each qty ≤ source qty.
2. SKU with zero 30-day Shopify sales → no push quantity (or explicit zero-demand message); elsewhere list may still show.
3. Confirm no Stock Entry / Stock Transfer created in ERP after viewing suggestions.

### 5. Multi-destination (if available)

1. Switch destination shop → list and suggestions recalculate for that shop’s stock and sales.

### 6. ERP partial failure (optional)

1. Simulate one ERP unreachable (or use a bad instance in non-prod) → Shopify rows still load; `erpStatus` / `elsewhereStatus` reflect partial or unavailable; no fake zeros for failed sources.

## Done when

- [ ] Permission deny/allow works
- [ ] Default and OOS filters match threshold rules
- [ ] Elsewhere shows shops **and** ERP locations when stock exists
- [ ] Suggestions respect demand gap + source caps and stay advisory
- [ ] Unit tests for helpers pass
