# Quickstart: Item Trends Stock Phases

1. Apply migration when asked (`ErpStockSnapshot`).
2. Open `/dashboard/purchasing/item-trends`.
3. Capture now (OSF manage) or wait for nightly cron `30 17 * * *` UTC (~23:00 Colombo).
4. Outlets/Stock tab: snapshot banner, location all/selective, brand, common vs variant SKU.
5. Cover table: sale vs stock vs % vs cover days. Send list = below 50% of week need.
6. Toggle OOS: sold in range + snapshot 0.
7. Expand a common SKU to variant SKUs.
8. ROP tab: Current ROP is total; Export CSV.

Formulas: [data-model.md](./data-model.md). APIs: [contracts/](./contracts/).
