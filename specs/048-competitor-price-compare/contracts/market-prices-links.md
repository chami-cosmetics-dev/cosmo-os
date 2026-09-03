# Market Competitor Links API

CRUD for per-SKU competitor product links.

## Auth
- **GET** (list/detail): `purchasing.market_prices.read`
- **POST / PATCH / DELETE**: `purchasing.market_prices.manage`
- All routes scoped to `companyId`

---

## GET /api/admin/purchasing/market-prices/links

List links for one SKU or search.

### Query

| Param | Type | Rules |
|-------|------|--------|
| `sku` | string | Required for detail-style list |
| `competitor` | slug | Optional filter |

### Response `200`

```json
{
  "sku": "CERAVE-236",
  "prices": { "mrp": 9500, "promo": 8200, "ogf": 7900, "hasPromo": true },
  "competitors": [
    {
      "slug": "liberty-store",
      "name": "Liberty Store",
      "linked": true,
      "linkId": "clx…",
      "productUrl": "https://libertystore.lk/products/…",
      "competitorTitle": "CeraVe Moisturising Lotion 236ml",
      "listedPriceLkr": 8200,
      "inStock": true,
      "checkDate": "2026-09-01",
      "stale": false,
      "notes": null,
      "gaps": { "mrp": 15.9, "promo": 0, "ogf": -3.7 }
    },
    {
      "slug": "kiki-beauty",
      "name": "Kiki Beauty",
      "linked": false,
      "linkId": null,
      "productUrl": null,
      "competitorTitle": null,
      "listedPriceLkr": null,
      "inStock": null,
      "checkDate": null,
      "stale": false,
      "notes": null,
      "gaps": { "mrp": null, "promo": null, "ogf": null }
    }
  ],
  "history": [
    {
      "linkId": "clx…",
      "listedPriceLkr": 8500,
      "checkDate": "2026-08-20",
      "changedAt": "2026-09-01T10:00:00.000Z"
    }
  ]
}
```

Always returns **six competitor slots** (seed list), merged with links.

---

## POST /api/admin/purchasing/market-prices/links

Create or upsert link (unique on company + sku + competitor).

### Body

```json
{
  "sku": "CERAVE-236",
  "competitorSlug": "liberty-store",
  "productUrl": "https://libertystore.lk/products/…",
  "competitorTitle": "CeraVe Moisturising Lotion 236ml",
  "listedPriceLkr": 8200,
  "inStock": true,
  "checkDate": "2026-09-01",
  "notes": null,
  "packSizeNormalized": "236ml",
  "sizeMismatchConfirmed": false
}
```

### Behavior
- Validates SKU exists in company catalog
- Pack size mismatch → `409` with `{ code: "PACK_SIZE_MISMATCH", message, cosmoSize, linkSize }` unless `sizeMismatchConfirmed: true`
- On price change: append `MarketCompetitorPriceHistory` with old values

### Response
- `201` created / `200` updated
- `404` SKU not found
- `400` validation error

---

## PATCH /api/admin/purchasing/market-prices/links/[id]

Partial update of link fields (same validation as POST).

---

## DELETE /api/admin/purchasing/market-prices/links/[id]

Remove link; history rows retained (orphan linkId) or cascade delete history — **implement cascade delete on link** for simplicity v1.

### Response `204`
