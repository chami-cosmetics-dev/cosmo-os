# Customer Insight — Merchant Monitoring API

Admin-only extension to Customer Insight. No new page route.

## Auth

- `requirePermission("contacts.insight.read")`
- `hasInsightAdminView({ roleNames, permissionKeys })` — same gate as `allocation-summary`
- Scope all reads to `auth.context.user.companyId`

---

## GET /api/admin/customer-insight/merchant-monitoring

### Query parameters

| Param | Type | Required | Rules |
|-------|------|----------|--------|
| `fromYmd` | string | yes | `YYYY-MM-DD` |
| `toYmd` | string | yes | `YYYY-MM-DD`, ≤ today (Colombo) |
| `assignedMerchant` | string | no | Merchant filter value (MER / legacy label) |

Zod schema: `customerInsightMerchantMonitoringQuerySchema` in `lib/validation/customer-insight.ts`.

Validation errors: `400` with message; `fromYmd > toYmd` or future `toYmd` rejected.

### Response `200`

```json
{
  "period": {
    "preset": "mtd",
    "fromYmd": "2026-08-01",
    "toYmd": "2026-08-29",
    "periodEndYmd": "2026-08-29",
    "periodLabel": "MTD"
  },
  "generatedAt": "2026-08-29T06:30:00.000Z",
  "unallocatedCount": 120,
  "portfolioRows": [
    {
      "merchantValue": "MER91",
      "merchantLabel": "Amal",
      "allocatedTotal": 450,
      "tiers": { "gold": 40, "platinum": 12, "standard": 398, "total": 450 },
      "dobCompleteCount": 200,
      "dobCompletePercent": 44,
      "emailCompleteCount": 310,
      "emailCompletePercent": 69,
      "purchasedInPeriodCount": 85
    }
  ],
  "companyPortfolio": {
    "merchantValue": "__company__",
    "merchantLabel": "All merchants",
    "allocatedTotal": 3200,
    "tiers": { "gold": 280, "platinum": 90, "standard": 2830, "total": 3200 },
    "dobCompleteCount": 1400,
    "dobCompletePercent": 44,
    "emailCompleteCount": 2100,
    "emailCompletePercent": 66,
    "purchasedInPeriodCount": 620
  },
  "recencyRows": [
    {
      "merchantValue": "MER91",
      "merchantLabel": "Amal",
      "buckets": [
        {
          "bucket": "today",
          "label": "Today",
          "tiers": { "gold": 2, "platinum": 0, "standard": 5, "total": 7 }
        },
        {
          "bucket": "d1_30",
          "label": "1–30 days",
          "tiers": { "gold": 8, "platinum": 3, "standard": 40, "total": 51 }
        },
        {
          "bucket": "never",
          "label": "Never purchased",
          "tiers": { "gold": 5, "platinum": 1, "standard": 120, "total": 126 }
        }
      ]
    }
  ],
  "companyRecency": [
    {
      "bucket": "today",
      "label": "Today",
      "tiers": { "gold": 10, "platinum": 2, "standard": 28, "total": 40 }
    }
  ]
}
```

### Behavior

1. Portfolio metrics computed from all allocated contacts (not limited by period).
2. `purchasedInPeriodCount` = contacts with ≥1 qualifying purchase in `[fromYmd, toYmd]`.
3. Recency buckets use `lastPurchaseAt` vs `periodEndYmd` (`toYmd`).
4. When `assignedMerchant` set, `portfolioRows` and `recencyRows` contain only that merchant; `companyPortfolio` / `companyRecency` match the filtered scope.
5. Merchant alias rollup matches `listMerchantAllocationCounts`.

### Errors

| Status | When |
|--------|------|
| 401/403 | Missing permission or not admin view |
| 404 | No company on user |
| 400 | Invalid query |

---

## GET /api/admin/customer-insight/merchant-monitoring/export

Same query params as JSON endpoint.

### Response `200`

- `Content-Type: application/pdf`
- `Content-Disposition: attachment; filename="insight-merchant-monitoring.pdf"`
- Body: PDF bytes

Uses same `buildMerchantMonitoringReport()` as JSON route. Header includes `periodLabel`, `fromYmd`–`toYmd`, generation timestamp, optional scoped merchant label.

### Errors

Same as JSON route; `500` if PDF generation fails (client shows toast).

---

## Existing routes (unchanged)

| Route | Note |
|-------|------|
| `GET /api/admin/customer-insight/allocation-summary` | Kept; CSV export FR-011 |
| `GET /api/admin/customer-insight/allocation-summary/export` | Kept |

---

## Filter drill-down (Insight list)

Extend `GET /api/admin/customer-insight/filter` query schema:

| Param | Values |
|-------|--------|
| `lastPurchaseFrom` | YYYY-MM-DD |
| `lastPurchaseTo` | YYYY-MM-DD |
| `loyalty` | `gold`, `platinum`, `standard` |
| `hasLastPurchase` | `true`, `false` |

### Recency bucket → filter mapping

Given `asOfYmd` = monitoring `toYmd`:

| Bucket | Filter params |
|--------|----------------|
| `today` | `lastPurchaseFrom=asOf`, `lastPurchaseTo=asOf` |
| `d1_30` | `lastPurchaseFrom=asOf-30d`, `lastPurchaseTo=asOf-1d` |
| `d31_90` | `lastPurchaseFrom=asOf-90d`, `lastPurchaseTo=asOf-31d` |
| `d91_180` | `lastPurchaseFrom=asOf-180d`, `lastPurchaseTo=asOf-91d` |
| `d181_365` | `lastPurchaseFrom=asOf-365d`, `lastPurchaseTo=asOf-181d` |
| `d365_plus` | `lastPurchaseTo=asOf-366d` (no lower bound) |
| `never` | `hasLastPurchase=false` |

Always combine with `assignedMerchant` + optional `loyalty` from clicked cell.

---

## UI contract (Admin tab)

**Merchant monitoring** card:

1. Period: Today | MTD | Custom (date inputs + Apply)
2. Merchant filter: All | dropdown from `call-queue-merchants` options
3. Portfolio table columns: Merchant, Allocated, Gold, Plat, Standard, DOB %, Email %, Purchased in period
4. Recency matrix: rows = buckets, columns = Gold / Plat / Standard / Total (per merchant or company)
5. Actions: Refresh, Export PDF (loading UX per `action-loading-ux.mdc`)
6. Cell click → Filter tab with mapped query params

**Call queue contact open**: Alert banner for missing Email and/or Birth date when opened from queue context.
