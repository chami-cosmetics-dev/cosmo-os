# Implementation Plan: Multi-SKU Company Availability & Order Placement Suggestion

**Branch**: `feature/multi-sku-company-availability` | **Date**: 2026-10-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/068-multi-sku-company-availability/spec.md`

## Summary

This plan adds an **Order Availability** tab next to VAT Status and Gift Vouchers.

**What the merchant does**: they paste up to 50 SKUs with quantities and get one live check against ERP2.

**What one live check does** (a single read-only POST):
1. Reads `actual − reserved` stock from every company's **main** warehouses. It reuses the material-transfer definition of a main warehouse.
2. Reads each company's **month-to-date submitted Sales Invoice net_total**. The cap is LKR 5M per calendar month.
3. Values the order from the synced `ProductItem.price`.

**What it returns**: every company ranked by SKU coverage. Up to three companies that are within their cap are labelled **Option A/B/C** for the merchant to choose from. Selecting any company shows where its short or missing SKUs sit in other companies' main warehouses, computed client-side from the same response.

**What it does not do**: no schema changes, and no writes to ERP.

## Technical Context

**Language/Version**: TypeScript 5, Node (Next.js App Router runtime)

**Primary Dependencies**: Next.js, React, Prisma, Zod, shadcn/ui (`Tabs`, `Card`, `Button`, `Input`, `Textarea`, `Badge`), lucide-react. ERPNext REST (`/api/resource/Bin`, `Warehouse`, `Item`, `Sales Invoice`)

**Storage**: none new. Reads `ProductItem.price` / `sku` (Postgres via Prisma) and live ERP2

**Testing**: Vitest unit tests for the pure normalise/classify/rank/cap/option logic in `lib/order-availability/rank.ts`

**Target Platform**: Vercel (Cosmo OS and Vault OS deployments). Desktop and mobile web

**Project Type**: web application (single Next.js app: `app/`, `components/`, `lib/`)

**Performance Goals**: ≤ 5 s p95 for ≤ 20 SKUs (SC-002). That is 4 ERP stages: warehouse list, then Item, Bin and Sales Invoice in parallel

**Constraints**: read-only against ERP2. Never invent stock on an ERP failure (follow the `OsfErpError` convention). Asia/Colombo month boundaries. At most 50 distinct SKUs

**Scale/Scope**: about 10 ERP2 companies, ≤ 50 SKUs, a few thousand month-to-date SIs per check. Internal merchant users only

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Multi-DB migration discipline | ✅ Pass | No schema change. The permission is a code-registered key in `lib/rbac.ts`. `rbac.ts` upserts permission rows at runtime and links them to admin/super_admin, so no migration or seed is needed. |
| II. Env & credential isolation | ✅ Pass | ERP2 credentials come from the existing `ErpnextInstance` rows. The new optional env vars (`ORDER_AVAILABILITY_CAP_LKR`, `ORDER_AVAILABILITY_OPTION_COUNT`) are not secrets. |
| III. Test & typecheck gates | ✅ Pass | Pure logic is isolated in `rank.ts` with Vitest coverage. Lint and tsc run on changed files. |
| IV. Production deployment safety | ✅ Pass | No prod DB action. Merge to `main` only with explicit user confirmation. |
| V. Simplicity & scope | ✅ Pass | No transfer creation (spec Q2 = A). One endpoint, one panel, one lib folder. Reuses `resolveTransferSlots`, `listTransferWarehouses`, `isMainWarehouseName` and `skuKey`. The Bin read is a small local function rather than a widened shared helper (see research R2). |

**Post-design re-check**: ✅ Still passing. No Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/068-multi-sku-company-availability/
├── spec.md
├── plan.md               # this file
├── research.md           # R1–R9 decisions
├── data-model.md         # computed entities, status and ranking rules
├── quickstart.md         # automated and manual validation
├── contracts/
│   └── order-availability-api.md
├── checklists/requirements.md
└── tasks.md              # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
lib/order-availability/
├── types.ts              # permission key, limits, defaults, DTO types
├── rank.ts               # pure: normalizeRequestLines, classifyLine, rankCompanies,
│                         #       capStatus, pickOptions, buildDetail (client-shared)
├── rank.test.ts          # Vitest
├── config.ts             # reads/validates ORDER_AVAILABILITY_* env with defaults
└── lookup.ts             # server-only: ERP2 slot → main warehouses by company →
                          #   Item + Bin(actual,reserved) + MTD Sales Invoice (parallel)
                          #   + ProductItem.price → rank.ts → response DTO

lib/validation/order-availability.ts       # Zod request schema
app/api/admin/products/order-availability/route.ts   # POST, requirePermission
components/organisms/order-availability-panel.tsx    # client: SKU textarea/rows,
                                                     #   options A/B/C, other companies,
                                                     #   selection + detail view
app/(dashboard)/dashboard/products/vat-status/page.tsx   # + third tab (modified)
lib/rbac.ts                                          # + products.order_availability.read
components/organisms/app-sidebar.tsx                 # + permission in canViewVatStatus
```

**Structure Decision**: This follows the existing `lib/vat-status` + `vat-status-panel` + `app/api/admin/products/vat-status` layout exactly. The pure logic lives in `rank.ts` with no `server-only` import, so the client panel can reuse `buildDetail` and the tests can import it directly.

## Implementation Notes

- **Data flow inside `lookup.ts`**:
  1. `resolveTransferSlots(companyId).erp2`, which returns 502 if it is missing.
  2. `listTransferWarehouses(cfg)` filtered by `isMainWarehouseName`, then grouped by `company`.
  3. Three calls in parallel with `Promise.allSettled`: Item lookup, Bin read, and MTD SI sum. A failed Bin or Item read throws, giving a 502. A failed SI read sets `cap.error`.
  4. Prisma: `ProductItem` rows for the company whose `sku` matches (case-insensitive) for the price.
- **Month range**: `YYYY-MM-01` to today, in Asia/Colombo. Reuse the existing Colombo date helper the SMS code uses rather than adding a new one.
- **UI**:
  - Entry is a textarea (paste, one SKU per line, optional `SKU, qty` or `SKU<TAB>qty`) plus an editable parsed table before Check.
  - Results show the option cards first with Option A/B/C badges. Each card shows coverage, cap bar, headroom, and a warning badge for `near`. The rest of the companies follow under "Other companies", with status badges ("Cap reached", "Would exceed cap").
  - Clicking a card or row sets the selection and renders the detail.
  - The panel also shows "Checked at hh:mm" (FR-019), plus not-found and unpriced notices.
- **Page gate**: allow the page when the user has any of `vat_status.read`, `gift_vouchers.read/manage` or `order_availability.read`. Update the permission-denied message. `?tab=order-availability` selects the tab.

## Complexity Tracking

None.
