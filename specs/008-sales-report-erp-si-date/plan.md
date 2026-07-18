# Implementation Plan: Arrival-Time ERP SI for Finance-Approval Orders

**Branch**: `fix/finance-approval-fixes` | **Date**: 2026-07-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/008-sales-report-erp-si-date/spec.md`

## Summary

Create the existing submitted, stock-updating ERP Sales Invoice during Shopify intake for KOKO/bank orders, before finance approval. Keep fulfillment gated by the latest order-payment approval rather than by an ERP invoice placeholder. Approval requires the real SI and creates only its Payment Entry through the existing path; rejection requires a reason, strictly cancels the SI, voids the OS order, and remains pending if ERP cancellation fails. Sales dashboards, Daily Sales SMS, and report dumps remain unchanged because ERP is brought into alignment with the OS arrival-day sales logic.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20, TypeScript target ES2017

**Primary Dependencies**: Next.js 16.1.6 App Router, React 19.2.3, Prisma 6.19.2, Zod 4.3.6, Auth0 4.15, Shopify webhooks, ERPNext REST API

**Storage**: Neon PostgreSQL through Prisma (`DATABASE_URL` runtime pool and `DIRECT_URL` migrations); no schema change planned

**Testing**: Vitest 3.2.4 in Node environment (`lib/**/*.test.ts`), TypeScript check, ESLint, Next.js build, manual non-production ERP UAT

**Target Platform**: Vercel-hosted Node web application serving Cosmo OS and Vault OS; external ERPNext and Shopify integrations

**Project Type**: Single full-stack Next.js web application; the separate Expo rider app is unaffected but retains its constitution-required typecheck gate

**Performance Goals**: One SI creation attempt owner per order; no duplicate SI/PE under concurrent webhook/retry/approval activity; no new sales-report queries; fulfillment checks remain comparable to current query/action cost

**Constraints**: Asia/Colombo ERP posting time; per-location ERP credentials/company/warehouse; submitted SI must update stock at arrival; finance approval remains the fulfillment gate; external ERP calls can fail or time out; all security validation and authorization must be server-side

**Scale/Scope**: Shopify ingestion, SI retry, order-payment approval/rejection, ERP SI/PE lifecycle, fulfillment gates and two finance-review UIs across both tenants; reporting/SMS/dump implementations are regression-only

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### Pre-research gate

- **I. Multi-Database Migration Discipline — PASS**: Design reuses existing fields; no Prisma migration or database deployment is planned. If implementation discovers a required schema change, it must use `npm run db:migrate:create` and follow the all-database deployment rule only with explicit production approval.
- **II. Environment & Credential Isolation — PASS**: ERP operations continue through the order location's configured ERP instance/company/warehouse. No credentials are copied, hard-coded, or shared across Cosmo/Vault.
- **III. Test & Typecheck Gates — PASS**: Plan includes focused Vitest coverage, changed-file lint, TypeScript/build validation, and `npm run mobile:typecheck`.
- **IV. Production Deployment Safety — PASS**: Plan does not push, deploy, or mutate production. ERP UAT is explicitly non-production; any production action requires fresh user confirmation.
- **V. Simplicity & Scope Discipline — PASS**: Reuses current SI, PE, cancellation, approval, retry, and fulfillment mechanisms. No reporting rewrite, new integration layer, feature flag, or speculative schema is introduced.
- **External integration mapping — PASS**: Existing Shopify-to-ERP customer/item/warehouse/tax and gateway-to-payment mappings remain unchanged.

### Post-design gate

All gates remain **PASS** after Phase 1:

- `data-model.md` confirms no migration.
- The contract keeps server-side Zod/CUID validation, permission checks, company scope, and location scope.
- Strict cancellation extends an existing helper rather than adding a parallel ERP client.
- Legacy placeholder recognition is retained only where existing records require it.
- The validation guide covers Cosmo and Vault separately and prohibits production actions without confirmation.

## Project Structure

### Documentation (this feature)

```text
specs/008-sales-report-erp-si-date/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── finance-approval-erp-lifecycle.md
├── checklists/
│   └── requirements.md
└── tasks.md                         # Created later by /speckit-tasks
```

### Source Code (repository root)

```text
app/
└── api/admin/
    ├── approvals/
    │   └── [id]/route.ts
    └── orders/
        ├── [id]/
        │   ├── fulfillment/route.ts
        │   ├── invoice/route.ts
        │   └── retry-erp-sync/route.ts
        ├── bulk-dispatch/route.ts
        ├── bulk-delivery-complete/route.ts
        └── bulk-invoice-complete/route.ts

components/organisms/
├── finance-approvals-panel.tsx
├── order-invoice-view-modal.tsx
└── failed-erp-syncs-panel.tsx

lib/
├── order-webhook-process.ts
├── approval-workflow.ts
├── erpnext-sync.ts
├── failed-erp-sync-auto-retry.ts
├── failed-erp-pe-sync.ts
├── mark-order-delivered.ts
├── mark-order-invoice-complete.ts
├── validation.ts
├── audit-log.ts
├── page-data/
│   ├── orders.ts
│   └── dashboard-sales.ts           # Regression-only
├── daily-sales-sms.ts               # Regression-only
└── *.test.ts

prisma/
└── schema.prisma                     # Expected unchanged
```

**Structure Decision**: Keep the existing single Next.js application layout. Implement orchestration in current webhook/approval/retry modules, ERP behavior in `lib/erpnext-sync.ts`, shared gating in `lib/approval-workflow.ts`, and UX in the two existing finance review surfaces. Add focused `lib/**/*.test.ts` files because the current Vitest include pattern does not execute route-local test directories.

## Implementation Design

### Phase A: Decouple SI creation from finance approval

1. In `lib/order-webhook-process.ts`, for a new non-voided KOKO/bank order:
   - await idempotent creation/retrieval of `ORDER_PAYMENT_APPROVAL`;
   - stop assigning `"pending_approval"` to new orders;
   - allow the existing atomic `null → "pending"` SI claim and `syncOrderToERPNext` flow to run;
   - ensure claim/retry lease metadata prevents a terminated webhook from leaving a permanent `"pending"` state;
   - preserve current failure recording and the pending approval.
2. Do not modify the SI body: the existing submitted `docstatus: 1`, `update_stock: 1`, and `financialStatus === "paid"` PE condition already produce an unpaid, stock-updating SI.
3. Retain placeholder recognition for legacy rows.

### Phase B: Make pending SI failures recoverable before approval

1. In `lib/failed-erp-sync-auto-retry.ts`, remove the exclusion/wait behavior that suppresses failed SI sync while finance approval is pending.
2. In the manual retry endpoint, allow pending-approval orders to retry SI creation.
3. Treat `"pending_approval"` as a legacy missing-SI state eligible for retry.
4. Respect active leases and recover stale claims.
5. Update failed-sync UI wording so the legacy placeholder is not described as the new expected workflow.

### Phase C: Make approval state authoritative for fulfillment

1. Remove active fulfillment dependency on `erpnextInvoiceId === "pending_approval"`.
2. Gate all approval-required payment orders by latest approval state:
   - missing/pending/cancelled/rejected → blocked;
   - approved → proceed under existing fulfillment-stage rules.
3. Keep queue filters efficient through approval relations and ensure rejected orders are excluded by their `voided` financial state.
4. Apply the shared gate to direct and bulk fulfillment/invoice-complete paths that can bypass earlier guarded stages.
5. Apply the finance gate to all invoice-rendering/printing paths, not only `?print=1`.
6. Include the recorded rejection reason in the rejected block message.

### Phase D: Guard approval and create only the PE

1. Validate approval route IDs with `cuidSchema` and preserve `finance.approvals.manage`, company, and finance-location scope.
2. Serialize concurrent approve/reject decisions for a pending approval using a row lock or equivalent conditional claim.
3. Before approving `ORDER_PAYMENT_APPROVAL`, require a real SI:
   - `null`, `"pending"`, legacy `"pending_approval"`, or active SI retry → return retryable `ERP_SI_NOT_READY`;
   - do not create an SI in the approval request.
4. Preserve existing order paid/invoice-complete/stage transitions.
5. Run the existing finance-approved PE synchronization against the real SI only; preserve current PE failure recording/retry behavior.
6. Ensure concurrent/repeated approval cannot create duplicate PEs or SIs.

### Phase E: Strict rejection cleanup

1. Add shared rejection-reason limits and route-level conditional Zod validation: trimmed 5–500 characters for order-payment rejection.
2. Extend `cancelErpnextSalesInvoice` with strict, idempotent results:
   - submitted → cancel;
   - already cancelled → success;
   - missing configuration, known-invoice missing, unexpected state, or provider failure → throw.
3. Under the serialized pending-decision boundary:
   - cancel/confirm-cancelled SI first;
   - on success, atomically mark the order `voided` and approval `rejected` with reason/reviewer/time;
   - mark notifications read and notify requester only after commit.
4. On cancellation failure:
   - return safe retryable `ERP_SI_CANCEL_FAILED`;
   - leave approval and order unchanged/pending;
   - retain fulfillment block;
   - log/audit sanitized details.
5. Keep existing non-strict cancellation behavior for current Shopify/order-cancel callers unless regression tests justify a shared tightening.

### Phase F: Finance UI and visibility

1. In both finance approval surfaces:
   - show a required “Rejection reason” input for order-payment rejection;
   - enforce 5–500 characters for UX;
   - disable rejection until valid;
   - preserve text after retryable ERP failure;
   - show cancellation-in-progress and safe error feedback.
2. Display the rejection reason in order details/history.
3. Keep all client checks secondary to server validation.

### Phase G: Verification

1. Add focused Vitest coverage for webhook orchestration, retry eligibility/leases, approval-state gates, strict cancellation outcomes, decision ordering, route validation, and sales eligibility.
2. Run:
   - `npm test`
   - `npx tsc --noEmit`
   - `npm run lint`
   - `npm run mobile:typecheck`
   - `npm run build`
3. Perform non-production Cosmo and Vault UAT using `quickstart.md`.
4. Confirm dashboards, Daily Sales SMS, report dumps, COD, returns, Shopify cancellation, and other approval types remain unchanged.

## Key Risks and Mitigations

- **Webhook terminates during ERP creation**: use the existing local claim plus a bounded retry lease; recover by ERP order-reference lookup.
- **Approve/reject race**: serialize the pending approval decision and condition final updates on pending state.
- **ERP cancellation succeeds but response/DB commit fails**: strict cancellation is idempotent; retry recognizes `docstatus = 2`.
- **PE response ambiguity**: preserve outstanding-amount check and failed-PE retry/logging; serialized approval removes the main application-level duplicate race.
- **Rejected order still counted by OS**: rejection sets `financialStatus = "voided"` only after ERP cancellation succeeds.
- **Rejected order enters fulfillment queue**: approval-state action gate plus voided queue eligibility; add explicit regression coverage.
- **Legacy placeholders misclassified as real SI IDs**: retain placeholder normalizers and make legacy rows retryable.
- **Cross-tenant ERP mutation**: retain company/location authorization and select ERP configuration only from the order location.

## Complexity Tracking

No constitution violations require justification.
