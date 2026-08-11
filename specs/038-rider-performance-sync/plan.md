# Implementation Plan: Rider Performance Sync & Analytics

**Branch**: `038-rider-performance-sync` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/038-rider-performance-sync/spec.md`

## Summary

Make rider-app and delivery-link completions update the same Cosmo OS rider ops and performance views, fix shipping-rule rider-pay import (upsert + skip blank rider charges), surface unmatched labels, and upgrade admin Rider performance with Colombo-correct dates, KPIs, and Recharts analytics—while keeping the existing rider-app performance tab on the same incentive rules.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router + Expo rider app)

**Primary Dependencies**: Next.js, Prisma, Zod, Auth0 / rider mobile sessions, `xlsx`, Recharts (already in repo), Vitest

**Storage**: Neon PostgreSQL via Prisma — existing `RiderDeliveryTask`, `Order`, `DeliveryPayment`, `RiderDeliveryChargeRule` (no new tables expected)

**Testing**: Vitest for parse/upsert/incentive/unmatched helpers + date bounds; `npm run mobile:typecheck` if mobile performance response shape changes

**Target Platform**: Cosmo OS web (`/dashboard/riders`, `/dashboard/riders/performance`, settings upload) + `mobile/rider-app` performance tab

**Project Type**: Web admin + shared Next.js API + existing mobile client

**Performance Goals**: Admin refresh shows completion within 30s; performance range query usable for a typical day/week of completions; charge map load OK for ~3k rules

**Constraints**: Server-side RBAC (`staff.read` / `settings.company`); Asia/Colombo calendar days; no historical user-id remap; constitution: no `db:push` on shared DBs; prefer reuse over new ledger

**Scale/Scope**: ~3k shipping labels; parity fix for public link complete; riders date-filter behavior; performance API enrichment + charts UI

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Multi-Database Migration Discipline | PASS | No schema change planned; behavior-only on existing models. If a migration becomes necessary, use `db:migrate:create` + `db:deploy:all` |
| II. Environment & Credential Isolation | PASS | No new secrets; existing Auth0 / rider sessions / env targets |
| III. Test & Typecheck Gates | PASS | Unit tests for sheet parse skip/upsert semantics, unmatched flags, riders open-task filter; mobile typecheck if API contract changes |
| IV. Production Deployment Safety | PASS | Plan does not push `main` or run prod deploy |
| V. Simplicity & Scope Discipline | PASS | Reuse `RiderDeliveryChargeRule`, `incentiveForOrder`, Recharts; no payroll ledger; charts limited to agreed v1 set |

**Post-design re-check:** Still PASS — contracts extend existing endpoints; upsert replaces deleteMany without new entities; link complete shares completion helper path where practical.

## Project Structure

### Documentation (this feature)

```text
specs/038-rider-performance-sync/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1
│   ├── admin-riders-performance.md
│   ├── admin-riders-orders.md
│   ├── admin-settings-rider-delivery-charges.md
│   └── public-rider-delivery-complete.md
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
app/api/admin/riders/performance/route.ts
app/api/admin/riders/[riderId]/orders/route.ts
app/api/admin/settings/rider-delivery-charges/route.ts
app/api/public/rider-delivery/[token]/route.ts
app/api/mobile/v1/deliveries/[id]/complete/route.ts
app/api/mobile/v1/me/performance/route.ts
lib/rider-delivery-charge.ts
lib/rider-incentive.ts
lib/rider-incentive-resolve.ts
lib/page-data/riders.ts
lib/format-datetime.ts
lib/mark-order-delivered.ts          # reuse / align if present
components/organisms/rider-performance-panel.tsx
components/organisms/rider-operations-panel.tsx
components/molecules/rider-delivery-charges-form.tsx
mobile/rider-app/…                   # only if me/performance response gains unmatched fields
```

**Structure Decision**: Extend the existing Cosmo OS Next.js + Prisma + rider-app layout. No new packages or apps. Charts via existing `recharts` dependency.

## Complexity Tracking

> No constitution violations requiring justification.
