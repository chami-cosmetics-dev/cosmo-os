# Contract: Loyalty eligible summary & list

**Feature**: `055-loyalty-eligible-ops`  
**Auth**: `requirePermission("contacts.insight.read")` + `hasInsightAdminView`. Else 403.

## GET `/api/admin/customer-insight/loyalty-eligible/summary`

Query (optional):

| Param | Type | Notes |
|-------|------|--------|
| `asOf` | `YYYY-MM-DD` | default today Colombo; MTD end bound |
| `weekEnd` | `YYYY-MM-DD` | default Sunday before next Monday send / yesterday logic per research |

**200**

```json
{
  "asOf": "2026-09-16",
  "mtdFrom": "2026-09-01",
  "weekFrom": "2026-09-08",
  "weekTo": "2026-09-14",
  "company": {
    "pending": 0,
    "mtdNewlyEligible": 0,
    "mtdUpdated": 0,
    "weekNewlyEligible": 0,
    "weekUpdated": 0
  },
  "merchants": [
    {
      "merchantLabel": "MER91",
      "pending": 0,
      "mtdNewlyEligible": 0,
      "mtdUpdated": 0,
      "weekNewlyEligible": 0,
      "weekUpdated": 0
    }
  ]
}
```

Sort merchants by `pending` desc. Include zero-pending merchants that have MTD/week activity; optionally include active merchant roster zeros for email (email builder may union roster).

## GET `/api/admin/customer-insight/loyalty-eligible/list`

| Param | Type | Notes |
|-------|------|--------|
| `page` | int ≥ 1 | default 1 |
| `pageSize` | 1–100 | default 50 |
| `assignedMerchant` | string | optional scope |

**200**

```json
{
  "items": [
    {
      "contactId": "cuid",
      "name": "string",
      "phoneNumber": "string|null",
      "assignedMerchant": "string|null",
      "lifetimeTotal": 0,
      "suggestedTier": "gold|platinum",
      "suggestionKind": "new|upgrade",
      "status": "eligible|contacted|responded|not_responded",
      "loyaltyEligibleAt": "iso|null"
    }
  ],
  "pagination": { "page": 1, "pageSize": 50, "total": 0 }
}
```

`total` = company (or merchant-scoped) **pending** eligible count.

## Errors

| Status | When |
|--------|------|
| 400 | Zod / invalid dates |
| 403 | Not insight admin |
| 404 | No company |
