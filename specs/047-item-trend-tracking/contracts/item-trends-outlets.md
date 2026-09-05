# GET /api/admin/purchasing/item-trends/outlets

Outlet balance, per-outlet movement, and transfer candidates.

## Auth
- `requirePermission("purchasing.item_trends.read")`
- Scoped: store users limited to their `EmployeeProfile.locationId` column(s)

## Query

| Param | Type | Rules |
|-------|------|--------|
| `from`, `to` | `YYYY-MM-DD` | Optional together. Omit both = **lifetime** speed (first completed sale at that shop → today). When set, units + speed use that window |
| `priority` | string | Optional filter (default `all`; `all` = no filter). Ignored when `sku` set |
| `sku` | string | Optional exact SKU — returns that item at every shop (incl. zero sales) |
| `columnKey` | string | Optional single outlet OSF column |
| `transfersOnly` | boolean | Default false |
| `includeStock` | boolean | Optional. Default: true when `sku` set, else false (sales-first). When true, ERP bins for sold/SKU only — never full warehouse dump |

## Behavior
- Outlets from `OsfColumnConfig` with **shop warehouses** only
- Cosmetics.lk **POS shops** (`cosmo_shop_*`: GCC, Pepiliyana, OGF, Kiribathgoda, Maharagama, Cool Planet)
- Trading **Shop Warehouse - X** (LMJ, LWK, MNK, AJS, Chami, DRO, …) — Main / Stores / Website excluded
- Cosmetics.lk website location column excluded (online sales not used)
- Stock: live ERP bins on shop warehouses
- Movement: `order.erpnextWarehouse` → shop column, or trading POS at shop location
- Default speed: **lifetime** — units ever sold at that shop ÷ inclusive calendar days from first sale there to today
- Optional From/To: same window for all shops (units in range ÷ range days)
- `transfers`: same SKU slow+high stock at one shop, faster at another

## Response `200`

```json
{
  "outlets": [
    {
      "sku": "ABC123",
      "columnKey": "shop_colombo",
      "outletName": "Shop Colombo",
      "stockQty": 48,
      "unitsInRange": 2,
      "speedPerDay": 0.3,
      "stockPressure": "high_slow"
    }
  ],
  "transfers": [
    {
      "sku": "ABC123",
      "sourceColumnKey": "shop_a",
      "sourceOutletName": "Shop A",
      "sourceStock": 50,
      "sourceSpeed": 0.2,
      "destColumnKey": "shop_b",
      "destOutletName": "Shop B",
      "destStock": 5,
      "destSpeed": 4.1,
      "message": "Move stock from Shop A to Shop B"
    }
  ]
}
```

## Errors
- `403` when store user requests unauthorized columnKey
- `503` partial ERP stock failure: return movement with `stockQty: null` + `stockStale: true` per row
