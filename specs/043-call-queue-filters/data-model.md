# Data Model: Merchant Call Queue Filters, Assign, Export & Sales Report

**Feature**: `043-call-queue-filters`  
**Date**: 2026-08-24

## Entities

### ContactInsightCallQueue (extend)

Existing admin→merchant call-update queue. **Change uniqueness**: multiple rows per contact (history). At most one `pending` per `(companyId, contactId)` enforced in assign.

| Field | Type | Notes |
|-------|------|--------|
| `id` | cuid | existing PK |
| `companyId` | string | existing |
| `contactId` | string | existing; **no longer unique with companyId** |
| `merchantLabel` | string | existing |
| `merchantUserId` | string? | existing |
| `assignedByUserId` | string? | existing |
| `assignedAt` | DateTime | existing; start of sales-after-assign window |
| `status` | string | `pending` \| `completed` (existing constants) |
| `completedAt` | DateTime? | existing |
| `completedByUserId` | string? | existing |
| `lifetimeTotalAtAssign` | Decimal? | **NEW** snapshot of insight lifetime total at assign |
| `createdAt` / `updatedAt` | DateTime | existing |

**Indexes**: keep `(companyId, merchantLabel, status)`, `(companyId, status, assignedAt)`. Add `(companyId, contactId, status)` for pending lookup.

**Transitions**:

```text
(assign) --> pending
pending --[merchant contact update / completeCallQueueItem]--> completed
completed --[hide window ends + admin re-assign]--> NEW pending row (old completed kept)
```

**Rules**: Re-assign does not UPDATE a completed row back to pending. Skip create if pending already exists.

---

### ContactMaster (read)

| Field | Use |
|-------|-----|
| `assignedMerchant` | Merchant scope (aliases as today) |
| `category` | Current call-center category (Black List / Wrong Number / Not Responding / Not Interested / …) |
| `lastPurchaseAt` | Last-purchase date filter |
| `loyaltyAssignedTier` | Loyalty filter vs “not yet assigned” |
| `phoneNumber` / `name` | Export + list |

---

### ContactAllocationUpdate (read)

| Use | Rule |
|-----|------|
| Allocation hide | `max(createdAt)` where `category = "allocation"` |
| Last contacted / hide clocks | `max(createdAt)` where `category != "allocation"`; that row’s `category` is last outcome |
| Sales after contact | `min(createdAt)` where `category != "allocation"` and `createdAt > assignedAt` |

---

### Assign filter set (request, not stored)

| Field | Semantics |
|-------|-----------|
| `assignedMerchant` | required |
| `pushToGold` | bool; inclusive 75k–100k |
| `pushToPlatinum` | bool; inclusive 200k–250k; OR with gold if both |
| `loyalty` | `standard` \| `gold` \| `platinum` \| `unassigned` \| omit |
| `lastPurchaseFrom` / `lastPurchaseTo` | inclusive dates; omit = off |
| `brand` | purchased-brand needle; omit = off |
| `page` / `pageSize` | list paging |
| `limit` | eligible-ids first N |

---

### Sales after assignment (derived)

Not stored. Sum qualifying purchases with date **&gt; `assignedAt`**. Same eligibility as insight lifetime (placed, non-cancelled; Adapt + OS orders).

### Sales after contact (derived)

Same sum with date **&gt; first post-assign non-allocation update**. If no such update: empty / null (do not treat as 0 sales-after-contact unless product displays 0).

---

### Permanent / timed omit (derived)

See [research.md](./research.md) R4. Not a new table.

---

## Validation

- Assign `contactIds`: 1–200, must belong to merchant aliases, must pass hide rules at assign time (stale client selection rejected or skipped with counts).
- Push bands: inclusive closed intervals; both chips = union.
- Select count N: positive int; skip pending; cap N by remaining eligible.

## Migration

`npm run db:migrate:create` then `db:deploy:all`:

1. Drop unique `ContactInsightCallQueue_companyId_contactId_key`.
2. Add `lifetimeTotalAtAssign Decimal?`.
3. Add index `(companyId, contactId, status)`.

Existing rows: one per contact; backfill snapshot null OK (report treats missing snapshot as recompute-at-read of current lifetime only if needed — prefer null = unknown at-assign, still compute after-assign sales).
