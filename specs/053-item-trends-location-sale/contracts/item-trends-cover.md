# Contract: Item Trends cover

`GET /api/admin/purchasing/item-trends/cover`

Auth: `purchasing.item_trends.read`

## Query

| Param | Required | Notes |
|-------|----------|-------|
| `from`, `to` | yes | YMD selected sale range |
| `priority`, `brand`, `sku` | no | Existing filters |
| `commonSkuKey` | no | Existing |
| `columnKeys` | no | Comma list; empty = all in scope |
| `snapshotDate` | no | YMD when `stockSource=snapshot` |
| `stockSource` | no | `live` (default if omitted today) or `snapshot` |
| `erpScope` | no | Existing |
| `oosOnly` | no | `true`/`false` |
| `sendOnly` | deprecated | Ignored if present; remove from clients |

## Response

```json
{
  "stockSource": "snapshot",
  "snapshotDate": "2026-09-13",
  "capturedAt": "2026-09-13T17:30:00.000Z",
  "usedFallback": false,
  "daysInRange": 7,
  "trailing30From": "2026-08-16",
  "trailing30To": "2026-09-14",
  "rows": [
    {
      "sku": "ORD04_1",
      "commonSkuKey": "ORD04",
      "columnKey": "gcc",
      "outletName": "GCC",
      "channelKind": "physical",
      "unitsInRange": 14,
      "daysInRange": 7,
      "weekNeed": 14,
      "last30Units": 60,
      "last30AvgDaily": 2,
      "stockQty": 10,
      "coverDays": 5,
      "ropQty": 25,
      "isOosInRange": false
    }
  ]
}
```

## Row contract rules

- `unitsInRange` / `weekNeed` follow selected `from`–`to`.
- `last30Units` / `last30AvgDaily` / `coverDays` follow trailing-30 window (`trailing30From`/`trailing30To`), not selected range length.
- `stockQty` / `coverDays` use active `stockSource`.
- `ropQty` is location column ROP for that SKU (null if unset). Common-grain UI may remapping parent display; API still returns per-SKU rows.
- Response MUST NOT require `marketGapPct`, `shouldSend`, or `suggestedSendQty` for clients. Clients MUST NOT render Stock/sale %, Send, or Market gap.

## Errors

- 401/403: permission
- 400: invalid range / validation / cover load failure message
