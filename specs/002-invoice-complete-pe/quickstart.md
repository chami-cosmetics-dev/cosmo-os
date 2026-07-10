# Quickstart: Invoice Complete PE Integrity

**Feature**: `002-invoice-complete-pe`  
**Date**: 2026-07-10

Validation guide after implementation. Prefer Vault OS for the known SI example; smoke the same flows on Cosmo where invoice complete is used.

## Prerequisites

- Vault env: `npm run env:use vault` (or deploy with Vault DB)
- Access to ERP [SV100-0695](https://supplement-vault-lk-01.m.frappe.cloud/app/sales-invoice/SV100-0695) (or a test SI)
- User with fulfillment invoice-complete + failed ERP sync permissions
- Finance user for approval scenarios

## 1. New invoice complete creates PE (or visible failure)

1. Pick an order at **Delivery complete** with linked unpaid SI.
2. Open **Invoice complete**, choose ERP payment mode, complete.
3. **Expect**: SI shows new PE / reduced outstanding **or** order appears under **Failed ERP Syncs → Payment Entry** with error (not a silent clean success).

## 2. Repair known silent gap

1. Locate order **SV1008360** (or any `invoice_complete` with SI outstanding and no PE).
2. Confirm it appears in PE failure/gap list (after fix).
3. Retry with correct MOP.
4. **Expect**: SI [SV100-0695](https://supplement-vault-lk-01.m.frappe.cloud/app/sales-invoice/SV100-0695) (or that order’s SI) paid/PE present; OS PE error cleared.

## 3. Prepaid finance approval does not re-queue

1. Take a KOKO / bank transfer / WebXPay order already **Invoice complete** with PE done.
2. Create/approve a finance payment approval for that order (or payment-method change as applicable).
3. **Expect**: Stage stays invoice complete; order does **not** reappear in Invoice complete queue.
4. Control: prepaid order **not** yet invoice complete still can reach invoice complete once after approval (first time).

## 4. Already-paid SI

1. Invoice-complete an order whose SI outstanding is already 0.
2. **Expect**: Success without duplicate PE; no PE failure row.

## 5. Automated checks

```bash
npm test
```

Add/extend unit tests for:
- `createDeliveryPaymentEntry` prefers `erpnextInvoiceId`
- requireMop path throws when SI missing
- approval stage guard when already `invoice_complete`

## Contracts / model

- [contracts/invoice-complete-pe.md](./contracts/invoice-complete-pe.md)
- [data-model.md](./data-model.md)
- [research.md](./research.md)
