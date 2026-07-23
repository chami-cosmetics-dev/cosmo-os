# Contract: Return Cancel Finance Completion

**Feature**: `020-paid-cancel-credit-note`  
**Audience**: Finance approvals API/UI, ERPNext sync, Shopify Admin cancel (Cosmo)

## 1. Completion mode (server-only)

```ts
type ReturnCancelCompletionMode = "credit_note" | "cancel_si";

function resolveReturnCancelCompletionMode(
  financialStatus: string | null | undefined,
): ReturnCancelCompletionMode {
  return financialStatus?.trim().toLowerCase() === "paid"
    ? "credit_note"
    : "cancel_si";
}
```

Client input must never override this.

| Mode | ERP action | Success criteria | Forbidden ERP action |
|---|---|---|---|
| `credit_note` | Ensure return Sales Invoice (`is_return`, `return_against`, `update_outstanding_for_self: 0`) + original SI status **Credit Note Issued** | Return SI submitted **and** original status is Credit Note Issued | `frappe.client.cancel` on original paid SI; treat “return exists but original still Paid” as success |
| `cancel_si` | Cancel original submitted SI | Original cancelled / already cancelled | Create credit note |

## 2. PATCH `/api/admin/approvals/[id]` — return_cancel approve

### Preconditions

- Authenticated user with `finance.approvals.manage`
- `{id}` valid CUID, same company, type `return_cancel`, status `pending`
- Linked order + return exist and return is still cancellable (not already solved for another path)

### Approve algorithm

1. Load order + location (ERP instance, Shopify handle).
2. Resolve `completionMode` from current `order.financialStatus`.
3. **Outside DB transaction**, run ERP step:
   - `credit_note` → `ensureErpnextCreditNote(order, location)` → `{ creditNoteName }`
   - `cancel_si` → `cancelErpnextSalesInvoice(..., { strict: true, directInvoiceName? })` → must be `cancelled` or `already_cancelled` (not `not_found`)
4. Shopify (Cosmo only when allowed): `cancelShopifyOrder` or treat already-cancelled / non-real id as success/skip; Vault → skip without failure.
5. **On any required failure**: HTTP `422` or `502` with `{ error: string }`; **do not** set approval `approved` or return `solved`.
6. **On success**: transaction:
   - Approval → `approved`, `reviewedById`, `reviewedAt`
   - Order → voided/returned patch; append `creditNoteName` when mode is `credit_note`; set cancel metadata
   - OrderReturn → `solved` / `cancel` / action metadata
7. Audit: paid success mentions credit note name; unpaid mentions SI cancel; reject unchanged.

### Reject algorithm

Unchanged: approval `rejected`, return reset to `pending`, no ERP/Shopify calls.

### Response (success)

Existing approvals PATCH success shape, plus optional:

```json
{
  "completionMode": "credit_note",
  "creditNoteName": "ACC-SINV-RET-...."
}
```

or

```json
{
  "completionMode": "cancel_si",
  "invoiceName": "ACC-SINV-...."
}
```

### Response (failure examples)

```json
{ "error": "Cannot create credit note: original Sales Invoice not found for this order." }
```

```json
{ "error": "ERP cancellation failed. Fix the Sales Invoice in ERPNext, then approve again." }
```

## 3. `ensureErpnextCreditNote` contract

```ts
type EnsureCreditNoteResult = {
  creditNoteName: string;
  originalInvoiceName: string;
  originalStatus: string; // must be "Credit Note Issued" on success
  created: boolean; // false when reused existing return SI
};
```

Rules:

1. If OS `erpReturnSalesInvoiceIds` already has a usable name **and** original SI status is `Credit Note Issued` → return it (`created: false`).
2. Else if ERP lists a submitted return SI for `return_against = original SI` → reuse that name (`created: false`).
3. Else create via existing credit-note POST payload **including `update_outstanding_for_self: 0`** → return new name (`created: true`).
4. After create/reuse: GET original SI. If status is not `Credit Note Issued`, attempt reconcile/allocate against the original (per research), then GET again.
5. If original is still not credit-noted → throw; caller maps to approve failure (do not finalize OS).
6. Missing credentials, company, or original SI → throw; caller maps to approve failure.

Invoice-complete revert may keep calling create/ensure with its own non-fatal policy; return-cancel approve treats failure **or** original-still-Paid as fatal to finalize.

## 4. Finance approvals list / UI contract

For `type === "return_cancel"` rows, page-data/list may include:

```ts
{
  completionMode: "credit_note" | "cancel_si"; // from linked order financialStatus
  erpAdminInvoiceUrl: string | null; // existing
}
```

UI copy:

- Paid / `credit_note`: approve creates the ERP credit note and voids the OS return order (Cosmo also cancels Shopify when configured).
- Non-paid / `cancel_si`: approve cancels the unpaid ERP SI and voids the OS return order.
- Remove wording that implies “mark processed then cancel manually in ERPNext” as the primary path.

## 5. Inbound webhook coexistence

After OS creates a credit note, ERP may webhook the return SI. Inbound handlers must:

- Append Return SI ids idempotently
- Not reopen a solved return cancel
- Not fail if order is already `voided` + `returned`

## 6. Out of scope for this contract

- Cosmo unpaid **direct** cancel without finance (`010`)
- Changing when `return_cancel` approvals are **created**
- Other approval types (`order_cancel_approval` remains manual ERP credit note unless separately specified)
