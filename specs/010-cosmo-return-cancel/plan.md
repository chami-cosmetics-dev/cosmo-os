# Implementation Plan: Cosmo Return Cancel by Payment Status

**Branch**: `fix/finance-approval-fixes` | **Date**: 2026-07-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/010-cosmo-return-cancel/spec.md`

## Summary

Add a server-authoritative return-cancel policy: Vault always creates the existing finance approval; Cosmo requires approval only when normalized `financialStatus` is exactly `paid`, and directly cancels other returned orders in Shopify and ERP. Direct cancellation uses a durable per-return orchestration state, records each external outcome independently, is safe to retry after partial completion, and marks the OS order/return complete only after every applicable external cancellation succeeds or is already complete.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20, TypeScript target ES2017

**Primary Dependencies**: Next.js 16.1.6 App Router, React 19.2.3, Prisma 6.19.2, Zod 4.3.6, Auth0 4.15, Shopify Admin REST API, ERPNext REST API

**Storage**: Neon PostgreSQL through Prisma; one migration adds direct-cancel orchestration fields to `OrderReturn`

**Testing**: Vitest 3.2.4 in Node environment (`lib/**/*.test.ts`), TypeScript check, ESLint, Next.js build, manual non-production Cosmo/Vault UAT

**Target Platform**: Vercel-hosted Node web application serving separate Cosmo OS and Vault OS deployments

**Project Type**: Single full-stack Next.js web application; the Expo rider app is unaffected but retains its required typecheck gate

**Performance Goals**: Policy resolution is synchronous and query-free; one active cancel path per return; direct cancel completes within normal external-provider latency and avoids duplicate Shopify/ERP mutations on retry

**Constraints**: Security decisions must be server-side and fail closed; Vault has no Shopify Admin token; Shopify and ERP mutations are not transactionally atomic; external calls must not run inside database transactions; all route IDs and inputs require shared Zod validation; cross-tenant data and credentials remain isolated

**Scale/Scope**: Returned-orders list, one return-action endpoint, return-cancel approval creation, Shopify/ERP cancellation helpers, one Prisma model/migration, focused policy/orchestration tests; rearrange, store-return intake, generic order cancellation, and mobile behavior are regression-only

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### Pre-research gate

- **I. Multi-Database Migration Discipline — PASS WITH REQUIRED PROCEDURE**: Durable partial-failure recovery requires an `OrderReturn` schema change. Implementation must create it only with `npm run db:migrate:create`; deployment to Vault, Cosmo dev, and Cosmo production is required before completion, but production deployment requires fresh user confirmation.
- **II. Environment & Credential Isolation — PASS**: Direct cancellation requires an explicit server-side Cosmo deployment identity and existing location-scoped Shopify/ERP configuration. Unknown configuration falls back to finance approval; no secrets are copied or exposed.
- **III. Test & Typecheck Gates — PASS**: Plan includes focused Vitest coverage plus `npm test`, lint, TypeScript/build validation, and `npm run mobile:typecheck`.
- **IV. Production Deployment Safety — PASS**: Planning performs no push or deployment. Any production migration/deployment requires explicit in-the-moment confirmation.
- **V. Simplicity & Scope Discipline — PASS**: The design adds one focused policy helper and one orchestration helper, reuses existing integration clients and data, and avoids a generic workflow framework.
- **Security/validation — PASS**: The API recomputes tenant/payment policy, validates the CUID and bounded cancel remark, checks permission/company/merchant scope, and conditionally claims state to prevent conflicting actions.

### Post-design gate

All gates remain **PASS** after Phase 1:

- `data-model.md` limits migration scope to six nullable/defaulted orchestration fields on `OrderReturn` and defines migration/deployment safeguards.
- The API contract makes the server authoritative, rejects stale/solved/conflicting actions, and never trusts a client-selected direct/request path.
- Per-system outcomes make partial external completion durable and retryable without holding an open database transaction.
- Deployment identity is explicit and fail-closed; the UI consumes server-computed policy rather than inferring tenant security rules.
- Quickstart validates both deployments and prohibits production integration tests without explicit approval.

## Project Structure

### Documentation (this feature)

```text
specs/010-cosmo-return-cancel/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── return-cancel-workflow.md
├── checklists/
│   └── requirements.md
└── tasks.md                         # Created later by /speckit-tasks
```

### Source Code (repository root)

```text
app/api/admin/returns/[id]/route.ts

components/organisms/
└── returned-orders-panel.tsx

lib/
├── return-cancel-policy.ts          # New pure policy and fail-closed deployment resolver
├── return-cancel-orchestrator.ts    # New direct-cancel state machine
├── return-cancel-policy.test.ts
├── return-cancel-orchestrator.test.ts
├── approval-workflow.ts
├── shopify-admin.ts
├── erpnext-sync.ts
├── audit-log.ts
└── page-data/
    └── order-returns.ts

prisma/
├── schema.prisma
└── migrations/
    └── <timestamp>_add_return_cancel_sync_state/
        └── migration.sql

.env.vault.example
.env.cosmo-dev.example
.env.cosmo-prod.example
```

**Structure Decision**: Keep the existing single Next.js application. Extract policy and orchestration into focused `lib` modules so Vitest can exercise the financial-status matrix, deployment fail-closed behavior, idempotency, and partial failures. Keep route authorization/validation and UI rendering in their existing locations.

## Implementation Design

### Phase A: Centralize fail-closed cancel policy

1. Add a server-only deployment resolver with explicit `OS_VARIANT=cosmo|vault`; missing/invalid values resolve to `unknown`, never to Cosmo.
2. Define `resolveReturnCancelPolicy({ variant, financialStatus, hasShopifyCapability })`:
   - Vault or unknown → `request_finance_approval`;
   - Cosmo + normalized exact `paid` → `request_finance_approval`;
   - Cosmo + non-`paid` + required integration capability → `direct_cancel`;
   - Cosmo + non-`paid` but missing capability → `request_finance_approval` with a safe reason.
3. Keep the specification’s exact-paid rule for `null`, pending, authorized, partial/refunded, and other statuses; add explicit matrix tests so this business choice cannot drift.
4. Add `OS_VARIANT` to example environment files. Do not expose credentials or rely on `NEXT_PUBLIC_APP_NAME` for the security decision.

### Phase B: Persist direct-cancel progress

1. Add nullable/defaulted `OrderReturn` fields from `data-model.md`.
2. Create the migration only through `npm run db:migrate:create`; inspect generated SQL before any non-production deploy.
3. Keep `actionType="cancel"` and `actionStatus="pending"` during processing/failure; set solved only after all applicable systems complete.
4. Expose the computed action and persisted sync statuses/errors in server-fetched returned-order page data.

### Phase C: Harden action claiming and approval creation

1. Extend the action schema with a neutral cancel intent (for example `cancel`) while retaining existing action names for compatibility; clients do not choose the final policy.
2. On every cancel submission, reload and recompute policy server-side from deployment, integration capability, and current financial status.
3. Reject solved/voided returns, existing non-retryable actions, conflicting pending approvals, wrong company/merchant, invalid CUID, missing permission, and cancel remarks outside shared limits.
4. Claim the return with a conditional update (`pending`, expected action state) so only one direct/request path wins.
5. Refactor return-cancel approval creation to accept the current transaction client: return state and approval row commit atomically; send notifications after commit.

### Phase D: Implement idempotent direct cancellation

1. After claiming, invoke applicable external systems outside the database transaction.
2. Shopify:
   - ERP-native/non-real Shopify IDs → `not_applicable`;
   - successful cancel → `cancelled`;
   - confirmed prior cancellation → `already_cancelled`;
   - missing token/store handle/provider failure → `failed`.
3. ERP:
   - submitted SI cancelled → `cancelled`;
   - already cancelled → `already_cancelled`;
   - definitive no-invoice result → `not_applicable`;
   - missing configuration, ambiguous lookup, or provider failure → `failed`.
4. Persist each result immediately. On retry, call only systems not already `cancelled`, `already_cancelled`, or `not_applicable`.
5. When all applicable systems succeed, atomically mark `Order.financialStatus="voided"`, cancellation metadata, `OrderReturn.actionStatus="solved"`, and overall sync `completed`; write `returned_order_cancelled_directly`.
6. On any failure, leave overall state `failed`, keep the return pending, return a safe retryable error with per-system statuses, and audit sanitized details. Never claim full success.

### Phase E: Update returned-orders UX

1. Page data returns `cancelAction: direct_cancel | request_cancel | none`, a safe reason, and direct-cancel progress.
2. Render **Cancel** only for eligible unpaid Cosmo returns and **Request Cancel** for paid Cosmo and all Vault returns.
3. Preserve required cancel remark and add confirmation that direct cancel affects Cosmo OS, Shopify, and ERP.
4. Display processing/partial-failure states and a **Retry Cancel** action that resumes only failed/incomplete systems.
5. Keep rearrange, finance-reverted returns, and existing merchant visibility unchanged.

### Phase F: Verification

1. Add pure policy matrix tests and orchestrator tests with injected Shopify/ERP adapters.
2. Cover authorization/state guards, atomic path claim, duplicate approval prevention, provider combinations, already-cancelled retries, and OS finalization failure.
3. Run:
   - `npm test`
   - `npx tsc --noEmit`
   - `npm run lint`
   - `npm run mobile:typecheck`
   - `npm run build`
4. Perform non-production Cosmo and Vault UAT using `quickstart.md`.
5. Verify rearrange, return-to-store marking, paid finance approval, and generic order cancellation as regressions.

## Key Risks and Mitigations

- **Partially paid/refunded classified as non-paid**: this follows the approved spec; explicit matrix tests and auditable status capture prevent accidental reinterpretation. Provider rejection remains visible/retryable.
- **One external system succeeds before another fails**: durable per-system outcomes and idempotent retry prevent false success and unnecessary repeated cancellation.
- **Direct cancel races finance request**: conditional state claim plus atomic approval creation allows only one path.
- **Vault misidentified as Cosmo**: explicit server-only variant and fail-closed unknown behavior; direct action additionally requires integration capability.
- **Shopify retry returns an already-cancelled error**: confirm current Shopify state and normalize confirmed cancellation as success.
- **ERP has no matching SI**: only a definitive lookup may become `not_applicable`; configuration or ambiguous lookup failures remain failures.
- **OS finalization fails after integrations succeed**: persisted per-system success allows retry to skip external calls and repeat only local finalization.
- **Migration drift**: use the constitution-mandated migration command and deploy to each database only under the required safety approvals.

## Complexity Tracking

No constitution violations require justification.
