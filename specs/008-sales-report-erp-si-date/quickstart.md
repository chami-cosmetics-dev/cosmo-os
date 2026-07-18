# Quickstart Validation: Arrival-Time ERP SI for Finance-Approval Orders

**Feature**: `008-sales-report-erp-si-date`

This guide validates the completed feature without production deployment or production credentials.

## Prerequisites

- A non-production Cosmo or Vault environment configured with:
  - Shopify webhook ingestion;
  - a test ERPNext company and warehouse;
  - KOKO and/or bank-transfer payment mapping;
  - a user with `finance.approvals.manage`;
  - at least one test item with known ERP stock.
- Use the environment-specific configuration for only the tenant under test.
- Do not run production deploy, database deploy, or push to `main` without explicit confirmation.

See:

- [Data model](data-model.md)
- [Finance approval/ERP lifecycle contract](contracts/finance-approval-erp-lifecycle.md)

## 1. Static and Automated Validation

From the repository root:

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run mobile:typecheck
npm run build
```

Expected:

- all Vitest tests pass;
- TypeScript reports no errors;
- lint is clean for changed files;
- the unaffected rider app typecheck passes;
- the production build completes.

If implementation adds a Prisma migration unexpectedly:

```powershell
npm run db:migrate:create
npm run db:generate
```

Do **not** use `prisma migrate dev` or `npm run db:push` against shared databases. Do not run `db:deploy:all` or any production deployment without explicit user confirmation.

## 2. Arrival-Time SI Scenario

1. Record current ERP stock for the test item.
2. Submit a new KOKO/bank Shopify order.
3. Open the order and finance approvals in the OS.
4. Open the linked ERP Sales Invoice.

Expected:

- one pending order-payment approval exists;
- the order has a real ERP SI ID (not `pending_approval`);
- the SI is submitted and dated when the order was processed;
- the SI is unpaid/outstanding;
- no Payment Entry exists;
- ERP stock decreased by the invoiced quantity;
- duplicate webhook delivery does not create another approval or SI.

## 3. Pending Fulfillment Gate

Before finance approval:

1. Check print, dispatch, delivery, and other fulfillment queues.
2. Try individual invoice rendering/printing.
3. Try individual fulfillment/dispatch.
4. Try bulk print/dispatch where available.

Expected:

- the order is absent from fulfillment queues;
- every direct/bulk action is blocked with a finance-approval-pending message;
- the real SI link remains visible for finance review;
- SI existence alone does not unlock fulfillment.

## 4. Approval Scenario

1. Approve the pending request.
2. Inspect the original ERP SI.
3. Inspect the order's OS status and fulfillment stage.

Expected:

- one Payment Entry is applied to the existing SI;
- SI outstanding amount becomes zero;
- no second SI is created;
- order becomes paid/invoice-complete according to the existing stage rules;
- fulfillment becomes available;
- a repeated/concurrent approve attempt does not create another PE.

## 5. Rejection Scenario

Use a fresh finance-approval order with an unpaid submitted SI.

1. Attempt rejection with blank text, fewer than 5 characters, and more than 500 characters.
2. Reject with a valid reason.
3. Inspect OS order/approval state, ERP SI, and ERP stock.
4. Try fulfillment.

Expected:

- invalid reasons are rejected server-side and in the UI;
- valid reason is recorded and visible;
- SI becomes cancelled (`docstatus = 2`);
- stock is restored;
- OS order becomes voided;
- approval becomes rejected;
- order remains blocked/excluded from fulfillment;
- retrying the same rejection does not cancel twice.

## 6. ERP Cancellation Failure Scenario

In a non-production environment, safely simulate ERP cancellation failure (for example, use a test stub or temporarily deny cancellation without exposing credentials).

Expected:

- API returns retryable `ERP_SI_CANCEL_FAILED`;
- approval remains pending;
- order does not become voided or rejected;
- fulfillment remains blocked;
- no requester rejection notification is sent;
- UI preserves the entered reason and allows retry;
- sanitized failure appears in server logs/audit history.

Restore ERP access, retry rejection, and confirm the normal rejection outcome.

## 7. SI Creation Failure and Retry Scenario

Use a fresh test order and safely simulate SI creation failure.

Expected at arrival:

- pending finance approval still exists;
- no real SI exists;
- fulfillment remains blocked;
- failure appears in failed ERP sync tooling and is scheduled/retryable.

Attempt finance approval before SI recovery.

Expected:

- approval returns retryable `ERP_SI_NOT_READY`;
- approval remains pending;
- order is not marked paid/invoice-complete;
- fulfillment remains blocked;
- approval does not create a late SI.

Restore ERP access and retry SI sync.

Expected:

- retry creates one submitted unpaid SI;
- approval remains pending;
- subsequent approval applies the PE to that SI.

## 8. Sales Reconciliation

For a test day containing:

- one normal/COD order;
- one approved KOKO/bank order;
- one rejected KOKO/bank order;
- optionally one pending KOKO/bank order with a valid unpaid SI.

Compare:

1. OS dashboard daily total/count;
2. Daily Sales SMS preview;
3. OS report dump;
4. ERP Sales Invoice report for the same company/date.

Expected:

- active pending/approved arrival-day sales appear in OS and ERP;
- rejected/voided order is excluded from recalculated OS totals and its cancelled SI is excluded by ERP;
- totals reconcile within one currency unit;
- SMS formatting, logging, resend, and dump structure are unchanged.

Previously sent SMS and downloaded dump files are snapshots and are not expected to change retroactively.

## 9. Regression Matrix

Validate at least:

- COD/non-approval order creates its SI exactly as before;
- Shopify cancellation of an unpaid finance SI cancels once;
- already-cancelled SI is handled idempotently;
- returns and credit-note flows still work;
- payment-method-change and other approval types keep their current behavior;
- failed PE logging/retry still works;
- legacy `pending_approval` record can be retried into a real SI;
- plain invoice rendering cannot bypass the finance gate.

## 10. Both-Tenant Verification

Repeat representative arrival → approval and arrival → rejection scenarios once for:

- Cosmo OS with its own ERP company/location;
- Vault OS with its own ERP company/location.

Expected:

- each tenant uses only its own ERP credentials, company, warehouse, stock, approvals, and reports;
- no cross-tenant order, SI, PE, or audit data appears.
