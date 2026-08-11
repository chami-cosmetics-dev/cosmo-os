# Implementation Plan: Merchant Dashboard Motivation & Sales Tracking

**Branch**: `037-merchant-dashboard-motivation` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/037-merchant-dashboard-motivation/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Extend the existing Merchant Dashboard so merchants no longer need company Overview to answer **Today**, **MTD**, **peer rank**, and **location share**. Deliver: (1) Today KPI, (2) company-wide Today + MTD peer boards (named amounts, top 10 + self), (3) per-location self % + compact named peer breakdown for Today + MTD, (4) sales history (current-month days + last 3 months), (5) first-viewport motivational layout. Reuse existing merchant attribution and `dashboard.merchant_view` access; compute aggregates on read (no new Prisma tables); extend the single `page-data` payload.

## Technical Context

**Language/Version**: TypeScript 5, Next.js App Router (Cosmo OS web)

**Primary Dependencies**: React client panel (`merchant-dashboard-panel.tsx`), Prisma, Zod (`lib/validation/merchant-dashboard.ts`), Auth0 + `requirePermission` / `canAccessMerchantDashboard`, Recharts via existing chart components, Asia/Colombo date helpers (`formatAppIsoDate`, existing MTD bounds)

**Storage**: Neon PostgreSQL — **read-only** over existing `Order`, `User` (merchant cohort), `CompanyLocation`, `MerchantMonthlyTarget` / history. **No new tables/migrations** for v1.

**Testing**: Vitest for peer-board top-10+self builder, location-share %, Colombo day bucketing, history window bounds; manual quickstart for UI/API

**Target Platform**: Cosmo OS dashboard (web), mobile-responsive first viewport

**Project Type**: Web application (extend existing merchant page + page-data API)

**Performance Goals**: One authenticated `page-data` load returns all new sections; prefer **one order scan per date window** for the merchant cohort (Today window + MTD window) instead of N×`fetchMerchantUserSales`; page usable within interactive dashboard norms (&lt; ~5s typical company)

**Constraints**: Server-side authZ + Zod; same attribution as current merchant MTD (coupon match else `assignedMerchantId`); Overview charts unchanged (FR-011); Principle V — extend helpers, no speculative archive/export; no mobile app work

**Scale/Scope**: Merchant cohort typically tens of users; history = ≤31 daily rows + 3 monthly rows; peer boards ≤11 rows (top 10 + optional self); location peer lists compact per location the viewed merchant appears in

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Multi-Database Migration Discipline — PASS**: v1 adds no Prisma schema/migrations. Aggregation stays on-read.
- **II. Environment & Credential Isolation — PASS**: No new secrets; existing Auth0 + RBAC.
- **III. Test & Typecheck Gates — PASS**: Unit tests for pure board/history helpers; `npm test` / lint clean for changed files. No `mobile/rider-app` changes.
- **IV. Production Deployment Safety — PASS**: Plan does not push `main` or prod-migrate without explicit user request.
- **V. Simplicity & Scope Discipline — PASS**: Extend existing merchant dashboard page-data + panel; reuse attribution; no new permission keys unless research proves need (default: reuse `dashboard.merchant_view` / merchant-role access); no Overview rewrite.

**Post-design re-check**: Still PASS — contracts extend existing GET page-data DTO; derived read models only; research R1–R7 resolve aggregation/UX without migrations or new product surfaces.

## Project Structure

### Documentation (this feature)

```text
specs/037-merchant-dashboard-motivation/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1
│   └── merchant-dashboard-motivation.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
lib/page-data/merchant-dashboard.ts              # Extend MerchantDashboardPageData + loader
lib/page-data/merchant-dashboard-sales.ts        # Reuse attribution; optional cohort helpers
lib/page-data/merchant-dashboard-peers.ts        # NEW: cohort scan, peer boards, location share
lib/page-data/merchant-dashboard-history.ts      # NEW: daily (current month) + monthly (last 3)
lib/merchant-dashboard/cheer.ts                  # Extend peer motivational copy bands
lib/merchant-dashboard/peer-board.ts             # NEW: pure top-10+self + rank/gap builders
lib/validation/merchant-dashboard.ts             # Keep query schema; no new mutation routes required

app/api/admin/merchant-dashboard/page-data/route.ts   # Unchanged auth; richer JSON body
app/(dashboard)/dashboard/merchant/
  page.tsx                                       # Pass-through initialData
  merchant-dashboard-panel.tsx                   # Today KPI, peer boards, location share, history UI

# Optional thin unit colocates:
lib/merchant-dashboard/peer-board.test.ts
lib/page-data/merchant-dashboard-history.test.ts
```

**Structure Decision**: Stay inside existing Merchant Dashboard surface. Prefer extending `GET /api/admin/merchant-dashboard/page-data` (aggregated page-data pattern) over new client round-trips. Extract pure peer/history helpers for testability. Do not modify company Overview page-data.

## Complexity Tracking

> No constitution violations requiring justification.
