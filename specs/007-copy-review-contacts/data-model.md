# Data Model: Copy Review Contacts for Follow-up

**Feature**: `007-copy-review-contacts`  
**Date**: 2026-07-15

## Entities (existing — no schema change)

### Order (existing, read)

Used as queue row source and ownership gate.

| Field | Role |
|-------|------|
| id | CUID — submitted in bulk mark payload |
| companyId | Must match actor company |
| customerPhone | Clipboard source (non-empty trimmed) |
| createdAt | Client date-range filter only |
| assignedMerchantId | Existing detail UX; not required for bulk mark |

### MerchantOrderReview (existing, write)

One review row per order (`orderId` unique). Pending may be **implicit** (no row yet).

| Field | Role for this feature |
|-------|------------------------|
| orderId | Join key |
| companyId | Set on create from order |
| merchantUserId | On create/update: prefer `order.assignedMerchantId`, else actor user id (same as single-order PUT) |
| reviewStatus | Target `"follow_up"` for bulk mark; do not overwrite `"reviewed"` / `"no_response"` |
| callMade / callback / reason / reviewer* | Unchanged by bulk mark (leave existing values; on create use defaults: callMade false, nulls) |
| reviewMarkedAt | Leave null on Follow up (only set when status is reviewed, per existing PUT) |
| updatedAt | Touched by upsert |

### Review status values (business)

| Value | Label | Bulk mark behavior |
|-------|-------|--------------------|
| `pending` | Pending | Eligible → set `follow_up` (create row if missing) |
| `follow_up` | Follow Up | Idempotent — count as already follow-up; no regression |
| `reviewed` | Reviewed | Skip — never bulk-change |
| `no_response` | No Response | Skip — never bulk-change |

## Logical client entities (not persisted)

### Filtered Assigned Review Queue

In-memory list = `queueOrders` after search / status / merchant / date filters (`filteredOrders`).

### Copy batch (ephemeral)

Built before clipboard:

- `clipboardText`: phones joined with `\n` (one per eligible order, list order preserved)
- `markOrderIds`: order IDs with phone + status `pending` (and optionally include already `follow_up` only for clipboard, not for “updated” count)
- Skip tallies: missing phone, terminal status

## State transitions

```text
[No review row]  ──(bulk mark)──►  reviewStatus=follow_up  (create)
pending          ──(bulk mark)──►  follow_up
follow_up        ──(bulk mark)──►  follow_up  (no-op)
reviewed         ──(bulk mark)──►  reviewed   (blocked)
no_response      ──(bulk mark)──►  no_response (blocked)

follow_up / pending ──(Review Capture Form PUT)──►  reviewed | no_response | follow_up | pending
```

Per-order Review Capture Form remains the path from Follow up to terminal outcomes.

## Validation rules

- Bulk body: `orderIds` array of CUID strings; min length 1 when calling API; max length **500** (raise only if product proves larger merchant queues).
- Server ignores/skips IDs not in actor `companyId`.
- Empty clipboard candidate set → no API call, no DB writes.
- Combined UI action requires `canManage` / `merchant_reviews.manage` (button hidden or disabled when read-only).

## Relationships

```text
Company 1──* Order 1──0..1 MerchantOrderReview
User (actor) ──audit──► merchant_review_bulk_follow_up
```
