# Implementation Plan: Rider App Performance & Incentives

**Branch**: `feature/rider-app-performance` | **Date**: 2026-07-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/027-rider-app-performance/spec.md`

## Summary

Give riders a dedicated mobile **Performance** tab that shows personal pay-period incentive (sum of shipping on eligible completions), completed/failed counts, and per-delivery lines—so they stop totaling shipping by hand. Ops set a **single payday day-of-month for all companies** in Cosmo OS Settings; pay periods roll from that day through the day before the next. Reuse existing incentive eligibility helpers from the admin riders performance feature; add a mobile `me/performance` API, singleton payday config, and light Route-tab today cue.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router + Expo React Native rider app)

**Primary Dependencies**: Next.js, Prisma, Zod, Auth0 (web) / rider mobile Bearer sessions, Expo Router tabs

**Storage**: Neon PostgreSQL via Prisma (vault + cosmo-dev + cosmo-prod); new singleton `RiderPayPeriodConfig`

**Testing**: Vitest (`lib` unit tests for pay-period math + incentive reuse); `npm run mobile:typecheck`

**Target Platform**: Cosmo OS web (settings + existing ops performance) + `mobile/rider-app` (iOS/Android via Expo)

**Project Type**: Web admin + mobile rider app sharing one Next.js API / schema

**Performance Goals**: Rider sees updated totals within ~30s of online sync; pay-period summary usable in &lt;10s from Route cue

**Constraints**: Server-side auth + Zod validation; riders see only own data; no invented pay window when payday unset; migrations via `db:migrate:create` + `db:deploy:all` (no `db:push` on shared DBs); simplicity (no incentive ledger)

**Scale/Scope**: One new mobile tab + settings field; ~1 mobile API + 1 admin settings API; fan-out across existing mobile tenants (cosmetics, vault)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Multi-Database Migration Discipline | PASS | New table via `db:migrate:create`; deploy all three DBs; no `db:push` on shared envs |
| II. Environment & Credential Isolation | PASS | No new secrets; uses existing rider session + RBAC |
| III. Test & Typecheck Gates | PASS | Unit tests for period helper; mobile typecheck required for tab/API client changes |
| IV. Production Deployment Safety | PASS | Plan does not push main or prod-deploy; human confirmation later |
| V. Simplicity & Scope Discipline | PASS | Singleton config + recompute aggregates; no payroll/ledger/leaderboard |

**Post-design re-check:** Still PASS — contracts stay thin; reuse `lib/rider-incentive.ts`; fan-out mirrors cash-summary.

## Project Structure

### Documentation (this feature)

```text
specs/027-rider-app-performance/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── mobile-me-performance.md
│   ├── admin-settings-rider-payday.md
│   └── admin-settings-page-data-rider-payday.md
└── tasks.md                 # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
prisma/
└── schema.prisma            # + RiderPayPeriodConfig

lib/
├── rider-incentive.ts       # reuse
├── rider-pay-period.ts      # NEW period window helper
└── validation.ts            # + payday Zod / LIMITS if needed

app/api/admin/settings/
├── rider-payday/route.ts    # NEW GET/PUT
└── page-data/route.ts       # extend with riderPayday

app/api/mobile/v1/me/
└── performance/route.ts     # NEW

components/                  # settings UI control for payday
app/(dashboard)/dashboard/...

mobile/rider-app/
├── app/(tabs)/_layout.tsx   # + performance tab
├── app/(tabs)/performance.tsx
├── app/(tabs)/deliveries.tsx  # today cue
├── app/(tabs)/completed.tsx   # per-row incentive display
└── src/hooks/use-*-performance*.ts
```

**Structure Decision:** Extend existing monorepo layout (Next.js API + `mobile/rider-app`). No new package or service.

## Complexity Tracking

> No constitution violations requiring justification.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Phase 0 / Phase 1 outputs

- [research.md](./research.md) — payday singleton, period math, mobile API, multi-tenant fan-out, settings UI
- [data-model.md](./data-model.md) — `RiderPayPeriodConfig` + derived DTOs
- [contracts/](./contracts/) — mobile performance + admin payday + page-data extension
- [quickstart.md](./quickstart.md) — validation scenarios

## Agent context update

No `.specify` agent-context update script is present in this repo; skipped. Downstream `/speckit-tasks` should use these artifacts directly.
