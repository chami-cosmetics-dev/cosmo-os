# Research: Paid Return Cancel Creates Credit Note

**Feature**: `020-paid-cancel-credit-note`  
**Date**: 2026-07-23

## R1 — What happens on return_cancel approve today?

**Decision**: Treat current approve as acknowledgement-only and replace it with payment-aware ERP completion.

**Rationale**: `app/api/admin/approvals/[id]/route.ts` only sets `OrderReturn` to `solved`/`cancel`. UI copy tells finance to “Complete cancellation in ERPNext”. No `createErpnextCreditNote`, no `cancelErpnextSalesInvoice`, no OS order void, no Shopify cancel. Paid invoices cannot be cancelled in ERPNext — they need a return SI (credit note).

**Alternatives considered**:

- Keep manual ERP and only change UI copy → rejected; does not fix the defect and leaves OS/ERP drift.
- Always credit-note every return cancel → rejected; unpaid SIs should be cancelled, not credit-noted (spec FR-002; matches `010` research).

## R2 — Reuse existing outbound credit-note helper

**Decision**: Reuse `createErpnextCreditNote` in `lib/erpnext-sync.ts` as the paid completion ERP call, wrapped with an **ensure/idempotent** layer that also **verifies the original SI becomes credit-noted**.

**Rationale**: Helper already POSTs `Sales Invoice` with `is_return: 1`, `return_against`, negative item qtys, and custom mandatory fields. Only caller today is invoice-complete finance revert. Building a second creator would duplicate payload rules. However, posting a return alone is **not** enough for paid invoices: operators report the original SI sometimes stays **Paid** instead of **Credit Note Issued**.

**Alternatives considered**:

- ERPNext `make_return` whitelisted method → not used anywhere; POST resource pattern is the project standard.
- Require finance to keep creating CN manually after OS void → rejected by spec (OS must create credit note).
- Accept return SI while original stays Paid → rejected; user requirement and accounting correctness need original credit-noted.

## R2a — Original SI must become “Credit Note Issued”

**Decision**: Paid completion succeeds only when (1) a submitted return SI exists against the original and (2) the original SI status is **Credit Note Issued** (or equivalent confirmed credit-noted state). After create/ensure, re-fetch the original SI; if it is still Paid/Unpaid/etc., apply the ERP linkage step required for this site, then re-check. If still not credit-noted, fail completion (approval stays pending).

**Rationale**: Known ERPNext behavior on newer versions: creating a return against a **paid** invoice often leaves the original **Paid** unless outstanding is applied to the original (not only to the return). Community guidance: create the return with **Update Outstanding for Self** unchecked (`update_outstanding_for_self: 0`), and/or reconcile the credit note against the parent invoice via Payment Reconciliation. OS already documents inbound cases where a return SI exists without original “Credit Note Issued” (`lib/erp-credit-note-order-sync.ts`, `find-erp-return-si-mismatches`).

**Implementation notes for plan**:

1. Set `update_outstanding_for_self: 0` on outbound credit-note create (and any ensure-create path).
2. After submit, GET original SI `status`; require `Credit Note Issued`.
3. If still Paid: attempt the project-chosen reconcile/allocate step (Payment Reconciliation against original, or documented ERP method for this tenant); re-GET status.
4. Idempotent ensure: if return exists and original already Credit Note Issued → success without recreate.

**Alternatives considered**:

- Only create return and ignore original status → rejected (user-reported defect).
- Manually PATCH original SI status field → rejected; status is computed; must fix outstanding/allocation.
- Always require human Payment Reconciliation in ERP UI → rejected for automated return-cancel approve; may remain fallback error message if API reconcile is unavailable.
## R3 — Unpaid path uses SI cancel

**Decision**: Non-`paid` financial statuses complete with `cancelErpnextSalesInvoice` (strict), never credit note.

**Rationale**: Same helper already used for unpaid fulfillment cancel and payment-reject. Idempotent `already_cancelled` / `not_found` handling exists. Aligns with paid definition from `010` / this spec (only exact `paid` is paid).

**Alternatives considered**:

- Credit note for partial/refunded → rejected; no reasonable default and conflicts with FR-003.
- Leave unpaid as manual ERP → rejected; Vault unpaid still goes through finance approve and needs a correct automatic completion once we automate paid.

## R4 — Finalize only after ERP success (no schema required)

**Decision**: Keep approval `pending` and return unsolved until ERP completion succeeds; then atomically approve + void + solve. Prefer **no migration**.

**Rationale**: Spec forbids claiming success when credit note fails. Current acknowledge-then-manual pattern marks solved too early. Gating finalize on ERP success gives natural retry on the same pending approval without new `OrderReturn` fields. Idempotent CN ensure handles double-click races.

**Alternatives considered**:

- Approve + solve first, CN non-fatal (invoice-revert style) → rejected; violates FR-006 and leaves paid SI open.
- Add `010`-style orchestration columns now → deferred; useful if product later needs visible per-system status on finance path, but YAGNI for this fix (constitution V).

## R5 — Shopify after ERP, Vault skipped

**Decision**: After successful ERP step, cancel Shopify when Cosmo Admin cancel is allowed (`isRealShopifyOrderId` + store handle + not `shouldBlockShopifyCancelInOs`). Vault skips Shopify without failing the completion.

**Rationale**: Matches `ORDER_CANCEL_APPROVAL` Cosmo auto-cancel / Vault block. Spec FR-009 requires Shopify where the path applies today; Vault has no Admin token.

**Alternatives considered**:

- Fail completion if Shopify fails on Cosmo → **accept** as incomplete (return error, leave pending if OS not yet finalized). Prefer: ERP first; if Shopify fails after ERP+OS finalize, record safe error and allow a Shopify-only retry — but simplest v1 is ERP then Shopify before finalize, and if Shopify fails leave pending (CN ensure makes retry safe).
- Cancel Shopify before ERP → rejected; paid money document is the primary correctness constraint.

## R6 — OS end state for paid credit note

**Decision**: On paid success, apply `ERP_CREDIT_NOTE_ORDER_PATCH` (`financialStatus: voided`, `fulfillmentStage: returned`), append Return SI to `erpReturnSalesInvoiceIds`, set cancel remark/timestamps as appropriate, solve return.

**Rationale**: Matches inbound credit-note sync end state (`lib/erp-credit-note-order-sync.ts`) so webhook arrival is additive (Return SI append) rather than a conflicting second business outcome.

**Alternatives considered**:

- Mirror `ORDER_CANCEL_APPROVAL` void-only without `returned` stage → weaker for returned-orders domain; credit-note path already uses `returned`.

## R7 — Relationship to spec 010 (Cosmo direct cancel)

**Decision**: Do **not** implement `return-cancel-policy` / `return-cancel-orchestrator` in this feature. Only fix finance-approval **completion**. Unpaid Cosmo direct cancel remains future work; unpaid **finance** completion (Vault today, Cosmo until 010 ships) is included.

**Rationale**: Spec 020 assumes entry rules stay unchanged (FR-004). 010 is planned but not present in the repo. Bundling both expands scope beyond the reported paid credit-note bug.

**Alternatives considered**:

- Implement 010 + 020 together → rejected for scope discipline; can share `isFullyPaidFinancialStatus` later.

## R8 — Concurrent approve / duplicate credit notes

**Decision**: `ensureErpnextCreditNote` must short-circuit when a submitted return SI already exists for `return_against`, and when OS already stores Return SI ids.

**Rationale**: Current `createErpnextCreditNote` has no idempotency; retries after partial failure would duplicate ERP documents.

**Alternatives considered**:

- DB unique constraint on approval → does not prevent ERP duplicates if create succeeds and finalize fails.
- ERP `amended_from` / naming tricks → unnecessary if list-by-`return_against` is reliable (already used in reconcile tools).
