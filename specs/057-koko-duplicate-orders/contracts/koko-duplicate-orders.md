# Contract: KOKO Duplicate Order Minimization

**Feature**: `057-koko-duplicate-orders`  
**Date**: 2026-09-18  
**Extends**: Finance approvals + sample/free-issue fulfillment

## UI contracts

### Sample / order detail — link time confirm

**Surfaces**: Sample/free-issue panel, order fulfillment detail (stages `order_received` / `sample_free_issue`)

For ERP KOKO orders with `kokoLinkTimeConfirmedAt` null:

- Show required **KOKO link generated time** control (date + time to minute).
- Show **Confirm** action; disabled until time set.
- Soft **duplicate notice** when siblings exist (phone match within lookback; highlight identical item set). Notice does not block confirm.
- After confirm: time read-only for merchant (or editable until finance approved — server enforces).
- Block advance to print until confirmed.

Non-KOKO orders: no new fields.

### Finance Approvals — grouping

**Surface**: `/dashboard/approvals` — `FinanceApprovalsPanel`

For `order_payment_approval` rows that are KOKO:

- Display **Link generated time** (formatted Asia/Colombo).
- When `duplicateGroupId` shared by 2+ members: render as a **group** (nested rows or grouped card) showing each order’s merchant, phone, items summary, link time, approval status (pending/approved).
- Approve one member does not approve others.
- **Cancel duplicate** action visible only if user has `finance.approvals.cancel_koko_duplicate`.

Non-KOKO approval types: unchanged.

---

## Admin API

### `POST /api/admin/orders/[id]/koko-link-time`

**Auth**: `fulfillment.sample_free_issue.manage` (or same manage permission used for sample advance)

**Params**: `id` = order CUID

**Body** (Zod):

```json
{
  "kokoLinkGeneratedAt": "2026-09-18T11:30:00+05:30"
}
```

| Field | Rules |
|-------|--------|
| `kokoLinkGeneratedAt` | Required ISO datetime; stored UTC; minute precision |

**Behavior**:
1. Order must be ERP-sourced KOKO, not voided/cancelled.
2. If payment already finance-**approved**, reject 409.
3. Set `kokoLinkGeneratedAt`, `kokoLinkTimeConfirmedAt`, `kokoLinkTimeConfirmedById`.
4. Call `createOrGetOrderPaymentApproval` if no pending/approved payment approval exists.
5. Response includes order summary + `duplicateNotice` siblings (may be empty).

**Errors**: 400 validation, 403 auth, 404 missing, 409 illegal state.

---

### `GET /api/admin/orders/[id]/koko-link-time` (optional convenience)

**Auth**: sample read/manage  

**Behavior**: Returns current link-time fields + `duplicateNotice` candidates for confirm UI. Skip if implementers fold into existing order detail GET.

---

### `GET /api/admin/approvals` (and SSR approvals page query)

**Auth**: `finance.approvals.read` / `.manage` (unchanged)

**Item fields (additive for KOKO payment approvals)**:

| Field | Type | Notes |
|-------|------|-------|
| `kokoLinkGeneratedAt` | string \| null | ISO |
| `duplicateGroupId` | string \| null | Ephemeral; null if ungroupable |
| `duplicateGroupSize` | number | ≥1 |
| `duplicateGroupMembers` | array | Compact siblings: orderId, approvalId, status, link time, merchant label, item summary |

Grouping computed server-side with 30-day lookback + phone + item fingerprint.

---

### `POST /api/admin/approvals/[id]/cancel-koko-duplicate`

**Auth**: `finance.approvals.cancel_koko_duplicate`

**Params**: approval id (or order id — pick one; prefer approval id consistent with panel)

**Body** (optional Zod):

```json
{
  "reason": "Duplicate KOKO — paid link matches sibling"
}
```

| Field | Rules |
|-------|--------|
| `reason` | Required trimmed string, min length per `LIMITS` (reuse cancel reason floor ≥5) |

**Behavior**:
1. Resolve order + ensure KOKO duplicate context (group size ≥2 or sibling approved/pending).
2. Cancel pending `order_payment_approval` if present.
3. Cancel order in OS + ERP (existing SI cancel family); surface ERP failure without claiming full success.
4. Audit log with reason + group metadata.
5. Response: updated approval/order status + ERP outcome flag.

**Errors**: 403 without permission, 400 validation, 409 if not cancellable, 502/4xx with ERP failure detail when OS cancel must not silently succeed alone (match existing cancel semantics).

---

### Fulfillment — `advance_to_print` (behavior change)

**Auth**: unchanged  

For ERP KOKO without `kokoLinkTimeConfirmedAt`: reject with clear error (“Confirm KOKO link generated time first”).

---

### ERP ingest (behavior change)

`lib/erp-sales-invoice-ingest.ts`: if ERP KOKO and `kokoLinkTimeConfirmedAt` is null, **do not** create `order_payment_approval`. All other gateways unchanged.

---

## RBAC

| Permission | Purpose |
|------------|---------|
| `finance.approvals.cancel_koko_duplicate` | Cancel duplicate from finance group UI |
| Existing `finance.approvals.manage` | Approve / reject (unchanged) |
| Existing sample manage | Confirm link time |

Seed permission in `lib/rbac.ts` DEFAULT_PERMISSIONS + appropriate role maps.
