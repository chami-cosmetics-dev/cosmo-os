# GET /api/admin/purchasing/item-trends/cover

Auth: `purchasing.item_trends.read`

| Param | Rules |
|-------|--------|
| from, to | required `YYYY-MM-DD` |
| priority | optional |
| brand | optional vendor name |
| sku | optional exact SKU |
| columnKeys | optional comma-separated OSF keys; omit = all in-scope |
| oosOnly | `true`/`false` |
| sendOnly | `true`/`false` |

Response: `{ snapshotDate, capturedAt, daysInRange, rows: CoverRow[] }`  
Stock from latest snapshot. Online rows before physical. 400 if dates invalid.
