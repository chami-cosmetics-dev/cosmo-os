# Implementation Plan: Returned Orders Dual ID + Waybill Single ID

**Branch**: `001-returned-orders-dual-ids` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-returned-orders-dual-ids/spec.md`

## Summary

- **Returned orders list/summary**: show **both** IDs when present (Shopify on top, ERP below, smaller). Search matches either ID.
- **Waybill**: show **one** source-based ID only (Shopify-origin → Shopify order number; ERP-origin → ERP SI). No dual IDs on waybill.

Technical approach: keep/reuse dual-reference formatting for returned orders UI; add/use `resolveSourcePrimaryOrderRef` for waybill/fulfillment display paths that currently join or stack both IDs; expose order ref fields on return rows for search.

## Technical Context

**Language/Version**: TypeScript 5 / Next.js 16 / React 19

**Primary Dependencies**: Existing app stack — Prisma (read-only), React panels, Vitest

**Storage**: Existing `Order` fields — **no schema changes**

**Testing**: Vitest for dual vs source-primary helpers; manual UAT on returned orders + waybill

**Target Platform**: Cosmo OS / Vault OS web dashboard

**Project Type**: Web application (Next.js monolith)

**Performance Goals**: No extra network round-trips

**Constraints**: No migrations; do not make waybill inherit returned-orders dual UI; do not remove dual display from returned orders

**Scale/Scope**: Returned-orders list/summary/export search; waybill order-reference display via shared helpers used by waybill flows

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Multi-Database Migration Discipline | PASS | No schema / migration |
| II. Environment & Credential Isolation | PASS | No env changes |
| III. Test & Typecheck Gates Before Merge | PASS | Unit tests for both display modes |
| IV. Production Deployment Safety | PASS | No auto PR/push/deploy |
| V. Simplicity & Scope Discipline | PASS | Two clear modes: dual for returns UI, source-primary for waybill |

**Post-design re-check**: PASS.

## Project Structure

### Documentation (this feature)

```text
specs/001-returned-orders-dual-ids/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/returned-orders-reference.md
└── tasks.md
```

### Source Code (repository root)

```text
lib/
├── fulfillment-order-reference.ts       # Dual helpers (returns) + source-primary (waybill)
├── fulfillment-order-reference.test.ts
└── page-data/order-returns.ts           # Expose refs; support dual display data

components/
├── molecules/fulfillment-order-reference.tsx  # Waybill/default: single ID mode
└── organisms/returned-orders-panel.tsx        # Dual stacked display + search

# Waybill / print callers that use dual text today → switch to source-primary
components/organisms/fulfillment-pages/...
app/api/admin/fulfillment/...
```

**Structure Decision**: Separate display modes — returned-orders panel owns dual stacked UI; waybill paths use source-primary single string from shared lib.

## Complexity Tracking

> No constitution violations requiring justification.
