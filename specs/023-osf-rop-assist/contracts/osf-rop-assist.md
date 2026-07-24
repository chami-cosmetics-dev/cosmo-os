# Contract: OSF ROP Assist

## Permissions

| Key | Capability |
|-----|------------|
| `purchasing.osf.read` | Open assist, refresh, view page-data |
| `purchasing.osf.manage` | PUT save ROPs |

## POST `/api/admin/osf/assist/refresh`

**Auth**: `purchasing.osf.read`

**Behavior**: Run `syncErpProductPriorities` for the company. Does not invent data.

**Response** `200`:

```json
{
  "updatedRows": 1200,
  "syncedAt": "2026-07-24T06:00:00.000Z",
  "sources": [
    { "id": "…", "label": "ERP1", "status": "ok", "error": null },
    { "id": "…", "label": "ERP2", "status": "failed", "error": "…" }
  ]
}
```

**Errors**: `401` / `403` / `502` if all ERP sources failed (same spirit as Items sync).

`maxDuration`: allow long sync (e.g. 300s) like Items sync route.

## GET `/api/admin/osf/assist/page-data`

**Auth**: `purchasing.osf.read`

**Query**:

| Param | Default | Notes |
|-------|---------|-------|
| `asOfDate` | today Colombo | `YYYY-MM-DD` |
| `priority` | `Top Priority` | Exact match on erp1 **or** erp2; empty / `all` = no priority filter |
| `page` | 1 | |
| `limit` | 50 | max 100 |
| `q` | — | optional SKU/title search |

**Response** `200`:

```json
{
  "asOfDate": "2026-07-24",
  "priorityFilter": "Top Priority",
  "page": 1,
  "limit": 50,
  "total": 180,
  "canManageRops": true,
  "ropColumnKeys": ["cosmetics_lk", "lmj", "cosmo_shop_gcc"],
  "stockWarnings": [{ "source": "ERP2", "message": "…" }],
  "items": [
    {
      "sku": "ORD04_1",
      "productTitle": "…",
      "brand": "The Ordinary",
      "erp1ProductPriority": "Top Priority",
      "erp2ProductPriority": "Top Priority",
      "lastPurchaseDate": "2026-07-10",
      "windowStart": "2026-07-10",
      "windowEnd": "2026-07-24",
      "salesInWindow": 12,
      "suggestedRop": 12,
      "totalStock": 444,
      "currentRops": { "cosmetics_lk": 40, "lmj": 10 },
      "currentRopSummary": 40
    }
  ]
}
```

`windowEnd` in response is inclusive as-of date for display; server query uses exclusive next-day bound.

**Errors**: `401` / `403` / `400` bad dates; `502` if stock ERP completely unavailable (optional: still return rows with null stock + warning — prefer soft-fail with `totalStock: null` and warnings rather than hard 502 when priorities/sales available).

## PUT `/api/admin/osf/assist/rops`

**Auth**: `purchasing.osf.manage`

**Body**:

```json
{
  "items": [
    { "sku": "ORD04_1", "ropQty": 12 },
    { "sku": "BOJ04_1", "ropQty": 15 }
  ]
}
```

**Behavior**: For each item, upsert `ProductOsfRop` for **every** active `includeInRop` column with `ropQty`. Max 200 items per request.

**Response** `200`: `{ "updatedSkus": 2, "updatedCells": 24 }`

**Errors**: `401` / `403` / `400` validation; unknown SKUs listed in errors without aborting siblings (or fail closed per batch — prefer **per-sku errors** + partial success summary).

## UI contract (OSF hub)

- Section **ROP Assist** visible to `purchasing.osf.read`.
- Auto-call refresh on mount; show syncing / partial failure.
- Default filter Top Priority; Accept selected / Save only if `canManageRops`.
- Existing Generate / ROP import / Access / editors remain.
