# Data Model: Cosmo Return Cancel by Payment Status

**Feature**: `010-cosmo-return-cancel`  
**Date**: 2026-07-18

## Overview

The existing `Order`, `OrderReturn`, and `ApprovalRequest` relationships remain authoritative. This feature adds durable direct-cancellation orchestration state to `OrderReturn`; it does not add a generic job table or alter finance approval types.

## Existing entities

### Order

Relevant existing fields:

| Field | Type | Role |
|---|---|---|
| `id` | CUID | Internal order identity |
| `companyId` | CUID | Tenant boundary |
| `companyLocationId` | CUID | Shopify/ERP configuration scope |
| `shopifyOrderId` | String | Shopify identity; `erp-*` means Shopify is not applicable |
| `erpnextInvoiceId` | String? | Known ERP Sales Invoice |
| `financialStatus` | String? | Exact normalized `paid` routes Cosmo to finance; other values route to direct cancel |
| `fulfillmentStage` | Enum | Existing order lifecycle |
| `cancelledAt` | DateTime? | OS cancellation time |
| `cancelledById` | CUID? | Merchant who completed/directly initiated cancellation |
| `cancelReason` | String? | Cancellation remark |

No new `Order` fields are required.

### ApprovalRequest

Existing `return_cancel` records remain the finance path for:

- every Vault return cancel;
- Cosmo returns whose normalized financial status is exactly `paid`;
- fail-closed cases where direct-cancel deployment/capability cannot be established.

The existing pending-approval uniqueness constraint remains in force. Approval creation must move into the same transaction as the return action claim, but no schema change is required.

## Changed entity: OrderReturn

Existing lifecycle fields remain:

| Field | Meaning |
|---|---|
| `actionStatus` | `pending` until cancellation fully completes; `solved` after completion |
| `actionType` | `cancel` for both finance and direct cancellation |
| `cancelRemark` | Required merchant reason |
| `cancelRequestedAt` | Time cancel intent was first accepted |
| `actionDate` / `actionById` | Latest action metadata |

### New fields

Names are concrete planning targets; final migration should preserve these semantics.

| Field | Prisma type | Default | Meaning |
|---|---|---|---|
| `directCancelStatus` | `String?` | `null` | Overall direct flow: `processing`, `failed`, or `completed`; null for non-direct flows |
| `shopifyCancelStatus` | `String?` | `null` | `pending`, `cancelled`, `already_cancelled`, `not_applicable`, or `failed` |
| `erpCancelStatus` | `String?` | `null` | `pending`, `cancelled`, `already_cancelled`, `not_applicable`, or `failed` |
| `directCancelError` | `String?` | `null` | Sanitized latest error summary, bounded by application validation |
| `directCancelStartedAt` | `DateTime?` | `null` | First successful direct-action claim |
| `directCancelCompletedAt` | `DateTime?` | `null` | Time all provider and OS finalization work completed |

No separate retry count is needed initially; audit events and timestamps provide attempt history without adding unused fields.

### Validation rules

- New status fields accept only the documented values through application code.
- `directCancelError` must contain no credentials or raw unbounded provider response; cap at 2,000 characters.
- `cancelRemark` uses the shared trimmed-string limit (required, maximum 5,000 characters to retain existing behavior).
- A return with `directCancelStatus != null` must have `actionType="cancel"`.
- `directCancelStatus="completed"` requires:
  - `actionStatus="solved"`;
  - both provider statuses terminal-success (`cancelled`, `already_cancelled`, or `not_applicable`);
  - `directCancelCompletedAt` set;
  - linked `Order.financialStatus="voided"`.
- `directCancelStatus="failed"` requires at least one provider status `failed` or a recorded local-finalization error.
- Finance-request flows leave all direct-cancel fields null.

## Relationships

```text
Company
  └── Order
        ├── OrderReturn (latest merchant return follow-up)
        │     └── ApprovalRequest [finance path only]
        └── CompanyLocation (Shopify + ERP integration scope)
```

- One order may have multiple historical returns; the UI currently uses the newest return per order.
- A direct-cancel return does not create an `ApprovalRequest`.
- A finance-path return has one effective pending `return_cancel` approval, protected by the existing partial unique index.

## State transitions

### Policy decision

```text
pending return + cancel intent
  ├── Vault / unknown / capability unavailable ──> finance request
  ├── Cosmo + exact paid ───────────────────────> finance request
  └── Cosmo + non-paid + capability available ─> direct processing
```

### Direct cancellation

```text
unclaimed
  └── conditional claim
        actionType=cancel
        actionStatus=pending
        directCancelStatus=processing
        provider statuses=pending/not_applicable

processing
  ├── provider failure ──> failed (return remains pending)
  └── all terminal success
        └── local finalization
              Order.financialStatus=voided
              Order.cancelled*=...
              OrderReturn.actionStatus=solved
              directCancelStatus=completed

failed
  └── retry claim ──> processing
        (skip providers already terminal-success)
```

### Finance request

```text
unclaimed
  └── atomic return update + pending ApprovalRequest
        actionType=cancel
        actionStatus=pending
        directCancelStatus=null

pending approval
  ├── rejected ──> existing reset/retry behavior
  └── approved ──> existing solved/cancelled behavior
```

## Concurrency invariants

1. A conditional update may claim a return only when it is pending and has no conflicting action, or when retrying its own failed direct flow.
2. A direct claim fails if a pending `return_cancel` approval exists.
3. Finance-path transition and approval insertion commit atomically.
4. External calls occur only after the direct claim commits.
5. Provider results are persisted independently; retry never repeats a terminal-success provider operation.
6. Final OS mutation is conditional on the direct claim still being current and all provider states being terminal-success.

## Migration plan

1. Update `prisma/schema.prisma` with the six `OrderReturn` fields.
2. Run only `npm run db:migrate:create` to create the migration.
3. Review SQL: nullable columns only; no destructive backfill or table rewrite.
4. Generate Prisma client and run tests/build.
5. Deploy to Vault and Cosmo dev for UAT using the repository scripts.
6. Deploy to Cosmo production and complete all-database deployment only after explicit in-the-moment user confirmation, per constitution.

Existing rows require no backfill: null direct-cancel fields mean legacy/finance workflow.
