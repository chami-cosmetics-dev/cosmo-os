# Contract: Copy Review Contacts for Follow-up

**Feature**: `007-copy-review-contacts`  
**Date**: 2026-07-15

## UI contract (Merchant Reviews)

**Surface**: Assigned Review Queue header in `MerchantReviewPanel` (`/dashboard/contacts/reviews`).

**Control**: Button e.g. **Copy all contact numbers** (visible when `canManage`; disabled when busy or no eligible pending/follow_up phones in `filteredOrders`).

**Client sequence** (normative):

1. Derive candidates from current `filteredOrders` (see [data-model.md](../data-model.md)).
2. If zero phones to copy → `notify` info/error; stop (no API).
3. `navigator.clipboard.writeText(clipboardText)` where `clipboardText` is one phone per line.
4. On clipboard failure → `notify.error`; stop (no API).
5. `POST /api/admin/merchant-reviews/mark-follow-up` with pending (and only those) order IDs that contributed a phone.
6. On success → patch local `queueOrders` statuses to `follow_up` for `updatedOrderIds`; `notify.success` with counts (copied, updated, skipped).
7. On partial/error after copy → `notify` warning/error including updated vs failed counts.

**Clipboard format**:

```text
0776290291
0712345678
...
```

- One number per contributing order (duplicates allowed if shared across orders).
- Trimmed; blank phones never listed.

**Unchanged**: Per-order detail `GET` / Review Capture Form `PUT` on `/api/admin/merchant-reviews/orders/[id]`.

---

## Admin API

### `POST /api/admin/merchant-reviews/mark-follow-up`

**Auth**: `requirePermission("merchant_reviews.manage")`

**Body** (Zod):

```json
{
  "orderIds": ["clxxxxxxxx", "clyyyyyyyy"]
}
```

| Field | Rules |
|-------|--------|
| orderIds | `z.array(cuidSchema).min(1).max(500)` |

**Server behavior**:

1. Resolve actor `companyId`; 404 if missing.
2. Load orders where `id in orderIds` and `companyId` matches; others count as `notFound`.
3. Load existing `MerchantOrderReview` rows for those orders.
4. For each matched order:
   - If review status is `reviewed` or `no_response` → skip (`terminalStatus`).
   - If review status is `follow_up` → skip update (`alreadyFollowUp`) — still success for idempotency.
   - If missing review or `pending` → upsert `reviewStatus: "follow_up"` (defaults for other fields on create; do not clear existing notes/call fields on update beyond status).
5. Write one audit log: action `merchant_review_bulk_follow_up`, summary with updated count, `afterData` with counts + sample of updated IDs.
6. Return JSON below.

**Response 200**:

```json
{
  "ok": true,
  "updatedOrderIds": ["clxxxxxxxx"],
  "counts": {
    "requested": 10,
    "updated": 7,
    "alreadyFollowUp": 1,
    "terminalStatus": 1,
    "notFound": 1
  }
}
```

**Error responses**:

| Status | When |
|--------|------|
| 401/403 | Auth / permission failure (`requirePermission`) |
| 400 | Zod validation failed |
| 404 | No company on user |
| 503 | Merchant review table unavailable / unexpected persistence error |

**Idempotency**: Re-posting the same pending IDs that are already `follow_up` yields `updated: 0`, `alreadyFollowUp: N`, `ok: true`.

---

## Permissions

| Action | Permission |
|--------|------------|
| View Merchant Reviews / queue | `merchant_reviews.read` |
| Copy-all + mark Follow up | `merchant_reviews.manage` |
| Save Review Capture Form | `merchant_reviews.manage` (existing) |

---

## Out of scope

- Auto-dial, SMS blast, export Excel alternate for this button (export route may remain separate).
- Changing review status values or Review Capture Form fields.
- Read-only users copying without status change (deferred).
