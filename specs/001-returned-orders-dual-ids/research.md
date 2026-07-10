# Research: Returned Orders Dual ID + Waybill Single ID

## Decision 1: Split display rules by surface

**Decision**:
- Returned orders list/summary → **dual ID** when both exist (Shopify top, ERP below).
- Waybill → **single source-primary ID** only.

**Rationale**: Explicit user clarification after earlier ambiguity.

**Alternatives considered**:
- Single ID everywhere → rejected (returned orders need dual).
- Dual ID everywhere including waybill → rejected (waybill must be single).

## Decision 2: Two helper modes in shared lib

**Decision**:
- Reuse/extend `formatInvoiceOrderReference` / resolve Shopify+ERP refs for **returned orders** dual UI.
- Add/use `resolveSourcePrimaryOrderRef` for **waybill** (and fulfillment callers that feed waybill labels).
- Do **not** change waybill callers to use dual `formatFulfillmentOrderReferenceText` join; change those callers (or the helper’s default for waybill paths) to source-primary.

**Rationale**: One codebase, two intentional behaviors; avoids one surface forcing the other.

## Decision 3: Returned-orders UI owns stacking

**Decision**: Implement stacked ERP/Shopify lines in `returned-orders-panel.tsx` (and selected summary). Page-data exposes `shopifyOrderId`, `erpnextInvoiceId`, `sourceName`, name/number as needed; `invoiceNo` may remain a primary string for export/compat while UI prefers dual refs when `showBoth`.

**Rationale**: Dual layout is list-specific UX; waybill stays a single string.

## Decision 4: Search matches both on returned orders

**Decision**: Client filter + export search include Shopify and ERP reference fields.

**Rationale**: FR-005 / US3.

## Resolved unknowns

| Topic | Resolution |
|-------|------------|
| Returned orders dual? | Yes |
| Waybill dual? | No — source-primary single |
| Shared helper strategy | Dual mode for returns; source-primary for waybill |
| Schema | No changes |
