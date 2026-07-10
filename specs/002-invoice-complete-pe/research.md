# Research: Invoice Complete PE Integrity

**Feature**: `002-invoice-complete-pe`  
**Date**: 2026-07-10

## R1 — Why OS can be invoice complete with no ERP PE

**Decision**: Treat silent PE skips as defects. Invoice complete / retry with `requireMop: true` must either create a PE, confirm SI already paid (`outstanding <= 0`), or throw and persist `erpPeSyncError`. Prefer SI lookup via `erpnextInvoiceId` when present.

**Rationale**: `markOrderInvoiceComplete` always sets OS `invoice_complete` + `paid`, then calls `createDeliveryPaymentEntry`. That helper often **returns without throwing** when the SI is not found (lookup by `order.name` / `po_no` only — ignores `erpnextInvoiceId`). The completer then clears PE failure and the UI can imply success. Example class: Shopify order `SV1008360` linked to SI `SV100-0695` — name/po_no mismatch → no PE, no `erpPeSyncError`.

**Alternatives considered**:
- Roll back OS invoice complete if PE fails — rejected for v1 (breaks fulfillment UX; existing pattern is complete + failed PE tab).
- Only fix UI messaging — insufficient; accounting gap remains and repair list stays empty.

## R2 — Repair / discovery for historical silent gaps

**Decision**: Extend Failed ERP Syncs → Payment Entry (or adjacent repair list) to include `invoice_complete` orders with linked SI still outstanding and no usable PE, even when `erpPeSyncError` is null. Seed failure state or allow dedicated repair retry with selectable MOP. Do not mass-auto-create PEs without operator action.

**Rationale**: Spec US2; current list is `erpPeSyncError != null` only, so silent gaps are invisible. Operator retry already exists at `retry-erp-pe-sync`.

**Alternatives considered**:
- One-off script only for SV1008360 — rejected as primary solution (more orders exist).
- Nightly auto-PE for all invoice_complete — rejected (constitution simplicity; risk of wrong MOP).

## R3 — Two invoice-complete flows (product rule)

**Decision**:

| Flow | Orders | On finance approve | Fulfillment | Invoice complete UI |
|------|--------|--------------------|-------------|---------------------|
| **1** | KOKO / bank / WebXPay | Mark invoice complete (`invoiceCompleteAt`) + create PE → **print** | Continue print→…→deliver | After deliver, auto-close stage to `invoice_complete` (no second manual PE step). Queue excludes rows with `invoiceCompleteAt` set. |
| **2** | Other payments | N/A | Full path to deliver | Appear on Invoice Complete (`delivery_complete` + `invoiceCompleteAt` null); staff mark manually → PE |

**Rationale**: Stakeholder clarification (2026-07-10). Finance path completes payment early but still needs physical dispatch/delivery.

**Alternatives considered**:
- Auto invoice-complete stage at approval (skip print) — rejected; warehouse still needs fulfillment.
- Always manual invoice complete for all — rejected; prepaid PE timing is at approval.

## R4 — Prepaid finance approval must not re-open invoice complete

**Decision**: On approve of `ORDER_PAYMENT_APPROVAL` and `PAYMENT_METHOD_CHANGE_APPROVAL`, if `fulfillmentStage === "invoice_complete"`, do **not** force stage back to `print`. Keep paid/invoice-complete; still run ERP PE sync only if outstanding > 0.

**Rationale**: Spec US3 path A late/re-approval case. Today approval can force `print` and re-send through the pipeline into the invoice-complete queue.

**Alternatives considered**:
- Cancel such approvals as no-ops without ERP sync — too weak if SI still unpaid.

## R5 — Stack / testing

**Decision**: No new schema required for the core fix if repair can seed `erpPeSync*` or query ERP outstanding on demand. Prefer reuse of existing PE failure fields. Unit-test SI lookup + stage guard + path-specific PE entry points; Vitest for pure helpers. Manual Vault UAT for SV1008360 / SI SV100-0695.

**Rationale**: Constitution V (simplicity); existing `erpPeSyncError` / Failed PE tab already support retry UX.

**Alternatives considered**:
- New `peMissing` boolean column — unnecessary if discovery query + seed on detect works.
- ERP webhook-only detection — slower and harder to operate.

## R6 — Touchpoints (implementation map)

| Area | Path | Change intent |
|------|------|----------------|
| PE create | `lib/erpnext-sync.ts` `createDeliveryPaymentEntry` | Use `erpnextInvoiceId`; throw on missing SI when `requireMop` |
| Completer | `lib/mark-order-invoice-complete.ts` | Clear failure only on confirmed PE / already paid (normal path) |
| Finance PE | `approvals/[id]` + `syncFinanceApprovedPrepaidPaymentToERPNext` | PE integrity on approval path; no silent skip |
| Approvals stage | `app/api/admin/approvals/[id]/route.ts` | Skip print re-queue when already `invoice_complete` |
| Discovery | `failed-erp-syncs` PE list / new repair filter | Include silent gaps |
| Retry | `retry-erp-pe-sync` | Allow repair without prior error (or seed error first) |
| UI | bulk invoice complete + Failed PE tab | Honest success vs PE-failed messaging |

## Resolved clarifications

Stakeholder path rules (2026-07-10) encoded in R3. No remaining NEEDS CLARIFICATION for plan phase.
