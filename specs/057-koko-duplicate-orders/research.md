# Research: KOKO Duplicate Order Minimization

**Feature**: `057-koko-duplicate-orders`  
**Date**: 2026-09-18

## R1 — When finance approval is created for ERP KOKO

**Decision**: For **ERP-sourced** orders whose payment primary is KOKO, **do not** call `createOrGetOrderPaymentApproval` on ingest until the merchant confirms `kokoLinkGeneratedAt`. Bank / Mintpay / other approval gateways keep today’s immediate approval. Shopify-originated KOKO (if any) stays on current immediate-approval path unless later scoped in.

**Rationale**: Spec FR-001 / FR-013. Today `lib/erp-sales-invoice-ingest.ts` creates pending `order_payment_approval` as soon as unpaid KOKO/bank lands; finance sees it immediately and `FINANCE_PENDING_FULFILLMENT_EXCLUSION` hides those orders from normal queues (with a special split-payment sample opt-in). User needs merchant link-time capture **before** finance queue.

**Alternatives considered**:
- Create approval immediately but hide until confirmed (`status: draft`) — rejected; pollutes `ApprovalRequest` status enum and notification paths.
- Hold all bank+KOKO — rejected; FR-011 says non-KOKO flows unchanged.
- New fulfillment stage enum value — rejected; reuse sample / order_received handling (simpler).

## R2 — Where merchants enter link generated time

**Decision**: Confirm on sample / free-issue (and `order_received` when still there) via a dedicated API (`POST/PATCH …/koko-link-time`) and UI field on sample panel / order detail. Confirming sets `kokoLinkGeneratedAt` (+ confirmedBy/At) and **then** creates `order_payment_approval`. Editing time allowed until that approval is **approved**. Block `advance_to_print` (and later stages) for ERP KOKO until link time confirmed.

**Rationale**: Spec US1 / FR-002; aligns with “sample adding stage” without inventing sample lines. Existing split-payment sample path already touches this queue for ERP KOKO/bank.

**Alternatives considered**:
- Force empty sample lines — rejected.
- Only allow edit on finance screen — rejected; merchants own portal time entry.

## R3 — Detecting “KOKO” payment

**Decision**: Treat as KOKO when `paymentGatewayPrimary` (preferred) or names contain `"koko"` case-insensitive — same spirit as `isOrderPaymentRequiresApproval` / split helpers. Defer-approval gate applies only when primary (or sole gateway) is KOKO, not bank-only. Split KOKO+bank: still require link time before creating/showing the payment approval that carries the KOKO leg (same confirm gate).

**Rationale**: Matches existing gateway string matching; avoids false positives from checkout method lists when primary is set.

**Alternatives considered**: Hard-coded ERP mode-of-payment codes only — brittle across companies.

## R4 — Duplicate grouping identity

**Decision**: Compute groups at finance list/read time (and for merchant notice). Key = `companyId` + `canonicalPhoneForErpCustomerId(customerPhone)` + **item fingerprint** (sorted multiset of `sku|qty` from `OrderLineItem`, prefer product SKU / ERP item code). Lookback default **30 days** from newest candidate’s `createdAt` (constant `KOKO_DUPLICATE_LOOKBACK_DAYS`). Include members with pending **or** approved `order_payment_approval` (and orders awaiting link-time that already have confirmed time / pending approval). Exclude voided/cancelled orders from “actionable” group members but may show approved sibling for cancel context.

**Rationale**: Spec FR-004–006; mirrors `054-abandoned-cart-dedupe` fingerprint approach without requiring persisted group ids for v1. Phone helper already used across Cosmo.

**Alternatives considered**:
- Persist `exactDuplicateGroupId` on Order — optional later if list perf suffers; YAGNI for v1.
- Partial SKU overlap groups — rejected (spec: identical sets only).
- Unlimited lookback — rejected; default 30 days per assumptions.

## R5 — Soft duplicate notice (not pre-ERP)

**Decision**: On link-time confirm UI/API GET context, return sibling candidates (same phone, lookback, especially matching fingerprint). Soft notice only; confirm still allowed. **Out of scope**: ERP UI / KOKO portal warnings.

**Rationale**: Spec US4 / FR-010 / Out of Scope. Orders exist in OS only after ERP create.

## R6 — New cancel permission + cancel path

**Decision**: Add permission `finance.approvals.cancel_koko_duplicate` (“Cancel duplicate KOKO orders from finance approvals”). Gate a finance-panel action that:
1. Cancels pending `order_payment_approval` if any (status `cancelled`).
2. Cancels the order in OS + ERP SI using existing cancel / `cancelErpnextSalesInvoice` patterns (same family as fulfillment `cancel_order` / approval rejection ERP cancel).
3. Does **not** attach KOKO reference as approved payment on the cancelled sibling.

Users with only `finance.approvals.manage` keep approve/reject; cancel-duplicate requires the new key (admins/super_admin include it in role seeds as appropriate).

**Rationale**: Spec FR-008–009 / US3. Separates high-impact cancel from routine approve.

**Alternatives considered**:
- Reuse `orders.cancel` only — wrong actor surface (merchant fulfillment vs finance group).
- Auto-cancel siblings on approve — rejected (FR-007).

## R7 — Finance UI grouping presentation

**Decision**: Extend approvals list DTO with `kokoLinkGeneratedAt`, `duplicateGroupId` (ephemeral hash of phone+fingerprint), `duplicateGroupMembers[]` summary. Panel renders grouped cards/sections for `order_payment_approval` KOKO rows that share a group; non-KOKO approvals unchanged.

**Rationale**: Spec US2; keeps non-KOKO finance UX stable (FR-011).

## R8 — Ingest / re-webhook safety

**Decision**: In `erp-sales-invoice-ingest`, when ERP KOKO and `kokoLinkGeneratedAt` is null, **skip** `createOrGetOrderPaymentApproval`. After confirm, create once. Re-ingest must not recreate approval if one pending/approved already exists (existing guards). Voided/credit-noted still `cancelPendingApprovalsForOrder`.

**Rationale**: Prevents race where second ERP webhook re-opens finance before merchant confirms.

## R9 — Time precision & timezone

**Decision**: Store `kokoLinkGeneratedAt` as `DateTime` (UTC in DB). UI collects local date+time to **minute** as shown on KOKO portal; interpret in `Asia/Colombo` (`APP_TIME_ZONE` / `lib/format-datetime`) unless portal clearly shows another zone — document Colombo as default for Sri Lanka ops. Display to finance in the same zone.

**Rationale**: Spec FR-012; matches abandoned-cart / business timezone practice.

**Alternatives considered**: Store naive string “as typed” — worse for compare/sort; rejected.

## R10 — Agent context script

**Decision**: No `.specify` agent-context update script present in this repo; skip that Phase 1 step.

**Rationale**: Skill requires running script if present; absence → skip.
