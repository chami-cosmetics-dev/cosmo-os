# Contract: Shopify Stock Showdown APIs

**Feature**: `059-shopify-stock-showdown`  
**Base path**: `/api/admin/shopify-stock-showdown`  
**Auth**: `purchasing.shopify_stock_showdown.read` via `requireShopifyStockShowdownAccess`  
**Scope**: current user’s OS `companyId` only  

Errors: `{ "error": string }` with 4xx/5xx.

No route in this feature creates or updates ERP stock, Stock Entry, or Stock Transfer.

---

## GET `/destinations`

List Shopify-capable company locations for this OS.

### Response `200`

```json
{
  "destinations": [
    {
      "id": "clxxxxxxxx",
      "name": "Cosmetics.lk Online",
      "shopifyShopName": "cosmetics-lk",
      "shopifyLocationId": "1234567890"
    }
  ]
}
```

Sort: name A–Z.

### Errors

- `401` / `403`
- `404` no company on the user
- `200` with `destinations: []` if none configured

---

## GET `/showdown`

Low-stock Shopify items for one destination, with elsewhere stock and transfer suggestions.

`export const maxDuration = 60`

### Query

| Param | Required | Rules |
|-------|----------|--------|
| `destinationId` | yes | cuid; must be a Shopify destination in this company |
| `mode` | no | `lte3` (default) or `oos` |

Zod: `destinationId` = cuid; `mode` enum default `lte3`.

### Response `200`

```json
{
  "destination": {
    "id": "clxxxxxxxx",
    "name": "Cosmetics.lk Online",
    "shopifyShopName": "cosmetics-lk",
    "shopifyLocationId": "1234567890"
  },
  "mode": "lte3",
  "salesWindow": {
    "from": "2026-08-23",
    "to": "2026-09-21",
    "timezone": "Asia/Colombo",
    "days": 30
  },
  "erpStatus": "ok",
  "items": [
    {
      "sku": "ABC_1",
      "productTitle": "Example Product",
      "variantTitle": "Default",
      "shopifyStock": 1,
      "last30ShopifyUnits": 20,
      "demandGap": 19,
      "elsewhereStatus": "ok",
      "elsewhere": [
        {
          "key": "inst1::GCC Shop Warehouse - Cosmo",
          "label": "GCC",
          "kind": "shop",
          "warehouse": "GCC Shop Warehouse - Cosmo",
          "erpInstanceId": "inst1",
          "qty": 12,
          "available": true
        },
        {
          "key": "inst1::Main Warehouse - Cosmo",
          "label": "Main Warehouse - Cosmo",
          "kind": "erp_location",
          "warehouse": "Main Warehouse - Cosmo",
          "erpInstanceId": "inst1",
          "qty": 5,
          "available": true
        }
      ],
      "suggestions": [
        {
          "sourceKey": "inst1::GCC Shop Warehouse - Cosmo",
          "sourceLabel": "GCC",
          "destinationId": "clxxxxxxxx",
          "suggestedQty": 12,
          "basis": "last_30_shopify_sales"
        },
        {
          "sourceKey": "inst1::Main Warehouse - Cosmo",
          "sourceLabel": "Main Warehouse - Cosmo",
          "destinationId": "clxxxxxxxx",
          "suggestedQty": 5,
          "basis": "last_30_shopify_sales"
        }
      ]
    }
  ]
}
```

### Field rules

- `items` only includes rows matching `mode` (`lte3` → stock <= 3; `oos` → stock === 0).
- `elsewhere` lists only sources with `qty > 0` and not the destination’s own warehouses.
- `kind` is `shop` or `erp_location` (both required in the product sense — empty `elsewhere` uses empty array + UI copy).
- `suggestions` empty when `demandGap === 0` or no available positive sources; UI must still distinguish “zero demand” vs “no stock elsewhere” using `demandGap` + `elsewhere.length`.
- `erpStatus`: `ok` | `partial` | `unavailable` for the overall ERP bin fetch; per-item `elsewhereStatus` mirrors when that item’s sources were affected.
- Never invent stock: failed instance → those sources omitted or `available: false`, not qty `0`.

### Errors

- `400` invalid query / unknown `destinationId` for this company / destination not Shopify-capable
- `401` / `403`
- `404` no company on the user
- `502` optional only when destinations exist but **all** ERP instances fail **and** the handler cannot return Shopify rows at all; prefer `200` with Shopify rows + `erpStatus: "unavailable"` when ProductItem list succeeded

---

## Client-only (not HTTP)

| Action | Behavior |
|--------|----------|
| Open page | Load destinations; if one, auto-select and fetch showdown |
| Change destination | Refetch showdown |
| Toggle OOS-only | `mode=oos` refetch (or client filter if full `lte3` already loaded — prefer refetch for consistency) |
| Refresh | Refetch showdown; no persisted suggestions |
| Act on suggestion | Human process outside app; no POST |

---

## Permission

| Key | Used by |
|-----|---------|
| `purchasing.shopify_stock_showdown.read` | Page, both routes, sidebar visibility |
