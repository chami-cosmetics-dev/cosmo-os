# Implementation Plan: Abandoned Cart Deduplication & Abandonment Reason

**Branch**: `054-abandoned-cart-dedupe` | **Date**: 2026-09-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/054-abandoned-cart-dedupe/spec.md`

## Summary

Extend Abandoned Orders so sync/webhook ingest links exact duplicate carts (same normalized phone + identical line multiset), soft-hides older proper-subset carts when a fuller newer cart appears, surfaces same-day sibling badges (no status sync), and adds an optional structured abandonment-reason field. Follow-up PATCH propagates status/response/reason/remark across an exact-duplicate group. Builds on `015` (`ShopifyAbandonedCheckout`, sync, panel, CSV).

## Technical Context

**Language/Version**: TypeScript (strict), Node.js via Next.js App Router  
**Primary Dependencies**: Next.js, React, Prisma, Zod (`lib/validation`), Vitest  
**Storage**: PostgreSQL (Neon) via Prisma — extend `ShopifyAbandonedCheckout`  
**Testing**: Vitest unit tests for fingerprint / subset / same-day helpers; manual UI quickstart  
**Target Platform**: Cosmo OS web admin (Vercel)  
**Project Type**: Web application (Next.js monolith)  
**Performance Goals**: Dedupe pass for one company phone cohort completes within normal sync budget; list query stays comparable to current abandoned-orders page (~5s including sync when stale)  
**Constraints**: Migration via `npm run db:migrate:create` + deploy all DBs; no `db push` on shared envs; permissions already `abandoned_orders.read` / `.manage`  
**Scale/Scope**: Per-company abandoned checkouts in 7-day sync window; linking scoped by company + normalized phone

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Multi-Database Migration Discipline | PASS | New columns on `ShopifyAbandonedCheckout` via `npm run db:migrate:create`; deploy with `db:deploy:all` before done |
| II. Environment & Credential Isolation | PASS | No new credentials; reuse Shopify Admin token + existing company scoping |
| III. Test & Typecheck Gates | PASS | Unit tests for dedupe helpers; `npm test` / lint for touched files before PR |
| IV. Production Deployment Safety | PASS | No auto push to `main` / prod deploy from this plan |
| V. Simplicity & Scope Discipline | PASS | Persist minimal link/hide fields on existing model; compute same-day badge at list time; no separate link tables unless needed |
| Stack constraints | PASS | Next.js + Prisma + Zod validation on PATCH; Vitest for units |

**Post-design re-check**: PASS — design stays on one model + one dedupe lib + existing APIs/UI; no unjustified abstraction layers.

## Project Structure

### Documentation (this feature)

```text
specs/054-abandoned-cart-dedupe/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── abandoned-cart-dedupe.md
└── tasks.md                 # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
prisma/schema.prisma
prisma/migrations/…          # via db:migrate:create

lib/abandoned-orders-constants.ts
lib/abandoned-checkout-cart.ts          # fingerprint + subset compare (new)
lib/abandoned-checkout-dedupe.ts        # link / supersede / backfill (new)
lib/abandoned-checkout-follow-up.ts     # group propagate + abandonmentReason
lib/abandoned-checkouts-sync.ts         # enrich line items; call dedupe after upsert
lib/shopify-abandoned-checkout-webhook.ts
lib/page-data/abandoned-orders.ts
lib/page-data/abandoned-orders-types.ts
lib/validation.ts
lib/phone-lookup.ts                     # reuse canonical phone

app/api/admin/abandoned-orders/page-data/route.ts
app/api/admin/abandoned-orders/[id]/follow-up/route.ts
app/api/admin/abandoned-orders/export/route.ts

components/organisms/abandoned-orders-panel.tsx
components/molecules/abandoned-order-follow-up-form.tsx

lib/__tests__/abandoned-checkout-cart.test.ts   # or existing test layout
```

**Structure Decision**: Single Next.js app — extend existing abandoned-orders paths; add focused cart-compare + dedupe libs under `lib/`; no new top-level package.

## Complexity Tracking

> No constitution violations requiring justification.
