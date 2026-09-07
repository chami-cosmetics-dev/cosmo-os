# Contract: Stock snapshot dates

`GET /api/admin/purchasing/item-trends/stock-snapshot`

Auth: `purchasing.item_trends.read`

```json
{
  "defaultDate": "2026-09-06",
  "latestDate": "2026-09-06",
  "dates": [{ "snapshotDate": "2026-09-06", "capturedAt": "2026-09-06T17:30:00.000Z" }]
}
```

`defaultDate` = yesterday if present in `dates`, else `latestDate`.

`POST` (OSF manage): capture today; returns `{ snapshotDate, capturedAt, rowCount }`.
