# Merchant Dashboard — Channel Sales (GM view extension)

Extends existing merchant dashboard page-data and targets API. No new routes in v1.

## Auth

Same as current merchant dashboard:
- Page data: `canAccessMerchantDashboard` OR `dashboard.merchant_view`
- GM channel section: `hasMerchantDashboardAdminView` (`viewerIsAdmin`)
- Target upsert: `dashboard.merchant_targets.manage`
- Staff patch: existing staff admin permissions

Scope all reads/writes to `auth.context.user.companyId`.

---

## GET /api/admin/merchant-dashboard/page-data

Existing query params unchanged (`merchantUserId`, `yearMonth`, `showCustomerLists`, `fromDate`, `toDate`).

### Response additions (when `viewerIsAdmin`)

Top-level:

```json
{
  "gmChannelFooter": {
    "periodLabel": "MTD",
    "fromYmd": "2026-08-01",
    "toYmd": "2026-08-29",
    "shop": { "orderCount": 120, "amount": 4500000 },
    "online": { "orderCount": 85, "amount": 3200000 },
    "grandTotal": { "orderCount": 205, "amount": 7700000 }
  }
}
```

`gmPulse` extended (optional):

```json
{
  "gmPulse": {
    "companyTodaySales": 0,
    "companyMtdSales": 7700000,
    "shopAmount": 4500000,
    "onlineAmount": 3200000,
    "shopOrderCount": 120,
    "onlineOrderCount": 85
  }
}
```

Each `overview[]` row extended:

```json
{
  "merchantId": "cuid",
  "displayName": "Amal",
  "isShopMerchant": true,
  "outletName": "DTD",
  "shop": { "orderCount": 12, "amount": 450000 },
  "online": { "orderCount": 8, "amount": 320000 },
  "shopTargetAmount": 500000,
  "onlineTargetAmount": 300000,
  "shopPercent": 90,
  "onlinePercent": 106.7,
  "effectiveTotalTarget": 800000,
  "targetAmount": 800000,
  "mtdSales": 770000,
  "percent": 96.25
}
```

Existing overview fields (`callsMtd`, `healthStatus`, `paceStatus`, etc.) unchanged.

### Behavior

1. Channel actuals computed from `fetchMerchantCohortSales` for active period (`fromYmd`/`toYmd` per research.md §3).
2. `grandTotal.amount` MUST equal sum of `overview[].shop.amount + overview[].online.amount` (± unassigned row).
3. For MTD default, `grandTotal.amount` MUST equal `gmPulse.companyMtdSales` when pulse uses same window.
4. Empty cohort: zeros, not 404.

### Errors

Unchanged from existing page-data route.

---

## POST /api/admin/merchant-dashboard/targets

Extends existing upsert body.

### Request body

```json
{
  "merchantUserId": "cuid",
  "yearMonth": "2026-08",
  "targetAmount": 800000,
  "shopTargetAmount": 500000,
  "onlineTargetAmount": 300000,
  "note": "optional"
}
```

| Field | Rules |
|-------|--------|
| `merchantUserId` | cuid, required |
| `yearMonth` | `YYYY-MM`, required |
| `targetAmount` | positive number; if omitted and channel targets provided, server sets `shop + online` |
| `shopTargetAmount` | optional positive number or null to clear |
| `onlineTargetAmount` | optional positive number or null to clear |
| `note` | optional string |

### Behavior

1. Validate with extended `merchantMonthlyTargetUpsertSchema`.
2. When `shopTargetAmount` and/or `onlineTargetAmount` provided: persist both; set `targetAmount = (shop ?? 0) + (online ?? 0)`.
3. When only `targetAmount` provided (legacy): persist; leave channel fields null unless explicitly sent.
4. Append `MerchantMonthlyTargetHistory` with `targetAmount`, `shopTargetAmount`, `onlineTargetAmount`.
5. Return updated target DTO including channel fields.

### Response `200`

```json
{
  "targetAmount": 800000,
  "shopTargetAmount": 500000,
  "onlineTargetAmount": 300000,
  "yearMonth": "2026-08",
  "action": "update"
}
```

---

## PATCH /api/admin/staff/[userId]

Extends existing staff update payload.

### Request body (additive)

```json
{
  "employeeProfile": {
    "isShopMerchant": true,
    "locationId": "company-location-cuid"
  }
}
```

### Behavior

- When `isShopMerchant === true` and `locationId` is null/empty → `400` `{ "error": "Outlet is required for shop merchants" }`.
- When `isShopMerchant === false`, `locationId` optional.
- Persists to `EmployeeProfile.isShopMerchant`.

### Response

Existing staff member DTO includes `employeeProfile.isShopMerchant`.

---

## Invariants (contract tests)

1. `overview[].shop.amount + overview[].online.amount` = merchant period total attributed sales.
2. `gmChannelFooter.grandTotal` = sum of all overview shop + online buckets.
3. Legacy merchant with only `targetAmount`: `shopTargetAmount` and `onlineTargetAmount` null in API; `effectiveTotalTarget === targetAmount`.
4. GM pulse / alerts / health fields present and unchanged in response for admin viewers.
