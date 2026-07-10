# Contract: Invoice Complete + PE Integrity

**Feature**: `002-invoice-complete-pe`  
**Date**: 2026-07-10

Behavioral contracts for existing admin APIs (no new public product surface required beyond extending Failed PE discovery).

## 1. Mark invoice complete

**Endpoint**: `POST /api/admin/orders/{id}/fulfillment`  
**Action**: `mark_invoice_complete`  
**Body (relevant)**: payment mode / MOP selection as today (`mop` / mode key per existing UI).

### Success with PE

- Order: `fulfillmentStage = invoice_complete`, `financialStatus = paid`
- ERP: PE created against linked SI for chosen mode, **or** SI `outstanding_amount <= 0` (no duplicate PE)
- Response: success; no `erpPeError` (or explicit `peStatus: "already_paid" | "created"`)

### Success with PE failure (allowed)

- Order stage still `invoice_complete` / paid
- `erpPeSyncError` (and related fields) populated
- Response includes `erpPeError` so UI does **not** claim PE created

### Hard failure cases (must not silent-skip when MOP required)

- No resolvable Sales Invoice (`erpnextInvoiceId` preferred, then po_no/name)
- ERP credentials / company missing when PE required
- MOP unresolved when required

These MUST surface as `erpPeError` (throw → mark failed), not as clean success without PE.

**Bulk**: `POST /api/admin/orders/bulk-invoice-complete` — same per-order semantics.

---

## 2. Retry / repair PE

**Endpoint**: `POST /api/admin/orders/{id}/retry-erp-pe-sync`  
**Body**: optional MOP override (existing).

### Preconditions

- Order `fulfillmentStage = invoice_complete`
- Authorized failed-ERP / finance permission as today
- After this feature: also allowed for silent-gap orders (seed failure or accept repair without prior error)

### Outcomes

- PE created or already paid → clear `erpPeSync*`
- Else → update `erpPeSyncError`

---

## 3. List PE failures / gaps

**Endpoint**: `GET /api/admin/orders/failed-erp-syncs?kind=payment_entry` (extend)

### Include

1. Existing: `erpPeSyncError != null` + `invoice_complete`
2. New (silent gaps): `invoice_complete` + linked SI outstanding > 0 and no successful PE signal (implementation may probe ERP or maintain seeded error rows)

Response shape remains list of orders + error/MOP fields for the PE tab UI.

---

## 4. Finance approval — no re-queue

**Endpoint**: `PATCH /api/admin/approvals/{id}` with `action: approve`

### When order.fulfillmentStage === `invoice_complete`

| Approval type | Stage | PE |
|---------------|-------|-----|
| `order_payment_approval` | **Keep** `invoice_complete` (do not set `print`) | Sync prepaid PE if still outstanding |
| `payment_method_change_approval` | **Keep** `invoice_complete` if already there (treat as post-delivery) | Existing gateway PE rules |
| `delivery_payment_approval` | Existing invoice_complete / reapproval rules | Persist PE failure to `erpPeSync*` on throw |

### When order is not yet invoice complete

Unchanged first-time prepaid → invoice complete behavior.

---

## 5. UI contracts

- Invoice complete / bulk: toast or row status must distinguish **PE created**, **already paid in ERP**, **PE failed — see Failed ERP Syncs**.
- Failed ERP Syncs → Payment Entry: show known failures + silent-gap repairs; retry with MOP selector.
