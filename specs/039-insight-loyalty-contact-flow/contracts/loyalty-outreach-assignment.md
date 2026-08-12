# Contracts: Loyalty Outreach & Master Assignment

**Feature**: `039-insight-loyalty-contact-flow`  
**Auth**: Authenticated + permissions below.

---

## Merchant page-data — loyalty card (extend existing)

**GET** `/api/admin/merchant-dashboard/page-data`

### Added query

| Param | Type | Notes |
|-------|------|--------|
| `showCustomerLists` | boolean? | Default false — omit Daily/Top Lifetime payloads when false |
| `fromDate` / `toDate` | `YYYY-MM-DD`? | Drive call-center + ranged charts |

### Added response slice

```json
{
  "loyaltyOutreach": {
    "items": [
      {
        "contactId": "cuid",
        "name": "string",
        "phoneNumber": "string|null",
        "lifetimeTotal": 120000,
        "status": "eligible|contacted|responded|not_responded",
        "lastContactedAt": "ISO|null"
      }
    ]
  },
  "callCenterPerformance": { }
}
```

`callCenterPerformance` mirrors main dashboard chart DTO scoped to viewed merchant + date range (or null if unauthorized).

---

## POST loyalty outreach actions

Prefer insight contacted endpoint with `outcome`, or dedicated:

**POST** `/api/admin/merchant-dashboard/loyalty-outreach`

**Permission**: merchant dashboard access for allocated merchant (or admin switcher)

```json
{
  "contactId": "cuid",
  "action": "loyalty_informed|responded|not_responded",
  "remark": "string|null"
}
```

Updates `loyaltyOutreachStatus`, appends history row, audits `merchant-dashboard`.

---

## GET `/api/admin/customer-insight/loyalty-queue`

**Permission**: `contacts.master.read` or `contacts.master.manage`

**Response**: contacts with `loyaltyOutreachStatus === "responded"` and no assignment yet:

```json
{
  "items": [
    {
      "contactId": "cuid",
      "name": "string",
      "phoneNumber": "string|null",
      "lifetimeTotal": 210000,
      "suggestedTier": "platinum",
      "assignedMerchant": "string|null"
    }
  ]
}
```

`suggestedTier` from live thresholds (100k / 250k).

---

## POST `/api/admin/customer-insight/[contactId]/loyalty-assign`

**Permission**: `contacts.master.manage`

```json
{
  "tier": "gold|platinum",
  "remark": "string|null"
}
```

**Rules**: Reject if status ≠ `responded` (or allow admin override — default: require responded). Reject if lifetime total outside tier band. On success set assignment fields, status `assigned`, history + audit `customer-insight` / `loyalty_assigned`.

**Insight GET detail**: include

```json
{
  "loyaltyAssignment": {
    "tier": "gold|platinum",
    "assignedAt": "ISO",
    "assignedByName": "string",
    "assignedByUserId": "cuid"
  }
}
```

when assigned; else null. Filter `loyaltyRegisteredFrom/To` uses `loyaltyAssignedAt`.
