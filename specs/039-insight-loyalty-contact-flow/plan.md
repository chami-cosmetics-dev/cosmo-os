# Implementation Plan: Insight Filters, Merchant Dash & Loyalty Contact Flow

**Branch**: `039-insight-loyalty-contact-flow` | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/039-insight-loyalty-contact-flow/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Extend Customer Insight filters (birthday range, min-only total, last-contacted range, brand A–Z + search, item ± brand + search, loyalty registration date, no-purchase free range; remove push/loyalty quick filters), gate Merge Contact behind new `contacts.merge`, make contact updates append-only with **remark** (and outcome) history, add merchant-dashboard loyalty-outreach card + Responded/Not responded flow into a queue for `contacts.master.manage` Gold/Platinum assignment, surface call-center performance + date ranges on merchant dash, hide Daily/Top Lifetime cards behind opt-in, and log Insight / Merchant Dashboard actions in Audit Trail. Reuse existing `lib/customer-insight/*`, `ContactAllocationUpdate`, Contacts RBAC, and merchant page-data — add a focused Prisma migration for remark/outcome + persisted loyalty assignment.

## Technical Context

**Language/Version**: TypeScript 5, Next.js App Router (Cosmo OS web)

**Primary Dependencies**: React client panels (`customer-insight-panel.tsx`, `merchant-dashboard-panel.tsx`), Prisma, Zod (`lib/validation/customer-insight.ts`, merchant-dashboard validation), Auth0 + `requirePermission` / `requireAnyPermission` (`lib/rbac.ts`), `lib/audit-log.ts`, existing call-center performance chart + allocation performance API

**Storage**: Neon PostgreSQL (vault / cosmo-dev / cosmo-prod). **Migration required** via `npm run db:migrate:create` then `db:deploy:all`: extend `ContactAllocationUpdate` with `remark` (+ optional `outcome`); persist master loyalty assignment on `ContactMaster` (tier, assignedAt, assignedByUserId, outreach status). No `db push` on shared DBs.

**Testing**: Vitest for filter helpers (birthday wrap, min-only total, last-contacted, no-purchase range, brand/item intersection, loyalty registration range), loyalty outreach state machine, merge permission gate, threshold assignment validation; manual quickstart for UI flows

**Target Platform**: Cosmo OS dashboard (web), mobile-responsive

**Project Type**: Web application (extend existing insight + merchant dashboard + contacts APIs)

**Performance Goals**: Filter list remains capped/paginated (existing ~800 candidate / page-size 50 pattern); filter-options (brands/items) searchable client or server with reasonable caps; merchant page-data stays one authenticated payload where practical; call-center merchant scope reuses existing performance aggregator with merchant filter

**Constraints**: Server-side authZ + Zod; `contacts.merge` never implied by `contacts.manage`; non-allocated visibility rules unchanged; Principle V — extend helpers/UI, no parallel CRM; Constitution I for any schema change

**Scale/Scope**: One insight panel + filter API overhaul; merge API; contact history remark; merchant dash card/filter/date-range/call-center; master assignment queue UI (insight or contacts area); audit module/action additions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Multi-Database Migration Discipline — PASS (with migration)**: Schema changes use `npm run db:migrate:create` + deploy to all three DBs before complete; never `prisma db push` on vault/cosmo-dev/cosmo-prod.
- **II. Environment & Credential Isolation — PASS**: No new secrets.
- **III. Test & Typecheck Gates — PASS**: Unit tests for pure filter/loyalty/outreach helpers; `npm test` / lint clean for changed files; no mobile app changes expected.
- **IV. Production Deployment Safety — PASS**: Plan does not push `main` or prod-migrate without explicit user request.
- **V. Simplicity & Scope Discipline — PASS**: Extend existing insight filters, `ContactAllocationUpdate` history, Contacts permissions, merchant page-data, and audit-log enums — no new roles, no parallel contact system.

**Post-design re-check**: Still PASS — research R1–R10 resolve thresholds, permissions, history, merge, merchant date range, and audit modules without unjustified abstraction.

## Project Structure

### Documentation (this feature)

```text
specs/039-insight-loyalty-contact-flow/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1
│   ├── insight-filters-merge.md
│   ├── loyalty-outreach-assignment.md
│   └── merchant-dash-call-center.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
lib/rbac.ts                              # ADD contacts.merge to DEFAULT_PERMISSIONS (+ admin template)
lib/audit-log.ts                         # ADD modules customer-insight, merchant-dashboard + actions
lib/validation/customer-insight.ts       # Filter/query Zod: ranges, itemId, drop push/loyalty
lib/customer-insight/filters.ts          # Birthday range, lastContacted range, noPurchase range, item filter
lib/customer-insight/filter-options.ts   # Brands A–Z + items (optional brand scope) + search
lib/customer-insight/loyalty-tier.ts     # Keep live Gold/Platinum mins; remove push-filter usage from UI/API
lib/customer-insight/contacted.ts        # Remark + outcome on ContactAllocationUpdate; history list helper
lib/customer-insight/loyalty-outreach.ts # NEW: eligibility, states, assignment validation
lib/customer-insight/merge.ts            # NEW: merge two contacts under contacts.merge
lib/page-data/merchant-dashboard.ts      # Opt-in cards, loyalty card, call-center slice, date range
lib/page-data/merchant-dashboard-sales.ts
lib/page-data/merchant-dashboard-loyalty.ts  # NEW: nearest-bdays-style loyalty outreach list

app/api/admin/customer-insight/filter/route.ts
app/api/admin/customer-insight/filter-options/route.ts  # brands + items
app/api/admin/customer-insight/merge/route.ts           # NEW POST
app/api/admin/customer-insight/[contactId]/contacted/route.ts
app/api/admin/customer-insight/[contactId]/contact-history/route.ts  # NEW GET
app/api/admin/customer-insight/loyalty-queue/route.ts   # NEW GET (master)
app/api/admin/customer-insight/[contactId]/loyalty-assign/route.ts  # NEW POST

app/api/admin/merchant-dashboard/page-data/route.ts     # richer query + payload
app/api/admin/contacts/allocation/performance/route.ts # merchant-scoped reuse

app/(dashboard)/dashboard/customer-insight/
  customer-insight-panel.tsx             # filters UI, merge, history, loyalty badge who/when
app/(dashboard)/dashboard/merchant/
  merchant-dashboard-panel.tsx           # opt-in cards, loyalty card, call-center, date range

prisma/schema.prisma                     # ContactAllocationUpdate.remark/outcome; ContactMaster loyalty fields
```

**Structure Decision**: Single Next.js Cosmo OS app — extend existing insight, merchant dashboard, RBAC, and audit surfaces; one Prisma migration for history remark + loyalty assignment persistence.

## Complexity Tracking

> No constitution violations requiring justification.
