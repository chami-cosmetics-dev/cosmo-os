# Implementation Plan: Abandoned Orders Follow-up

**Branch**: `015-abandoned-orders-followup` | **Date**: 2026-07-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-abandoned-orders-followup/spec.md`

## Summary

Add an **Abandoned Orders** page under Order Management that syncs Shopify abandoned checkouts (last 7 days), lists them company-wide for permitted users, supports follow-up status + customer response + optional remark, and exports filtered rows to CSV.

**Technical approach**: New Prisma models `ShopifyAbandonedCheckout` + `CompanyAbandonedCheckoutSync`; Shopify Admin **GraphQL** `abandonedCheckouts` query (API version `2024-10`, same as `lib/shopify-admin.ts`) using existing `SHOPIFY_ADMIN_ACCESS_TOKEN` and per-location `shopifyAdminStoreHandle`; sync on page-data load when stale (>30 min) plus Vercel cron every 30 minutes; RBAC keys `abandoned_orders.read` / `abandoned_orders.manage`; UI panel patterned after returned orders / merchant reviews.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js as in repo

**Primary Dependencies**: Next.js, React, Prisma, Zod (`@/lib/validation`), Auth0 RBAC (`requirePermission`), existing `lib/shopify-admin.ts` API version constant, `lib/reports/csv` (`buildCsv`), Vitest, `notify` / action-loading UX

**Storage**: Neon PostgreSQL via Prisma — new `ShopifyAbandonedCheckout` and `CompanyAbandonedCheckoutSync` tables; migrate via `npm run db:migrate:create` + `npm run db:deploy:all`

**Testing**: Vitest for sync merge rules, follow-up validation (response required on close, reopen), recovery auto-close; manual UAT per [quickstart.md](./quickstart.md)

**Target Platform**: Cosmo OS web admin (`/dashboard/orders/abandoned-orders`)

**Project Type**: Web application (Next.js App Router + API routes + Vercel cron)

**Performance Goals**: First page of list within 5s (SC-001); sync upsert for typical 7-day volume per store without blocking UI (async/sync in page-data with stale-while-revalidate pattern); CSV export up to 1,000 rows in 30s

**Constraints**: Server-side auth + Zod on all mutations; company-scoped queries; 7-day import window; no contact-allocation scoping; no automated SMS/email in v1; Constitution multi-DB migration discipline; Cosmo deployment requires `SHOPIFY_ADMIN_ACCESS_TOKEN` (Vault lacks token — feature gated or no-op with clear message, same as other Admin API usage)

**Scale/Scope**: One sidebar page, one panel, ~4 API routes, one cron, one lib module for Shopify GraphQL sync, two RBAC permissions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — new tables via `db:migrate:create` + `db:deploy:all` before complete |
| II. Environment & Credential Isolation | **Pass** — reuse env `SHOPIFY_ADMIN_ACCESS_TOKEN`; company-scoped DB rows; no new committed secrets |
| III. Test & Typecheck Gates | **Pass** — Vitest for pure sync/validation helpers; `npm test` before merge |
| IV. Production Deployment Safety | **Pass** — no auto push/deploy; migration deploy only with explicit user confirmation |
| V. Simplicity & Scope Discipline | **Pass** — dedicated table (not overloading `Order`); single GraphQL client helper; no webhooks in v1 |

**Post-design re-check**: Still pass — two focused tables; cron + page-open sync share one `syncAbandonedCheckoutsForCompany()` function; follow-up PATCH mirrors merchant review single-row update pattern.

## Project Structure

### Documentation (this feature)

```text
specs/015-abandoned-orders-followup/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── abandoned-orders-followup.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
prisma/schema.prisma
└── ShopifyAbandonedCheckout, CompanyAbandonedCheckoutSync

lib/
├── shopify-abandoned-checkouts.ts       # GraphQL fetch + normalize + upsert
├── shopify-abandoned-checkouts.test.ts
├── abandoned-checkout-follow-up.ts      # Validation + status transition rules
├── abandoned-checkout-follow-up.test.ts
└── page-data/abandoned-orders.ts        # List query + filters + sync orchestration

app/api/admin/abandoned-orders/
├── page-data/route.ts                   # GET list + trigger sync if stale
├── [id]/follow-up/route.ts              # PATCH status/response/remark
└── export/route.ts                      # GET CSV

app/api/cron/abandoned-checkouts-sync/route.ts

app/(dashboard)/dashboard/orders/abandoned-orders/page.tsx

components/organisms/
└── abandoned-orders-panel.tsx

components/organisms/app-sidebar.tsx      # Nav item under Order Management

lib/rbac.ts                               # abandoned_orders.read | .manage
vercel.json                               # */30 cron entry
```

**Structure Decision**: Extend existing Next.js App Router layout. Aggregated `page-data` endpoint per performance rule. Shopify sync logic colocated in `lib/shopify-abandoned-checkouts.ts` (extend `lib/shopify-admin.ts` only for shared token/version if needed). No mobile changes.

## Complexity Tracking

> No constitution violations requiring justification.
