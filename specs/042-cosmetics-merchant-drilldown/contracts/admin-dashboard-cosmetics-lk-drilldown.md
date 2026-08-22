# GET /api/admin/dashboard/cosmetics-lk-drilldown

Company-wide Cosmetics.lk merchant drill-down for the main dashboard card click.

## Auth
- `requirePermission("dashboard.view")`
- Caller must have `getDashboardDateTypePermission(dateType)` (same mapping as `GET /api/admin/dashboard/sales-by-location`)
- Scope all reads to `auth.context.user.companyId`

## Query

Reuse the same `from` / `to` / `date_type` clocks as `dashboardSalesQuerySchema` (no `analysis_type`).

| Param | Type | Rules |
|-------|------|--------|
| `from` | `YYYY-MM-DD` | Required; Colombo business day start |
| `to` | `YYYY-MM-DD` | Required; must be on or after `from` |
| `date_type` | dashboard sales date type | Optional; default `all_orders`; accept existing legacy aliases |

Zod: `cosmeticsLkDrilldownQuerySchema` in `lib/validation.ts` (from, to, date_type only).

## Behavior
1. Parse query; `400` on invalid / from > to (`"From date must be on or before To date"`).
2. Auth + date-type permission; `403` if date type not allowed.
3. `404` if user has no company.
4. Resolve Cosmetics.lk location (`isCosmeticsLkLocationName` on name or shortName). If none: `404` `{ "error": "Cosmetics.lk location not found" }`.
5. Load eligible orders for that `companyLocationId` only; aggregate per [data-model.md](../data-model.md).
6. Empty eligible set: `200` with `total: 0`, `merchants: []`, empty/zero buckets — **not** an error.

## Response `200`

```json
{
  "locationId": "cuid",
  "locationName": "Cosmetics.lk",
  "from": "2026-08-22",
  "to": "2026-08-22",
  "dateType": "all_orders",
  "total": 35650,
  "orderCount": 42,
  "discountTotal": 1200,
  "byChannel": [
    { "key": "website", "label": "Website", "total": 20000, "orderCount": 30 },
    { "key": "erp1", "label": "ERP1", "total": 15650, "orderCount": 12 }
  ],
  "byPaymentType": [
    { "key": "cash", "label": "Cash", "total": 10000, "orderCount": 15 }
  ],
  "byVatItem": [
    { "key": "vat", "label": "VAT items", "total": 8000, "orderCount": 10 },
    { "key": "other", "label": "Other items", "total": 25000, "orderCount": 40 }
  ],
  "byDiscountCode": [
    { "key": "sv20", "label": "SV20", "total": 0, "orderCount": 3 }
  ],
  "merchants": [
    {
      "merchantId": null,
      "merchantName": "DM-General",
      "total": 35650,
      "orderCount": 42,
      "discountTotal": 1200,
      "byChannel": [],
      "byPaymentType": [],
      "byVatItem": [],
      "discountCodes": [{ "code": "SV20", "orderCount": 3 }]
    }
  ]
}
```

Notes:
- Omit `manual` from `byChannel` (location and merchant) when `orderCount === 0`.
- `byDiscountCode[].total` may be 0 when codes are present without a per-code amount; location `discountTotal` is the money figure.
- Merchant `discountCodes` list promotional codes only (not MER tracking).
- Amounts are JSON numbers (same as sales-by-location `total`).

## Errors

| Status | When |
|--------|------|
| `400` | Invalid query or from > to |
| `401` / `403` | Auth or date-type permission |
| `404` | No company, or no Cosmetics.lk location |

## Non-goals
- Mutating orders
- Export
- Other locations (`location_id` query not accepted in v1)
- Changing `GET /api/admin/dashboard/sales-by-location`
