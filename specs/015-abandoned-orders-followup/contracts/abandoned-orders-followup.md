# Contract: Abandoned Orders Follow-up

**Feature**: `015-abandoned-orders-followup`  
**Date**: 2026-07-21

## UI contract

**Surface**: `/dashboard/orders/abandoned-orders` — `AbandonedOrdersPanel`

**Sidebar**: Order Management → **Abandoned Orders** when `abandoned_orders.read`

**List columns (minimum)**: Abandoned date, customer name, phone, email, cart summary, total, follow-up status, customer response, last updated by/at

**Default filters**: `followUpStatus` in `pending,follow_up` (exclude closed)

**Follow-up editor** (row expand or drawer):
- Status select: Pending / Follow up / Closed
- Customer response select (required when Closed)
- Remark textarea (optional)
- Save button with loading UX (`busyKey`, `notify`)

**Sync indicator**: Show `lastSyncedAt` from page-data; if sync in progress or error, show banner (`lastSyncError`).

**Export**: Button triggers `GET /api/admin/abandoned-orders/export?...` with current filter query params.

---

## Admin API

### `GET /api/admin/abandoned-orders/page-data`

**Auth**: `requirePermission("abandoned_orders.read")`

**Query** (optional):

| Param | Type | Notes |
|-------|------|-------|
| status | string | Comma-separated: `pending,follow_up,closed` |
| response | string | Comma-separated customerResponse values |
| from | ISO date | Abandoned date start |
| to | ISO date | Abandoned date end |
| search | string | Name, phone, email, cart summary |
| page | number | Default 1 |
| limit | number | Default 50, max per `LIMITS.pagination` |

**Behavior**:
1. Resolve `companyId`.
2. If `lastSyncedAt` null or > 30 min ago, run `syncAbandonedCheckoutsForCompany(companyId)` (await or fire-and-forget with stale data — **prefer await with timeout budget; return DB rows even if sync fails**).
3. Return paginated rows + sync metadata.

**Response 200**:

```json
{
  "items": [
    {
      "id": "clxxx",
      "abandonedAt": "2026-07-20T10:00:00.000Z",
      "customerName": "Jane Doe",
      "customerPhone": "0771234567",
      "customerEmail": "jane@example.com",
      "lineItemsSummary": "Serum x1",
      "totalPrice": "4500.00",
      "currency": "LKR",
      "shopifyAdminStoreHandle": "cosmo-store",
      "followUpStatus": "pending",
      "customerResponse": null,
      "remark": null,
      "lastFollowUpBy": { "id": "...", "name": "..." },
      "lastFollowUpAt": null,
      "shopifyRecoveredAt": null
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 120 },
  "sync": {
    "lastSyncedAt": "2026-07-21T08:00:00.000Z",
    "lastSyncError": null,
    "syncedJustNow": false
  },
  "canManage": true
}
```

---

### `PATCH /api/admin/abandoned-orders/[id]/follow-up`

**Auth**: `requirePermission("abandoned_orders.manage")`

**Params**: `id` — CUID (`cuidSchema`)

**Body** (Zod):

```json
{
  "followUpStatus": "closed",
  "customerResponse": "purchased_elsewhere",
  "remark": "Bought from outlet"
}
```

| Field | Rules |
|-------|--------|
| followUpStatus | `z.enum(["pending", "follow_up", "closed"])` |
| customerResponse | `z.enum([...]).optional()` — required when status is `closed` |
| remark | `trimmedString(0, LIMITS.notes.max).optional()` |

**Behavior**:
1. Load row by id + companyId; 404 if missing.
2. Validate close requires response.
3. Set `lastFollowUpById`, `lastFollowUpAt`.
4. Optimistic concurrency optional: compare `updatedAt` if client sends `expectedUpdatedAt` (v1: last-write-wins with audit log entry).

**Response 200**: Updated row object (same shape as list item).

**Errors**: 400 validation; 403 permission; 404 not found.

---

### `GET /api/admin/abandoned-orders/export`

**Auth**: `requirePermission("abandoned_orders.read")`

**Query**: Same filters as page-data (no pagination — full filtered set, max 1000 rows per SC-004).

**Response**: `text/csv` attachment `abandoned-orders.csv`

**Columns**: Abandoned Date, Customer Name, Phone, Email, Cart Summary, Total, Currency, Store, Follow-up Status, Customer Response, Remark, Last Updated By, Last Updated At, Shopify Checkout ID

**Empty set**: 400 JSON `{ "error": "No rows to export" }`

---

### `GET /api/cron/abandoned-checkouts-sync`

**Auth**: `Authorization: Bearer ${CRON_SECRET}` (same as other crons)

**Behavior**: For each company with ≥1 location with `shopifyAdminStoreHandle`, call `syncAbandonedCheckoutsForCompany`.

**Response 200**:

```json
{
  "ok": true,
  "companiesProcessed": 3,
  "upserted": 42,
  "errors": []
}
```

---

## Permissions

| Action | Permission |
|--------|------------|
| View page / list / export | `abandoned_orders.read` |
| Update follow-up | `abandoned_orders.manage` |

Default role assignment: `super_admin`, `admin` — both permissions.

---

## Out of scope

- Automated SMS/email recovery
- Merchant/contact-allocation scoping
- Linking abandoned checkout to completed `Order` row
- Shopify webhook real-time sync
- Manual “Refresh from Shopify” button (optional v1 nice-to-have)
