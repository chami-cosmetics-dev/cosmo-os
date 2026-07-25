# Implementation Plan: Print Invoice Without Marking Printed

**Branch**: `024-print-invoice-view` | **Date**: 2026-07-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/024-print-invoice-view/spec.md`

## Summary

Add a clear **Print Invoice** action on the order details / invoice timeline modal that opens a printable invoice **without** incrementing `printCount`, setting `lastPrintedAt`, or advancing fulfillment stage. Formal print from the fulfillment Print queue (`?print=1`) stays status-changing.

**Technical approach**: Reuse `GET /api/admin/orders/[id]/invoice`. Introduce an explicit view-only print query mode (e.g. `preview=1`, or document `print=preview`) that sets `autoPrint` but never runs the print-count / stage update path. Point the order-details modal button at that mode, show it for unprinted and cancelled orders (not only when `printCount > 0`), and gate with read (or existing modal) permission so it stays distinct from `fulfillment.order_print.print`.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js as in repo

**Primary Dependencies**: Next.js, React, existing print-format renderer (`lib/print-format-renderer.ts`), Auth0 RBAC (`requireAnyPermission`), Zod `cuidSchema`

**Storage**: Existing `Order` fields only (`printCount`, `lastPrintedAt`, `lastPrintedById`, fulfillment stage) — **no new tables/migrations**

**Testing**: Vitest for any extracted query-param / print-mode helper; manual UAT per [quickstart.md](./quickstart.md)

**Target Platform**: Cosmo OS / Vault OS web admin — order details invoice timeline modal

**Project Type**: Web application (Next.js App Router + admin APIs)

**Performance Goals**: Single invoice HTML response; open in new tab and browser print dialog within normal page load time

**Constraints**: Server-side auth on invoice GET; view-only print must not mutate order; formal `print=1` behavior preserved for fulfillment Print queue / bulk print; Constitution simplicity — prefer small param + UI change over new endpoints

**Scale/Scope**: One primary modal (`order-invoice-view-modal`), invoice route query handling, optional small pure helper + unit test; related call sites audited so only formal print keeps `print=1`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — no schema/migration changes |
| II. Environment & Credential Isolation | **Pass** — no new secrets or env targets |
| III. Test & Typecheck Gates | **Pass** — Vitest for print-mode parsing if extracted; `npm test` / lint before merge |
| IV. Production Deployment Safety | **Pass** — no auto push/deploy |
| V. Simplicity & Scope Discipline | **Pass** — extend existing invoice GET + modal button; no new service layer or duplicate render path |

**Post-design re-check**: Still pass — contracts document query modes only; no new persistence; formal print path unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/024-print-invoice-view/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── invoice-print-modes.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
app/api/admin/orders/[id]/invoice/
└── route.ts                    # Parse view-only print mode; autoPrint without mutate

components/organisms/
├── order-invoice-view-modal.tsx  # Print Invoice → view-only URL; show regardless of printCount
├── order-fulfillment-detail.tsx  # Audit: keep formal print=1 only if this is status-changing print
└── fulfillment-print-panel.tsx   # Unchanged: formal ?print=1

lib/                              # Optional: small print-mode helper + *.test.ts
└── (existing print-format-renderer.ts reused)

components/contexts/
└── fulfillment-permissions-context.tsx  # May expose canViewInvoice / use read for button gate
```

**Structure Decision**: Single Next.js app. Change the existing invoice API query contract and the order-details modal; do not add a parallel invoice endpoint. Fulfillment Print queue remains the only intentional status-changing print entry point for this feature’s scope.

## Complexity Tracking

> No constitution violations requiring justification.
