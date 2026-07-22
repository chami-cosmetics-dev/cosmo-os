# Implementation Plan: Purchasing Calculator Stacked Layout

**Branch**: `017-purchasing-calc-layout` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-purchasing-calc-layout/spec.md`

## Summary

Replace the Purchasing calculator’s **side-by-side** (results left / detail right) layout with a **stacked** layout: search controls → full-width result list under search → full-width SKU detail (margin, supplier compare, quote compare) under the list when a row is selected. **No API, schema, or formula changes** — presentation only in `purchasing-sku-calculator.tsx`, plus clear selection when a new search runs (FR-007).

**Technical approach**: Remove `md:grid-cols-2` wrapper; render list then detail in a vertical `space-y-*` stack; keep existing `max-h-72 overflow-y-auto` on the list; clear `selected` / supplier state at the start of each qualifying `runSearch`.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), React client component

**Primary Dependencies**: Existing `components/organisms/purchasing-sku-calculator.tsx`, Tailwind utility classes already used on the page

**Storage**: N/A — no Prisma or data changes

**Testing**: Manual UAT per [quickstart.md](./quickstart.md); no new unit tests required (layout-only; behavior covered by existing flows)

**Target Platform**: Cosmo OS web — Purchasing calculator (`purchasing.tools.read`)

**Project Type**: Web application (Next.js app)

**Performance Goals**: No new network calls; layout change must not add perceived lag beyond existing search/select fetches

**Constraints**: Constitution V — change only the layout shell; do not refactor margin/supplier logic; no new abstractions

**Scale/Scope**: Single organism component; one purchasing page surface

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — no schema / migration |
| II. Environment & Credential Isolation | **Pass** — no env or credential changes |
| III. Test & Typecheck Gates | **Pass** — lint changed file; no new Vitest required for pure layout |
| IV. Production Deployment Safety | **Pass** — code-only; no prod DB deploy |
| V. Simplicity & Scope Discipline | **Pass** — single-file layout reorder + clear-on-search |

**Post-design re-check**: Still pass — UI contract only; APIs unchanged; no new packages.

## Project Structure

### Documentation (this feature)

```text
specs/017-purchasing-calc-layout/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1 (UI state)
├── quickstart.md        # Phase 1
├── contracts/
│   └── ui-layout.md     # Stacked layout contract
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
components/organisms/
└── purchasing-sku-calculator.tsx   # Only file expected to change

# Unchanged (reference)
app/(dashboard)/dashboard/...       # Host page for calculator
app/api/admin/purchasing/sku-pricing/
├── route.ts
└── suppliers/route.ts
```

**Structure Decision**: Single Next.js organism; no backend or contract API edits.

## Complexity Tracking

> No constitution violations requiring justification.
