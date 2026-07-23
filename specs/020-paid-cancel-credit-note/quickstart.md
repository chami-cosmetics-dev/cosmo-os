# Quickstart: Paid Return Cancel Creates Credit Note

**Feature**: `020-paid-cancel-credit-note`  
**Purpose**: Validate finance approve completion for returned-order cancel (paid → credit note, unpaid → SI cancel) on non-production deployments.

## Prerequisites

- Non-prod Cosmo and/or Vault env selected (`npm run env:use <target>`)
- Finance user with `finance.approvals.manage`
- Merchant/ops user who can request return cancel
- Location with working ERPNext credentials (and Cosmo Shopify Admin handle for Shopify checks)
- Test orders: one **paid** returned order, one **unpaid** returned order, each with a submitted ERP Sales Invoice

Do **not** run create/cancel mutations against production ERP without explicit in-the-moment approval.

## Automated checks

```bash
npm test -- lib/return-cancel-completion.test.ts
npm test -- lib/erpnext-sync.test.ts
npm run lint
npm test
```

Expect: paid matrix never calls SI cancel; unpaid never creates CN; ensure CN reuses existing return SI.

## Scenario A — Paid return cancel → credit note

1. Mark/ensure order is returned and `financialStatus` is exactly `paid`.
2. From Returned Orders, **Request Cancel** with a remark → pending `return_cancel` approval appears.
3. Confirm order is still active (not voided) and no new Return SI on the order yet.
4. As finance, open Approvals → approve the return cancel request.
5. **Expect**:
   - Approval becomes `approved`
   - ERP has a submitted **return** SI (`is_return`) against the original SI
   - Original SI status is **Credit Note Issued** (not still **Paid**)
   - OS order is `voided` + `returned`, Return SI id stored
   - Return follow-up is `solved`
   - Cosmo: Shopify order cancelled (or already cancelled); Vault: Shopify skipped
6. Approve the same request again (if UI allows) or retry after a forced mid-failure: **no second** credit note.
7. **Fail check**: if a return SI exists but original is still Paid, treat as incomplete — do not mark OS solved.

## Scenario B — Unpaid return cancel → SI cancel (no credit note)

1. Returned order with non-paid status (e.g. `pending` / unpaid) and submitted unpaid SI.
2. Request Cancel → finance approve.
3. **Expect**:
   - Original SI cancelled in ERP (`docstatus` cancelled), **no** new return SI for this action
   - OS order voided/returned, return solved
4. Confirm ERP list of returns against that SI does not gain a new credit note from this approve.

## Scenario C — Reject creates nothing

1. Paid returned order, pending return cancel approval.
2. Finance **rejects**.
3. **Expect**: no credit note, SI still submitted, order not voided, return back to `pending`.

## Scenario D — Missing SI / ERP failure

1. Paid return whose SI cannot be resolved (or ERP temporarily broken).
2. Approve.
3. **Expect**: clear error; approval remains `pending`; return not solved; order not voided.
4. Restore SI/ERP and approve again → Scenario A success (idempotent).

## Scenario E — Webhook after OS-created credit note

1. Complete Scenario A.
2. If ERP posts the return SI webhook, confirm OS stays voided/returned and Return SI ids remain correct (no reopen of the return cancel).

## Pass criteria

- [ ] A–E match expectations on the target non-prod deployment(s)
- [ ] Unit tests for completion mode + ensure CN pass
- [ ] No production ERP mutations without explicit approval
