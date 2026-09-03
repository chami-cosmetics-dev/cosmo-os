# GET /api/admin/purchasing/market-prices/page-data

Primary Market Price Compare list payload.

## Auth
- `requirePermission("purchasing.market_prices.read")`
- Scoped to caller's `companyId`

## Query

| Param | Type | Rules |
|-------|------|--------|
| `layer` | `mrp` \| `promo` \| `ogf` | Default `ogf` — controls sort + highlight |
| `sort` | `gap_desc` \| `gap_asc` \| `sku` \| `title` | Default `gap_desc` on active layer |
| `filter` | comma-separated | `above_market`, `cheapest`, `stale`, `has_links` |
| `competitor` | slug | Optional; SKUs with link to this competitor |
| `brand` | string | Vendor name contains (case-insensitive) |
| `priority` | string | ERP priority exact match |
| `q` | string | SKU / title / barcode search |
| `fastMover` | `1` | Optional P2; SKUs in item-trends fast-mover set (7d default) |
| `page` | number | Default 1 |
| `limit` | number | Default 50, max 100 |

## Behavior
- Load linked SKUs for company (or all catalog SKUs when `filter=untracked` future — v1 default **has_links only**)
- Batch-load MRP/PROMO via catalog row map; OGF via `ProductOsfProfile`
- Compute median/min/max + gap per layer (see `lib/market-prices/gap.ts`)
- Stale if any link `checkDate` > 14 days ago

## Response `200`

```json
{
  "meta": {
    "layer": "ogf",
    "competitors": [
      { "slug": "liberty-store", "name": "Liberty Store", "websiteDomain": "libertystore.lk" }
    ],
    "page": 1,
    "limit": 50,
    "total": 120
  },
  "rows": [
    {
      "sku": "CERAVE-236",
      "title": "CeraVe Moisturising Lotion 236ml",
      "brand": "CeraVe",
      "barcode": "…",
      "priority": "Top Priority",
      "prices": { "mrp": 9500, "promo": 8200, "ogf": 7900, "hasPromo": true },
      "competitorMin": 7800,
      "competitorMax": 8500,
      "competitorMedian": 8200,
      "competitorCount": 4,
      "gapPctMrp": 15.9,
      "gapPctPromo": 0,
      "gapPctOgf": -3.7,
      "cheapestMrp": false,
      "cheapestPromo": false,
      "cheapestOgf": true,
      "anyStale": false,
      "latestCheckDate": "2026-09-01"
    }
  ]
}
```

## Errors
- `400` invalid query
- `401` / `403` auth
