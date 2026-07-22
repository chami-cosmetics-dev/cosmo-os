# Implementation Plan: Fix Sticker Batch Quantity Print

**Branch**: `016-fix-sticker-quantity` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-fix-sticker-quantity/spec.md`

## Summary

Sticker Print ignores batch item **Quantity**: one label prints per line item even when Quantity is 5. Fix print so Quantity N yields N identical printed labels, while on-screen preview stays one card per line item and shows the quantity as a number (not N duplicate preview cards). Total “Sticker Count” must equal the sum of quantities.

**Technical approach**: Client-only change in Sticker Print. API already returns `quantity` per item. Preview renders one card + quantity badge; print path expands each item by `quantity` when building the print document (do not clone the 1:1 preview sheet as-is). Small pure helper for expand/sum supports Vitest.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js as in repo

**Primary Dependencies**: Next.js, React, existing `StickerPreviewCard` / `VaultStickerPreviewCard`, browser print window pattern in `sticker-print-client.tsx`, Vitest

**Storage**: N/A — no schema or persistence changes; `StickerBatchItem.quantity` already stored and returned by `GET /api/admin/sticker-batches/[id]`

**Testing**: Vitest for quantity expand/sum helpers; manual UAT per [quickstart.md](./quickstart.md)

**Target Platform**: Cosmo OS / Vault OS web admin (`/dashboard/sticker-print`)

**Project Type**: Web application (Next.js App Router + existing API)

**Performance Goals**: Preview remains light (one DOM card per line item) even for large quantities; print expansion happens only on Print click

**Constraints**: Printed label content must match today’s sticker (quantity badge is screen-only); both Cosmo and Vault layouts; no batch-entry UI redesign; Constitution simplicity — no new services/tables

**Scale/Scope**: One print page client + optional tiny lib helper + unit tests; optional minor preview badge styling on sticker cards

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — no Prisma/schema changes |
| II. Environment & Credential Isolation | **Pass** — no new secrets or env targets |
| III. Test & Typecheck Gates | **Pass** — Vitest for expand/sum helpers; `npm test` before merge |
| IV. Production Deployment Safety | **Pass** — no auto push/deploy; frontend-only fix |
| V. Simplicity & Scope Discipline | **Pass** — fix print/preview client; reuse existing cards and API; no abstractions beyond a small pure helper |

**Post-design re-check**: Still pass — no new tables, no new API routes, print expansion localized to sticker print client + helper.

## Project Structure

### Documentation (this feature)

```text
specs/016-fix-sticker-quantity/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── sticker-quantity-print.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
lib/
├── sticker-print-quantity.ts        # expandItemsByQuantity + totalStickerCount
└── sticker-print-quantity.test.ts

app/(dashboard)/dashboard/sticker-print/
└── sticker-print-client.tsx         # preview 1:1 + qty number; print expands by qty

components/organisms/
├── sticker-preview-card.tsx         # optional: accept screen-only qty badge prop / wrapper
└── vault-sticker-preview-card.tsx   # same if badge lives on card; prefer wrapper in client
```

**Structure Decision**: Keep work in the existing Sticker Print client. Prefer wrapping quantity display in the print client (badge beside/above card with `no-print`) rather than changing label artwork inside the yellow sticker card. Extract pure expand/sum helpers to `lib/` for testability. No API or Prisma changes.

## Complexity Tracking

> No constitution violations requiring justification.
