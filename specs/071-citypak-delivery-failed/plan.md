# Implementation Plan: CityPak Delivery Failed Reminders

**Branch**: `071-citypak-delivery-failed` | **Date**: 2026-11-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/071-citypak-delivery-failed/spec.md`

## Summary

When a matched CityPak waybill’s stored courier status is **attempt failed** (CityPak “NOT DELIVERED”), surface that order in the reminder bubble under **City Pack Delivery Failed**, scoped merchant-wise. Personal MER ownership reuses existing reminder ownership helpers; **DM-only** orders go to merchants who hold DM coupon codes (operationally Sandali / MER115). Click opens Fulfillment **Waybill Details** via a new `waybillId` deep-link on waybill-lookup. Email send stays out of scope. No new Prisma models — query existing `OrderWaybill.rawPayload.citypakStatus`.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js App Router  
**Primary Dependencies**: React, Prisma, existing task-reminder stack (`lib/task-reminders.ts`, `lib/reminder-permissions.ts`, `lib/task-reminder-access.ts`, `components/molecules/task-reminder-bubbles.tsx`), CityPak status helpers (`lib/citypak-api.ts`, `lib/citypak-waybill-status.ts`), merchant/DM helpers (`lib/merchant-dm-sales.ts`, `merchantOwnsReminderOrder`)  
**Storage**: Neon PostgreSQL via Prisma — **no new tables**; read `OrderWaybill` (`source = citypak_api`, matched `orderId`, `rawPayload.citypakStatus = attempt_failed`) + linked `Order` for merchant attribution  
**Testing**: Vitest — ownership/DM attribution filters, reminder mapper, href/deep-link param helpers, status eligibility  
**Target Platform**: Cosmo OS web (`os.cosmetics.lk`); Vault OS only if same reminder stack ships there (no Vault-specific work)  
**Project Type**: Web application (Next.js monolith)  
**Performance Goals**: Reminder fetch stays within existing bubble load budget; category list capped like other tabs (`REMINDER_LIMIT_PER_CATEGORY`); JSON-path filter on `OrderWaybill` + merchant filter in memory/SQL as needed  
**Constraints**: No email; no new CityPak API calls from reminder fetch (use last stored status); merchant isolation; constitution migration rules (none required); prod deploy only with explicit user OK  
**Scale/Scope**: One new reminder category + permission + UI labels + waybill-lookup deep-link open of existing details dialog

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Multi-Database Migration Discipline | PASS | No schema/migration — reuse `OrderWaybill.rawPayload` stamped by existing CityPak status sync |
| II. Environment & Credential Isolation | PASS | Reuse existing CityPak account tokens; reminder path does not call CityPak or add secrets |
| III. Test & Typecheck Gates | PASS | Unit tests for eligibility, ownership/DM, href; `npm test` + lint on touched files before merge |
| IV. Production Deployment Safety | PASS | Plan only; no prod push/`db:deploy` from this work |
| V. Simplicity & Scope Discipline | PASS | Extend existing reminder category pattern; one deep-link param; defer email |

**Post-design re-check**: Still PASS — no migration; DM attribution via coupon codes (not hardcoded user id); Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/071-citypak-delivery-failed/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── citypak-delivery-failed.md
└── tasks.md                 # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
lib/reminder-permissions.ts              # + citypak_delivery_failed permission + label
lib/task-reminder-access.ts              # category list / canSee
lib/task-reminders.ts                    # TaskReminderCategory + fetch/map + wire into aggregate
lib/task-reminder-links.ts               # + waybillId query param helper
lib/merchant-dm-sales.ts                 # reuse isDmOnlyMerchantTracking / isDmCouponCode (no change unless tiny helper)
lib/citypak-api.ts                       # reuse CITYPAK_WAYBILL_SOURCE, attempt_failed, readCitypakWaybillStatus
components/molecules/task-reminder-bubbles.tsx   # CATEGORY_ORDER + labels
components/organisms/fulfillment-pages/waybill-lookup.tsx  # open details when ?waybillId=
app/api/admin/task-reminders/…           # only if route types need category union updates (likely covered by lib)
lib/task-reminders.test.ts               # new cases
lib/task-reminder-links.test.ts          # if present / add
lib/task-reminder-access.test.ts         # permission visibility
```

**Structure Decision**: Single Next.js app. Mirror `merchant_dispatch_pending` / `delivery_pending` reminder plumbing. Deep-link into existing waybill-lookup details dialog — no new page.

## Complexity Tracking

> No constitution violations requiring justification.

## Phase 0 / Phase 1 outputs

- [research.md](./research.md) — decisions (status key, ownership, DM→Sandali, deep-link, no migration, agent-context skip)
- [data-model.md](./data-model.md) — entities/fields/state (logical; no new Prisma models)
- [contracts/citypak-delivery-failed.md](./contracts/citypak-delivery-failed.md) — reminder item shape + deep-link contract
- [quickstart.md](./quickstart.md) — UAT validation scenarios

## Agent context update

No `.specify/scripts/**/update-agent-context*` script in this repo (same skip as `067-merchant-item-requests`). Context is this plan plus [research.md](./research.md), [data-model.md](./data-model.md), and [contracts/citypak-delivery-failed.md](./contracts/citypak-delivery-failed.md).
