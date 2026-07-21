# Implementation Plan: OSF Purchasing Suite

**Branch**: `012-osf-purchasing-suite` | **Date**: 2026-07-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-osf-purchasing-suite/spec.md`

## Summary

Extend Cosmo purchasing beyond the existing OSF hub: dedicated **Purchasing** sidebar group; SKU **margin calculator** and **session-only supplier price compare**; OSF **signed** per-warehouse order qty (surplus negative) with TOTAL buy = positives only; per-SKU **reorder threshold %** (default 70%); **filtered reorder-only OSF** download; **reminder bubble** for below-threshold SKUs; **two new permission families** (tools + reminders) separate from classic `purchasing.osf.*`.

**Technical approach**: Extend `ProductOsfProfile` with `reorderThresholdPercent`; change `orderQty` + workbook totals; new APIs under `/api/admin/purchasing/` for calculator lookup; generate filter mode; add `reminders.purchasing_rop_threshold` + `purchasing.tools.read|manage` to RBAC; move OSF nav into Purchasing group with new tool routes.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js as in repo

**Primary Dependencies**: Next.js, Prisma, Zod (`lib/validation`), existing `lib/osf/*` (catalog, ERP stock/cost/purchases, build-workbook, formulas), `xlsx`, Vitest, existing reminder pipeline (`lib/task-reminders.ts`, `lib/reminder-permissions.ts`)

**Storage**: Neon PostgreSQL via Prisma — add `reorderThresholdPercent` on `ProductOsfProfile`; migrate via `db:migrate:create` + `db:deploy:all`

**Testing**: Vitest for signed `orderQty`, positive-only TOTAL, threshold below/above helpers, margin/price-change %; manual UAT per [quickstart.md](./quickstart.md)

**Target Platform**: Cosmo OS purchasing (company-scoped; Vault inherits same code if enabled)

**Project Type**: Web application (Next.js app)

**Performance Goals**: Full OSF generate unchanged (~5 min catalog budget). Calculator/compare: single-SKU ERP cost lookup &lt; 5s. Filtered reorder OSF and reminder evaluation: same ERP batch pattern as generate; reminder list capped like other bubbles.

**Constraints**: Constitution multi-DB migrate; never invent stock/cost; supplier allowlist for last purchase; session-only new price; no email/SMS for ROP alerts in v1; absolute warehouse ROP retained

**Scale/Scope**: ~1–2k SKUs; ~10–15 warehouse columns; 2–3 new dashboard pages + sidebar group; one reminder category

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — profile column via `db:migrate:create` + `db:deploy:all` |
| II. Environment & Credential Isolation | **Pass** — ERP via company `ErpnextInstance`; no cross-tenant |
| III. Test & Typecheck Gates | **Pass** — Vitest for formula/threshold helpers; `npm test` before merge |
| IV. Production Deployment Safety | **Pass** — migrate/deploy/push only with explicit user confirmation |
| V. Simplicity & Scope Discipline | **Pass** — extend existing OSF libs; no quote-history table; no async job for v1 |

**Post-design re-check**: Still pass — one new profile field; permissions follow existing `purchasing.*` + `reminders.*` patterns; calculator reuses OSF cost/purchase fetch for one SKU.

## Project Structure

### Documentation (this feature)

```text
specs/012-osf-purchasing-suite/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── purchasing-suite.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
prisma/schema.prisma                          # ProductOsfProfile.reorderThresholdPercent
prisma/migrations/<ts>_osf_reorder_threshold/

lib/
├── osf/
│   ├── formulas.ts                           # signed orderQty; positiveSum helper
│   ├── build-workbook.ts                     # TOTAL = positives only; Common buy sum
│   ├── threshold.ts                          # isBelowReorderThreshold(stock, rop, pct)
│   └── catalog-rows.ts                       # unchanged identity + discountedPrice
├── validation/osf.ts                         # threshold % + purchasing tool bodies
├── rbac.ts                                   # purchasing.tools.read|manage
├── reminder-permissions.ts                   # reminders.purchasing_rop_threshold
└── task-reminders.ts                         # below-threshold bubble category

app/api/admin/
├── osf/
│   ├── generate/route.ts                     # optional belowThresholdOnly filter
│   └── profiles/[sku]/route.ts              # PATCH reorderThresholdPercent
└── purchasing/
    └── sku-pricing/route.ts                  # GET search/lookup: cost + catalog sell

app/(dashboard)/dashboard/purchasing/
├── osf/page.tsx                              # existing hub (+ threshold in editor, filtered generate)
├── calculator/page.tsx                       # margin + price-compare (one page, two panels)
└── reorder/page.tsx                          # optional list + filtered download CTA

components/organisms/
├── app-sidebar.tsx                           # Purchasing group
├── osf-generate-panel.tsx                    # “Reorder-only” toggle/button
├── osf-product-editor.tsx                    # reorder threshold % field
└── purchasing-sku-calculator.tsx             # search, margin, compare

```

**Structure Decision**: Single Next.js app. Reuse OSF generation pipeline with a filter flag. Purchasing tools are thin UI + one lookup API. Reminders evaluate threshold using the same stock/ROP math as filtered OSF (ERP live at request time).

## Complexity Tracking

> No constitution violations requiring justification.
