# Quickstart: ROP Warehouse Compare

**Feature**: `063-rop-warehouse-compare`  
**Spec**: [spec.md](./spec.md)  
**Contract**: [contracts/stock-comparer-rop.md](./contracts/stock-comparer-rop.md)  
**Data**: [data-model.md](./data-model.md)

Validate the existing Stock Comparer page. No new permission. No migration.

## Prerequisites

1. Cosmo OS running locally against a tenant that already has Stock Comparer access (`reports.stock_comparer`).
2. ERP1 and ERP2 configured. OSF columns active, including Cosmetics main (`Main Warehouse - Cosmo`) and the other company’s non-shop warehouses.
3. At least one SKU with `ProductOsfRop` **100** on the Cosmetics main column and known bin qty.
4. A shop warehouse with positive qty for a SKU whose Cosmetics main qty is 0.

## Automated

```bash
npm test -- lib/cosmetics-stock-comparer.test.ts
```

Expect existing threshold and brand cases still green, plus:

- ROP 100, percent 30, qty 30 → hit; qty 31 → miss
- ROP 0 or missing → not a hit
- Negative qty with positive ROP → hit
- Shop-named ERP2 column is not in the primary watch
- Main qty 0 sets website out of stock
- Focus warehouse is absent from `elsewhere`
- `baseSku("CAN07_1")` parent filter matches; variant filter does not pull `CAN07_2`

Lint touched files before opening a PR (`npm run lint` on those paths).

## Manual

Open **Purchasing → Stock Comparer**.

### 1. Percent watch

1. Leave threshold at `0`. Enter reorder percent `30`. Run.
2. **Expect**: a SKU with main ROP 100 and main qty 30 appears on the ROP watch. A SKU at qty 31 does not.
3. **Expect**: an other-company non-shop warehouse can hit on its own ROP even when Cosmetics main is above 30%.
4. **Expect**: a SKU with no reorder point on that warehouse is not a percent hit.
5. Set percent to `101` or leave it blank and try to run the percent report. **Expect**: the run is refused with a clear message. The last good threshold report is not replaced by invented rows.

### 2. Website out of stock

1. Use a SKU whose Cosmetics main qty is 0 and that appears because of the percent rule or the threshold list.
2. **Expect**: the row states cosmetics.lk is out of stock. Do not need to open the website.

### 3. Shops tab

1. After a successful run, open **Shops**.
2. **Expect**: main qty beside each shop with stock. A company warehouse is not labeled as a shop.
3. **Expect**: a shop that has both a shop floor and a back room appears once.

### 4. Filters

1. Filter common SKU `CAN07`. **Expect**: `CAN07_1` and `CAN07_2` if both are in the result.
2. Filter variant SKU `CAN07_1`. **Expect**: only that variant.
3. Choose a priority and a VAT status. **Expect**: only rows that match both.
4. Clear filters. **Expect**: the full set for that tab returns without another ERP wait.

### 5. Any warehouse

1. Open **Compare**, pick a configured warehouse, keep percent `30`, Run.
2. **Expect**: listed items are low against **that** warehouse’s reorder point. The chosen warehouse is not repeated under other locations.
3. Pick a different warehouse and Run. **Expect**: the list follows the new warehouse.

### 6. Unchanged behavior

1. Run with threshold `0` and no need to treat brand rules as changed.
2. **Expect**: main tab still lists Cosmetics main qty `<= 0` with online warehouses before shops, 90-day sales, and Critical when sales load.
3. **Expect**: brand tab and both existing exports still work.
4. **Expect**: no stock transfer or purchase order is created.
5. Sign in as a user without Stock Comparer access. **Expect**: page and API denied.

## Failure

Disconnect ERP or clear OSF warehouses. **Expect**: a clear error. Previous results are cleared or marked invalid. No fabricated reorder points.
