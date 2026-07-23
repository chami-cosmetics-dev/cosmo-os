# Implementation Plan: Paid Return Cancel Creates Credit Note

**Branch**: `fix/finance-approval-fixes` | **Date**: 2026-07-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/020-paid-cancel-credit-note/spec.md`

## Summary

Today, finance **approve** on a `return_cancel` request only marks the `OrderReturn` solved and tells staff to finish work in ERPNext manually — the OS never cancels or credit-notes the Sales Invoice, and does not void the order. That leaves paid returns on the wrong path: a paid SI cannot be cancelled and must be reversed with a **credit note**.

This plan makes return-cancel **approval completion** server-driven and payment-aware: **paid** → ensure ERP return credit note **and** original SI status **Credit Note Issued** (not left Paid) via hardened `createErpnextCreditNote` / ensure + verify, then void/returned OS state + Cosmo Shopify cancel; **non-paid** → `cancelErpnextSalesInvoice` + void OS + Cosmo Shopify cancel. Approve does not finalize until required ERP work succeeds (idempotent retry). Request/reject UX and Cosmo/Vault **entry** routing stay unchanged.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20, TypeScript target ES2017

**Primary Dependencies**: Next.js App Router, React, Prisma, Zod, Auth0, Shopify Admin REST (Cosmo), ERPNext REST (`createErpnextCreditNote`, `cancelErpnextSalesInvoice`)

**Storage**: Neon PostgreSQL through Prisma; **no new schema required** if completion gates on ERP success while the approval stays `pending` until finalize (reuse existing `Order`, `OrderReturn`, `ApprovalRequest`, `erpReturnSalesInvoiceIds`)

**Testing**: Vitest for completion-path matrix (paid CN / unpaid cancel / idempotent retry / missing SI); route-level behavior covered via focused lib tests; `npm test`, lint, typecheck; manual non-prod UAT per quickstart

**Target Platform**: Vercel-hosted Cosmo OS and Vault OS deployments

**Project Type**: Single full-stack Next.js web application (rider app unaffected)

**Performance Goals**: One completion attempt per approve click; ERP/Shopify calls outside DB transactions; retries must not create duplicate credit notes

**Constraints**: Server-authoritative paid vs unpaid; never cancel a paid SI; Vault must not call Shopify Admin cancel; sanitize errors; validate CUID + finance permission; fail closed when SI identity or ERP config is missing

**Scale/Scope**: Finance approvals approve path for `return_cancel`, ERP credit-note helper hardening, finance UI copy, audit/notify text; rearrange and other approval types regression-only. Spec `010` Cosmo unpaid **direct** cancel remains out of scope (not implemented); unpaid **finance** completion is in scope because Vault (and current Cosmo) still use request-cancel for unpaid returns.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### Pre-research gate

- **I. Multi-Database Migration Discipline — PASS**: Prefer no Prisma migration. If implementation later needs durable processing fields, create only via `npm run db:migrate:create` and deploy all three DBs with fresh prod confirmation.
- **II. Environment & Credential Isolation — PASS**: Reuse location-scoped ERP/Shopify config; Vault Shopify cancel remains blocked via existing `shouldBlockShopifyCancelInOs`.
- **III. Test & Typecheck Gates — PASS**: Vitest coverage for completion routing + idempotency; CI gates unchanged.
- **IV. Production Deployment Safety — PASS**: Planning only; no prod deploy/push.
- **V. Simplicity & Scope Discipline — PASS**: Reuse `createErpnextCreditNote` / `cancelErpnextSalesInvoice` / credit-note OS patch; one focused completion helper; no new workflow framework; do not implement full `010` orchestrator here.
- **Security/validation — PASS**: Approve remains `finance.approvals.manage` + company-scoped CUID; client cannot choose cancel vs credit note.

### Post-design gate

All gates remain **PASS** after Phase 1:

- `data-model.md` documents no required migration; optional fields only if retry visibility proves insufficient.
- Contract makes paid → credit note and unpaid → cancel server-side, with finalize-after-ERP and idempotent CN ensure.
- Quickstart forbids production ERP mutation tests without explicit approval.

## Project Structure

### Documentation (this feature)

```text
specs/020-paid-cancel-credit-note/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── return-cancel-completion.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Later: /speckit-tasks
```

### Source Code (repository root)

```text
app/api/admin/approvals/[id]/route.ts

components/organisms/
└── finance-approvals-panel.tsx

lib/
├── return-cancel-completion.ts       # New: paid/unpaid completion orchestration
├── return-cancel-completion.test.ts  # New
├── erpnext-sync.ts                   # Harden ensure/idempotent credit note
├── erp-credit-note-order-sync.ts     # Reuse ERP_CREDIT_NOTE_ORDER_PATCH / Return SI append
├── approval-workflow.ts              # Shared paid normalization helper export if needed
├── shopify-admin.ts                  # Existing cancel + Vault block
└── audit-log.ts

# Regression touchpoints only (copy / notify)
lib/approval-workflow.ts              # return_cancel notify body
components/organisms/returned-orders-panel.tsx  # optional help text only
```

**Structure Decision**: Keep the single Next.js app. Put payment-aware completion in a testable `lib/return-cancel-completion.ts` called from the existing approvals PATCH route. Do not build the unimplemented `010` direct-cancel orchestrator as part of this fix.

## Implementation Design

### Phase A: Shared paid detection + completion helper

1. Export a single `isFullyPaidFinancialStatus(status)` (exact trimmed lower-case `paid`) shared with return-cancel routing intent from spec `010` / this spec.
2. Add `completeReturnCancelAfterFinanceApprove({ approval, order, location, reviewerId })` that returns a structured result:
   - `erpOutcome`: `credit_note` | `cancelled` | `already_done` | `failed`
   - `creditNoteName` / `invoiceName` when known
   - `shopifyOutcome`: `cancelled` | `already_cancelled` | `not_applicable` | `failed` | `skipped_vault`
   - sanitized `error` when incomplete
3. **Paid path**: `ensureErpnextCreditNote` (idempotent, including original status verify) → on success apply OS void via `ERP_CREDIT_NOTE_ORDER_PATCH`, append `erpReturnSalesInvoiceIds`, set cancel metadata, solve `OrderReturn`.
4. **Non-paid path**: `cancelErpnextSalesInvoice` (strict) → on success void OS (returned/voided consistent with unpaid cancel), solve `OrderReturn`.
5. **Shopify**: after ERP success, Cosmo cancels real Shopify IDs when Admin handle exists; Vault/`shouldBlockShopifyCancelInOs` → `skipped_vault` / `not_applicable` without failing completion.
6. Never call `cancelErpnextSalesInvoice` for paid; never call credit-note create for non-paid.

### Phase B: Harden outbound credit note (return + original Credit Note Issued)

1. Extend `lib/erpnext-sync.ts` with `ensureErpnextCreditNote` (or options on `createErpnextCreditNote`):
   - If `order.erpReturnSalesInvoiceIds` already has a name **and** original SI status is `Credit Note Issued` → return it.
   - Else list ERP return SIs with `return_against = original SI`; if submitted return exists, reuse it.
   - Else create via existing POST payload (`is_return: 1`, `return_against`, negative qtys) **with `update_outstanding_for_self: 0`** so paid originals flip off Paid.
   - After create/reuse: GET original SI; require status `Credit Note Issued`.
   - If original still `Paid` (or otherwise not credit-noted): run the reconcile/allocate step chosen in research (Payment Reconciliation against original, or tenant-proven API), then re-GET; if still not credit-noted → throw (approve stays pending).
2. Keep invoice-complete revert caller working (may keep non-fatal semantics there); return-cancel completion treats ERP failure **or** original-still-Paid as fatal to finalize.
3. Add Vitest/unit coverage around payload flags and “success only when original credit-noted” branching (mock ERP GETs).

### Phase C: Wire finance approve / reject

1. In `app/api/admin/approvals/[id]/route.ts` for `RETURN_CANCEL_APPROVAL` + approve:
   - **Do not** mark return solved / approval approved until ERP completion succeeds.
   - Load order + location with ERP instance; if missing SI identity / ERP config → `400`/`422` with clear message; leave pending.
   - Run completion helper **outside** the DB transaction.
   - On success: single transaction — approval `approved`, return `solved`/`cancel`, order void/returned + Return SI ids, audit.
   - On failure: leave approval `pending`, return `pending`, respond with safe error so finance can retry.
2. Reject path unchanged: reset return to pending; no ERP mutation; no credit note.
3. Update audit summaries (remove “process in ERPNext” acknowledgement-only wording).
4. Update `finance-approvals-panel` success copy and button labels to reflect auto credit-note vs cancel by payment status (server can expose `completionMode: credit_note | cancel` on approval list payload if useful).

### Phase D: Tests and UAT

1. Vitest matrix: paid → ensure CN called not cancel; unpaid/partial/refunded/null → cancel not CN; existing CN → no second create; missing SI → failed; Vault Shopify skipped.
2. Manual quickstart on Cosmo + Vault non-prod.
3. Confirm inbound credit-note webhook after OS-created CN does not double-break state (already voided + Return SI append is idempotent).

## Complexity Tracking

> No constitution violations requiring justification.
