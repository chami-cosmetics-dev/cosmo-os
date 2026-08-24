# Contract: Call queue assign, export, report

**Feature**: `043-call-queue-filters`  
**Auth**: `requirePermission("contacts.insight.read")` + `hasInsightAdminView`. Else 403.

Shared filter query (candidates + eligible-ids):

| Param | Type | Notes |
|-------|------|--------|
| `assignedMerchant` | string | required |
| `pushToGold` | `true` \| omit | no amounts in UI |
| `pushToPlatinum` | `true` \| omit | |
| `loyalty` | `standard` \| `gold` \| `platinum` \| `unassigned` | omit = all |
| `lastPurchaseFrom` | `YYYY-MM-DD` | inclusive |
| `lastPurchaseTo` | `YYYY-MM-DD` | inclusive |
| `brand` | string | purchased brand |
| `page` | int ≥ 1 | candidates only |
| `pageSize` | 1–100, default 50 | candidates only |
| `limit` | int ≥ 1 | eligible-ids only; omit = all eligible (server may cap with `truncated: true`) |

## GET `/api/admin/customer-insight/call-queue/candidates`

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
      "lastPurchaseAt": "iso|null",
      "lastContactedAt": "iso|null",
      "queued": false
    }
  ],
  "pagination": { "page": 1, "pageSize": 50, "total": 0, "eligibleTotal": 0 }
}
```

`total` = matching after filters+hide (includes queued rows still listed as `queued: true` if product still shows them — **this feature omits pending from load**; `queued` should be false on returned items). `eligibleTotal` = assignable count (same as eligible-ids length).

Hidden contacts are **absent** (not listed as queued).

## GET `/api/admin/customer-insight/call-queue/eligible-ids`

Same filters. **200** `{ "contactIds": ["cuid"], "eligibleTotal": 0, "truncated": false }`

Used for Select count N (`limit=N`) and Select all (no limit / high limit). Order = oldest / never contacted first.

## POST `/api/admin/customer-insight/call-queue/assign`

Body (existing + same merchant): `{ "assignedMerchant": "string", "contactIds": ["cuid"] }` max 200.

**200** `{ "assigned": 12, "skippedQueued": 0, "skippedHidden": 0, "skippedNotAllocated": 0 }`

Creates **new** pending rows; skips pending duplicates; skips hide-window / Black List / Wrong Number. Audit `customer-insight` / `call_queue_assign`.

## GET `/api/admin/customer-insight/call-queue/export`

Query: optional `assignedMerchant`.

**200** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`  
Filename like `call-queue-assignments-YYYY-MM-DD.xlsx`

One row per **history** queue record (all statuses). Current category from `ContactMaster.category`.

## GET `/api/admin/customer-insight/call-queue/report`

Query: optional `assignedMerchant`, `assignedFrom`, `assignedTo`, `status`, `pushToGold`, `pushToPlatinum`.

**200**

```json
{
  "rows": [
    {
      "queueId": "cuid",
      "contactId": "cuid",
      "name": "string",
      "phoneNumber": "string|null",
      "merchantLabel": "string",
      "assignedAt": "iso",
      "status": "pending|completed",
      "category": "string|null",
      "lifetimeTotalAtAssign": 0,
      "salesAfterAssignment": 0,
      "salesAfterContact": 0,
      "firstContactAfterAssignAt": "iso|null"
    }
  ],
  "byMerchant": [
    {
      "merchantLabel": "string",
      "assignedCount": 0,
      "contactedCount": 0,
      "salesAfterAssignment": 0,
      "salesAfterContact": 0
    }
  ]
}
```

`contactedCount` = rows with `firstContactAfterAssignAt` set.

## Errors

| Status | When |
|--------|------|
| 400 | Zod fail |
| 403 | Not insight admin view |
| 404 | No company |
