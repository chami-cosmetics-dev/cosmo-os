# Quickstart: Delivery & CC Checkout Invoice Complete

**Feature**: `011-delivery-cc-invoice-complete`  
**Date**: 2026-07-18

Validation guide for implementation. Use non-production Vault/Cosmo environments and ERP test records.

## Prerequisites

- Install dependencies: `npm install`
- Select a non-production environment, for example `npm run env:use cosmo-dev`
- ERPNext credentials and company/location MOP configuration for:
  - Delivery collection modes under test
  - `webxpayMop` for CC Checkout
- Finance user with `finance.approvals.manage` and access to the test location
- Fulfillment user with permissions for sample/print/dispatch/delivery
- Test orders with linked submitted ERP Sales Invoices

Do not run a production deployment or switch to production credentials for this guide.

## 1. Delivery payment approval creates PE and completes OS invoice

1. Use a delivered COD/card-on-delivery order with a pending delivery-payment approval and unpaid linked SI.
2. Approve the delivery payment.
3. Confirm ERP has a submitted PE and SI outstanding is zero.
4. Confirm OS shows:
   - paid financial status;
   - `invoiceCompleteAt` populated;
   - terminal invoice-complete stage;
   - no duplicate manual invoice-complete queue item.

**Expected**: ERP settlement and OS invoice completion succeed as one business outcome.

## 2. Delivery approval against an already-paid SI

1. Use an order whose linked submitted SI already has zero outstanding.
2. Approve its pending delivery payment.
3. Confirm no additional PE was created.
4. Confirm OS invoice completion succeeds.

**Expected**: `already_paid` is idempotent success.

## 3. Delivery approval ERP failure

1. In a non-production location, test with a safely invalid/missing required MOP or an SI that cannot be resolved.
2. Attempt approval.
3. Confirm the UI/API reports ERP settlement failure.
4. Confirm the order is not falsely marked paid/invoice complete from the failed attempt.
5. Confirm PE failure details are visible and retryable after fixing configuration.

**Expected**: No silent or partial clean success.

## 4. CC Checkout completes financially at order received

1. Submit/process a paid Shopify test order with gateway `CC CHECKOUT`.
2. Confirm the OS order is created at `order_received`.
3. Confirm the linked ERP SI exists and a WebXPay-mode PE is submitted, or ERP reports the SI already paid.
4. Confirm OS has paid status and `invoiceCompleteAt`.
5. Confirm physical stage remains nonterminal and fulfillment is not marked fulfilled.

Repeat with representative stored variants (`cc checkout`, `cc_checkout`, or `cc-checkout`) where fixtures permit.

**Expected**: Payment/invoice completion happens at ingestion without terminating fulfillment.

## 5. CC Checkout continues fulfillment

1. Open the early-completed CC Checkout order in order-received/sample work.
2. Advance it through at least the next two applicable stages (for example sample/print and ready-to-dispatch).
3. Continue through dispatch and delivery if the test environment permits.
4. Confirm it never appears in the manual invoice-complete queue and no second PE is created.

**Expected**: `invoiceCompleteAt` does not block the physical pipeline.

## 6. CC Checkout PE failure and retry

1. Process a paid CC Checkout test order with safely missing/invalid WebXPay MOP configuration.
2. Confirm the PE attempt records a visible failure instead of silently skipping.
3. Confirm the order remains available for physical/operational handling according to the implemented failure policy.
4. Open Failed ERP Syncs → Payment Entry and locate the nonterminal order.
5. Correct configuration or select the valid MOP, then retry.
6. Confirm PE creation/already-paid success, paid/invoice-complete markers, cleared failure fields, and preserved physical stage.

**Expected**: Early-stage PE failures use the existing operator recovery surface.

## 7. Non-CC regression controls

1. Process a normal COD/card-on-delivery order at order received.
2. Confirm it is not auto–invoice-completed.
3. Process KOKO/bank/WebXPay orders through their existing approval/prepaid paths.
4. Confirm their timing and MOP mapping remain unchanged.

## 8. Concurrency/idempotency

1. Submit two near-simultaneous delivery approval requests for one pending approval in a test environment.
2. Confirm at most one approval transition and no duplicate PE.
3. Replay the same paid CC Checkout webhook.
4. Confirm the existing order/SI is reused, no duplicate PE is created, and completion timestamps do not regress.

## Automated verification

Add focused Vitest coverage for:
- Canonical CC Checkout classification and WebXPay MOP mapping.
- CC PE outcomes: `created`, `already_paid`, missing MOP/SI, and ERP error.
- Delivery approval success/failure state boundary and concurrent-review guard.
- Early-completed CC eligibility in physical queues.
- Exclusion from manual invoice-complete queue.
- PE failure list/retry for nonterminal CC orders.
- Delivery closeout without a second PE.

Run:

```bash
npm test
npm run lint
npm run mobile:typecheck
```

If implementation changes TypeScript paths not covered by unit tests, also run:

```bash
npm run build
```

## References

- [Specification](./spec.md)
- [Research](./research.md)
- [Data model](./data-model.md)
- [Behavioral contract](./contracts/payment-invoice-complete.md)
