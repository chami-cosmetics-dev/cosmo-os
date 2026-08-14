# Research: 041-order-replace-link

## 1. Storage model for cancel→replace link

**Decision**: Add nullable self-FK `Order.replacedByOrderId` (+ reverse relation `replacedFromOrders`) on the cancelled order. Do **not** reuse `OrderExchange` for v1.

**Rationale**: Spec needs a simple optional field on a cancelled order after cancel, editable/clearable only there, with reverse read-only display and search enrichment. `OrderExchange` is a separate merchant exchange workflow (`status`, `reason`, `pending`, free-text refs, exchanges panel). Reusing it would force status/reason UX and conflate two ops processes.

**Alternatives considered**:
- Reuse `OrderExchange` with a new reason/status — rejected (workflow overhead, wrong UX surface).
- Free-text `replacedByOrderNumber` only — rejected (fragile reverse lookup; no stable FK for navigation).
- Join table — rejected (one-to-one from cancelled side; FK is enough; many cancelled → one replacement allowed via reverse collection).

## 2. Order-number resolution (staff input)

**Decision**: Resolve entered value against company-scoped Cosmo orders using the same **business-visible** fields staff search today, preferring **exact** (case-insensitive trim) match on `name`, `orderNumber`, and `erpnextInvoiceId`. Require exactly one match; reject 0 or >1. Display via existing `formatBusinessOrderNumber` (`name` → `orderNumber` → `shopifyOrderId`).

**Rationale**: Clarification locked “visible order number (same as order search)”. ERP-native replacements typically store SI id in `name` / `erpnextInvoiceId` with `orderNumber` often null — those fields must be in the resolve set. Exact match avoids accidental partial links from suffix search.

**Alternatives considered**:
- Reuse quick-search `contains` and take first hit — rejected (ambiguous / wrong order risk).
- Match `shopifyOrderId` / internal `id` — rejected for staff input (clarification: not internal id); optional later.

## 3. Cosmo-only gating

**Decision**: Gate mutate API and editable UI with `!isVaultOsDeployment()` (`lib/falcon-waybill-brand.ts` / `NEXT_PUBLIC_APP_NAME`). Vault builds omit the field and skip search enrichment for replace links (or no-op if column null everywhere on Vault DB until unused).

**Rationale**: Spec FR-011 Cosmo only. Existing pattern for Cosmo vs Vault behavior.

**Alternatives considered**: Company flag / permission-only — rejected (deployment-level product split already established).

## 4. API surface

**Decision**: Dedicated route `PATCH /api/admin/orders/[id]/replaced-by` with body `{ replacedByOrderNumber: string | null }`. Enrich `GET /api/admin/orders/[id]` with `replacedByOrder` and `replacedFromOrders`. Enrich quick-search + orders page-data search hits with related counterpart summary (one hop).

**Rationale**: No general order PATCH exists; fulfillment route is action-oriented and cancel confirmation must not collect the link. Dedicated route keeps validation clear.

**Alternatives considered**: Piggyback fulfillment `cancel_order` — rejected (spec: after cancel only). Remarks API — wrong domain.

## 5. Auth

**Decision**: View with existing order read permissions. Mutate (set/clear) with `orders.cancel` (same staff who manage cancel-related ops). Always company-scoped CUID + Zod.

**Rationale**: Spec FR-008 ties edit to cancel-related operational access. Simpler than inventing a new permission for v1.

**Alternatives considered**: `orders.manage` only — narrower than cancel-capable staff. New `orders.link_replacement` — unnecessary for v1.

## 6. Cancelled gate

**Decision**: Allow set/clear only when `cancelledAt != null` (cancel path already sets this + voided finance). Non-cancelled → 400.

**Rationale**: Aligns with cancel write path in fulfillment route; clearer than `financialStatus === "voided"` alone (voided can appear in other finance paths).

**Alternatives considered**: Voided-only — weaker signal for “this was cancelled for replace”.

## 7. Search enrichment scope

**Decision**: Enrich both dashboard **quick-search** (`lib/page-data/orders-quick-search.ts`) and main **orders list search** (`lib/page-data/orders.ts` / page-data) when a hit is a cancelled order with `replacedByOrderId` or is targeted by one or more `replacedFromOrders`. Show counterpart label + id; no multi-hop expansion.

**Rationale**: Spec “when we search by order”; both surfaces are how staff find orders today.

**Alternatives considered**: Quick-search only — incomplete vs orders panel search.

## 8. Migration discipline

**Decision**: Additive nullable `replacedByOrderId` + index via `npm run db:migrate:create`; deploy all three DBs with `npm run db:deploy:all` before considering done. No backfill.

**Rationale**: Constitution I.

## 9. Agent context script

**Decision**: Skip — repo has no `.specify` update-agent-context script (only setup-plan / check-prerequisites / create-new-feature / setup-tasks).

**Rationale**: Nothing to run; plan artifacts are source of truth for implement.
