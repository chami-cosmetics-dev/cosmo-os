# Research: Cosmo Return Cancel by Payment Status

**Feature**: `010-cosmo-return-cancel`  
**Date**: 2026-07-18

## 1. Server-authoritative policy

**Decision**: Resolve return-cancel behavior on the server from an explicit server-only deployment variant, normalized order financial status, and available integration capability. Unknown/missing deployment identity fails closed to finance approval.

**Rationale**: Current UI always sends `request_cancel`, and the API does not enforce a tenant/payment policy. Existing `isVaultOsDeployment()` derives security-relevant behavior from public branding and defaults missing branding to Cosmo, which could accidentally enable a Vault direct path. The client cannot be trusted to select the safe path.

**Alternatives considered**:

- Continue using `NEXT_PUBLIC_APP_NAME`: rejected because branding is public, string-based, and fails open.
- Infer Cosmo solely from Shopify token presence: rejected because credential presence is a capability check, not authoritative tenant identity.
- Let the client send `direct_cancel` versus `request_cancel`: rejected because manipulated clients could bypass finance.

## 2. Payment-status classification

**Decision**: Normalize with `trim().toLowerCase()` and require finance in Cosmo only when the value is exactly `paid`, as specified. Vault always requires finance. Add explicit tests for null, empty, pending, authorized, partially paid, partially refunded, refunded, voided, mixed case, and whitespace.

**Rationale**: `Order.financialStatus` is a nullable free-form Shopify string. The feature specification deliberately defines every non-`paid` status as direct-cancel eligible in Cosmo. Centralizing this exact rule avoids inconsistent route/UI interpretations.

**Alternatives considered**:

- Treat any status indicating prior money movement as paid: financially conservative, but contradicts the accepted specification.
- Base approval on payment gateway: rejected because this feature explicitly changes routing by payment status, not gateway.

**Risk retained**: Partially paid/refunded invoices can have ERP payment or credit-note dependencies. Such provider failures must remain visible and retryable rather than being reported as successful cancellation.

## 3. Durable distributed-operation state

**Decision**: Add per-return overall, Shopify, and ERP cancellation statuses plus timestamps and a sanitized error summary to `OrderReturn`.

**Rationale**: Shopify, ERP, and PostgreSQL cannot share one transaction. Existing fields only represent a pending/solved business action and cannot show which provider completed. Audit logs are not sufficient because they are not the returned-orders recovery state. Durable outcomes allow safe retry after a timeout, process crash, or one-provider failure.

**Alternatives considered**:

- No migration; log failures only: rejected because FR-008 requires visible, recoverable partial failure.
- Store all state in one JSON field: rejected because bounded scalar fields provide simpler conditional updates, filtering, and validation.
- Add a generic integration-job framework: rejected as unnecessary scope and contrary to simplicity.

## 4. Concurrency and action ownership

**Decision**: Claim a return with a conditional database update before external work. Approval creation and return transition for the finance path occur in one database transaction; notifications occur after commit. External calls never run inside the transaction.

**Rationale**: Current return update commits before approval creation, so a failure can leave “Cancel Pending” without an approval. It also relies on UI checks for solved/existing action state. A conditional claim prevents direct-cancel/request-cancel races and duplicate attempts.

**Alternatives considered**:

- Long transaction around Shopify and ERP calls: rejected because network calls can hold locks and exhaust database connections.
- UI-only button disabling: rejected because concurrent or manipulated requests bypass it.

## 5. Shopify cancellation semantics

**Decision**: Extend the Shopify helper to return structured outcomes: `cancelled`, `already_cancelled`, or `not_applicable`; throw a sanitized error for configuration/network/provider failures. On a retry response that may mean “already cancelled,” confirm Shopify order state before accepting idempotent success.

**Rationale**: The current helper returns `void` and treats every non-2xx as failure. Direct orchestration needs to distinguish completed work from retryable failure. ERP-native IDs prefixed `erp-` have no applicable Shopify operation.

**Alternatives considered**:

- Treat HTTP 422 as already cancelled unconditionally: rejected because 422 can represent other validation problems.
- Repeat POST on every retry: rejected because completed systems should be skipped.

## 6. ERP cancellation semantics

**Decision**: Reuse `cancelErpnextSalesInvoice()` with strict result handling. `cancelled` and `already_cancelled` are success. A definitive lookup proving no SI exists becomes `not_applicable`; missing credentials, ambiguous lookup, unexpected document state, or provider errors are failures.

**Rationale**: The existing ERP helper already distinguishes cancelled, already-cancelled, and not-found outcomes. Direct cancellation must not silently convert missing configuration into success.

**Alternatives considered**:

- Create a credit note for every non-`paid` status: rejected because this feature concerns cancellation and existing unpaid SI cancellation; paid orders remain finance-controlled.
- Accept every `not_found` result: rejected because a skipped lookup due to configuration is not proof that no invoice exists.

## 7. Completion ordering

**Decision**: Persist each external outcome as soon as it is known. Mark the OS order voided and return solved only when Shopify and ERP are each in a terminal success/not-applicable state. Retry skips completed systems and can repeat only local finalization.

**Rationale**: This prevents the UI from claiming success while an active ERP receivable or Shopify order remains. It also handles a database failure after both providers complete.

**Alternatives considered**:

- Copy generic order cancellation (Shopify fatal, ERP non-fatal, then OS success): rejected because it violates the feature’s partial-failure requirement.
- Mark OS voided first: rejected because it hides downstream provider failures and causes the current page-data sweep to auto-solve the return.

## 8. UI policy source

**Decision**: Add server-computed `cancelAction` and safe reason to returned-order page data. The UI renders this value, while the mutation endpoint independently recomputes it.

**Rationale**: Initial server data avoids another client fetch and follows the project’s page-data performance pattern. Recomputing on mutation prevents stale data or client manipulation from changing security behavior.

**Alternatives considered**:

- Client computes from `financialStatus` and app name: rejected due to stale state and fail-open tenant detection.
- New policy endpoint: rejected because page data already contains all returned-order UI data.

## 9. Validation and authorization

**Decision**: Preserve `returns.manage`, company/merchant scope, and CUID validation; use shared bounded trimmed-string validation for cancel remarks; add server guards for solved/voided/conflicting states.

**Rationale**: Current route correctly validates permission, ID, and ownership, but cancel remark uses a route-local schema and action-state protections are mostly client-side. All mutation rules must be enforced server-side.

**Alternatives considered**:

- Reuse client validation only: rejected by project security rules.

## 10. Test placement

**Decision**: Put pure policy and orchestration tests under `lib/**/*.test.ts`, inject Shopify/ERP adapters, and keep route/UI behavior in non-production UAT plus type/build checks.

**Rationale**: Current Vitest configuration only includes `lib/**/*.test.ts`. Extracting deterministic logic makes the highest-risk matrix, concurrency decisions, and partial outcomes testable without adding another test framework.

**Alternatives considered**:

- Add route integration framework now: rejected as broader than the feature.

## Resolved unknowns

All Technical Context unknowns are resolved. No `NEEDS CLARIFICATION` items remain.
