# Data Model: Item Trends Simple Rebuild

## Order.district (new)

- `district` String? — Sri Lanka district label when known
- Index: `[companyId, district]`
- Written on Shopify order upsert from shipping address
- Blank allowed (POS / unmapped)

## ErpStockSnapshot (existing)

- Unchanged keys: `companyId + snapshotDate + sku + warehouse`
- Many `snapshotDate` values retained (90-day prune)
- Recapture deletes/reinserts **that date only**

## CoverRow (view)

Item × warehouse: range units, snapshot qty for selected date, week need, 50% send (shop only), OOS, optional marketGapPct.

## CommonSku

`commonSkuKey` = parent stem (`ORD04`) or Shopify product id fallback.

## LocationWarehouse

OSF stock column: Main/online vs Shop. Display name = cleaned label.

## Validation

- Snapshot date: `YYYY-MM-DD` optional on cover query
- Empty stored district → treat as missing and infer
