# Contract: Item Trends cover

`GET /api/admin/purchasing/item-trends/cover`

Auth: `purchasing.item_trends.read`

Query:

- `from`, `to` (required YMD)
- `priority`, `brand`, `sku` (search: exact, parent, or `PARENT_*` variants)
- `commonSkuKey`
- `columnKeys` comma list (empty = all in-scope)
- `snapshotDate` optional YMD; omit = yesterday then latest fallback
- `oosOnly`, `sendOnly` `true`/`false`

Response:

```json
{
  "snapshotDate": "2026-09-06",
  "capturedAt": "2026-09-06T17:30:00.000Z",
  "usedFallback": false,
  "daysInRange": 7,
  "rows": []
}
```

`usedFallback` true when requested/default date had no capture and latest night was used.
