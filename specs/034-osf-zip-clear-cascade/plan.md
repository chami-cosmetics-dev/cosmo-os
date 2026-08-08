# Implementation Plan: OSF Zip Clear & Priority Cascade Filters

**Branch**: `034-osf-zip-clear-cascade` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/034-osf-zip-clear-cascade/spec.md`

## Summary

Enhance the existing **OSF Supplier Orders** panel so that (1) a **successful Generate zip** clears the working table and browser draft, (2) the **Brand** dropdown lists only brands that have items for the selected **priority**, and (3) item search continues to (and is verified to) respect priority + brand. No schema changes; extend `page-data` with optional priority-scoped brands and wire panel clear + brand reset UX.

**Technical approach**: Call existing `clearAll()` / `clearDraft` after successful generate blob download. Add optional `priority` query to `GET /page-data` (Zod-validated) so brands are vendors with at least one non-archived ProductItem matching the same erp1/erp2 priority OR used by `/items`. On priority change, refetch brands and reset `vendorId` if no longer in the list. Items API already filters by priority — keep that contract; ensure panel refresh on filter change remains correct.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js as in repo

**Primary Dependencies**: Next.js, React, Prisma (read-only), Zod (`lib/validation/osf`), existing `lib/osf/supplier-orders-*`, RBAC, Vitest

**Storage**: No new tables. Draft remains `localStorage` via `supplier-orders-draft.ts`. Brands derived from `Vendor` + `ProductItem` priority fields

**Testing**: Vitest for any pure brand-filter helper if extracted; manual UAT per [quickstart.md](./quickstart.md); extend draft clear behavior coverage if tests assert generate side effects on client (panel is UI — prefer small unit on shared “should clear after success” helper only if extracted)

**Target Platform**: Cosmo OS web dashboard — `/dashboard/purchasing/osf` Supplier Orders panel

**Project Type**: Web application (Next.js app)

**Performance Goals**: Priority-scoped brand list returns within ~1–2s for typical company catalogs; item search unchanged (~3s first page as in 031)

**Constraints**: Constitution — no `db:push` / no migration; reuse existing priority match semantics (`erp1ProductPriority` OR `erp2ProductPriority`); clear only on generate **success**; filter changes must not clear the working table

**Scale/Scope**: Same as 031 (one browser draft; thousands of SKUs; dozens of brands). Brand query uses `productItems.some` with existing priority indexes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — no Prisma schema / migration |
| II. Environment & Credential Isolation | **Pass** — company-scoped vendor/product queries; same auth as 031 |
| III. Test & Typecheck Gates | **Pass** — Vitest for shared helper if any; CI gates unchanged |
| IV. Production Deployment Safety | **Pass** — code-only; no prod DB deploy |
| V. Simplicity & Scope Discipline | **Pass** — small panel + page-data extension; no new packages or draft servers |

**Post-design re-check**: Still pass — optional `priority` on page-data; client clear after success; no new persistence.

## Project Structure

### Documentation (this feature)

```text
specs/034-osf-zip-clear-cascade/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── osf-supplier-orders-cascade.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
components/organisms/
└── osf-supplier-orders-panel.tsx
    # clear rows+draft after successful generate
    # refetch brands when priority changes; reset invalid brand
    # keep items refresh on priority/brand (already present)

app/api/admin/osf/supplier-orders/
└── page-data/route.ts
    # optional ?priority= → brands with matching ProductItems

lib/validation/
└── osf.ts
    # osfSupplierOrdersPageDataQuerySchema (optional priority)

lib/osf/  (optional thin helper)
└── supplier-orders-brands.ts   # only if brand where-clause shared/tested; else inline in route

# Unchanged (verify only)
app/api/admin/osf/supplier-orders/items/route.ts   # already priority+vendorId
lib/osf/supplier-orders-draft.ts                   # clearDraft already used by Clear table
```

**Structure Decision**: Extend the existing 031 Supplier Orders surface in the single Next.js app — no new routes beyond optional query on `page-data`, no new packages.

## Complexity Tracking

> No constitution violations requiring justification.
