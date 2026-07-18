# Quickstart: Validate Cosmo Return Cancel by Payment Status

**Feature**: `010-cosmo-return-cancel`

This guide validates the completed feature in non-production Cosmo and Vault environments. Do not run cancellation scenarios against production without explicit approval.

## Prerequisites

- Dependencies installed.
- Prisma client generated.
- Feature migration deployed to the selected non-production target.
- Test users:
  - merchant with `returns.manage`;
  - finance user with existing return-cancel approval permission;
  - unauthorized control user.
- Test orders/returns that may safely be cancelled:
  - Cosmo unpaid with real Shopify order and ERP SI;
  - Cosmo paid;
  - Cosmo non-paid ERP-native order (`erp-*`);
  - Vault paid and unpaid;
  - Cosmo direct-cancel partial-failure fixtures/mocks.
- `OS_VARIANT=cosmo` in Cosmo dev and `OS_VARIANT=vault` in Vault.

See [data-model.md](data-model.md) and [return-cancel-workflow.md](contracts/return-cancel-workflow.md).

## 1. Static and automated checks

From repository root:

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run mobile:typecheck
npm run build
```

Expected:

- policy tests cover the full deployment/payment matrix;
- orchestrator tests cover success, partial failure, retry, and already-cancelled outcomes;
- all commands pass;
- mobile has no changes but its constitutional gate remains green.

## 2. Migration verification

Create migrations only through:

```powershell
npm run db:migrate:create
```

Before deploying, inspect the generated migration and confirm it only adds nullable/defaulted direct-cancel fields to `OrderReturn`.

Deploy to a selected non-production target:

```powershell
npm run db:deploy:cosmo-dev
```

For Vault non-production verification:

```powershell
npm run db:deploy:vault
```

Do not run `db:deploy:cosmo-prod` or `db:deploy:all` without explicit in-the-moment user confirmation.

## 3. Cosmo unpaid direct cancellation

1. Start Cosmo dev with its correct environment.
2. Sign in as an authorized merchant.
3. Open a pending returned order with `financialStatus` not equal to `paid`.
4. Confirm the action label is **Cancel**, not **Request Cancel**.
5. Submit a non-empty cancel remark and confirm.
6. Verify:
   - no `return_cancel` approval was created;
   - Shopify is cancelled, or provider status is `not_applicable` for ERP-native orders;
   - ERP SI is cancelled/already cancelled, or a definitive no-SI case is `not_applicable`;
   - OS order financial status is `voided`;
   - return is `solved`;
   - direct/provider statuses show completion;
   - audit identifies a direct cancellation.

Expected: all applicable systems complete and UI reports success once.

## 4. Cosmo paid finance path

1. Open a pending Cosmo return whose normalized financial status is `paid`.
2. Confirm the action label is **Request Cancel**.
3. Submit a cancel remark.
4. Verify:
   - one pending `return_cancel` approval exists;
   - return remains pending;
   - direct-cancel fields remain null;
   - Shopify and ERP were not called by the merchant action.
5. Process the approval using the existing finance workflow.

Expected: behavior matches the existing paid return-cancel approval process.

## 5. Vault invariant

Repeat with at least three paid and three unpaid Vault returns.

Verify for every return:

- UI shows **Request Cancel**;
- one finance approval is created/reused;
- direct cancellation is never offered or executed;
- direct-cancel fields remain null.

Then set `OS_VARIANT` missing/invalid in a disposable local run and verify behavior still fails closed to **Request Cancel**.

## 6. Payment-status matrix

In Cosmo dev, validate server-computed policy for:

- `paid`, `PAID`, and whitespace-padded paid → finance approval;
- null, empty, `pending`, `authorized`, `partially_paid`, `partially_refunded`, `refunded`, and any other non-paid status → direct cancel when capability exists;
- non-paid with missing direct capability → finance approval with safe reason.

Expected: route behavior matches page data even if a request is manually altered.

## 7. Partial failure and retry

### Shopify succeeds, ERP fails

1. Use a safe mock/non-production failure condition for ERP.
2. Submit direct cancel.
3. Verify HTTP failure, return remains pending, Shopify status is terminal-success, ERP status is failed, and no false full-success message appears.
4. Restore ERP and retry.
5. Verify Shopify is not called again; ERP completes; OS/return finalization completes.

### ERP succeeds, Shopify fails

Repeat inversely and verify retry skips ERP.

### Local finalization fails after providers complete

Simulate through an orchestrator unit test. Verify retry performs local finalization only and does not repeat external cancellation.

## 8. Concurrency and idempotency

1. Submit two cancel requests concurrently for the same eligible return.
2. Verify one claims the action and the other receives a conflict/in-progress response.
3. For paid/Vault, verify only one pending approval exists.
4. Retry when Shopify/ERP is already cancelled.

Expected: no duplicate provider mutation or approval; confirmed already-cancelled outcomes complete successfully.

## 9. Security and validation

Verify:

- missing cancel remark → `400`;
- malformed return ID → `400`;
- wrong-company return → `404`;
- unauthorized user → `403`;
- merchant outside assigned scope → `404`;
- solved/voided return → conflict/validation error;
- pending approval blocks direct cancel;
- manipulated client action cannot force unpaid Vault or paid Cosmo into direct cancel;
- provider errors returned to the browser contain no token, credential, or raw sensitive response.

## 10. Regression checks

Confirm unchanged behavior for:

- mark returned to store;
- rearrange;
- bank-transfer rearrange approval;
- finance-reverted return actions;
- finance approve/reject for existing return cancels;
- generic order cancellation outside returned-orders;
- returned-orders list filters/counts/merchant visibility.

## Completion evidence

Record:

- automated command results;
- tested environment and `OS_VARIANT` (never secret values);
- sample return/order IDs;
- policy decision per scenario;
- provider outcomes;
- approval count;
- screenshots or audit references for completed and partial-failure states.
