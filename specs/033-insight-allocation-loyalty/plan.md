# Implementation Plan: Customer Insight Allocation & Loyalty

**Branch**: `033-insight-allocation-loyalty` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/033-insight-allocation-loyalty/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Extend Customer Insight with allocation-aware visibility, updated loyalty milestones (Gold **75,000** / Platinum **200,000** inclusive), purchasing progress bar, allocated-customer filters (including Push to Gold/Platinum, birthday this month, brand), profile edit for owners, auto/manual/bulk allocation, and remakeable Mark Contacted that updates last-contacted + merchant dashboard metrics. Builds on existing `lib/customer-insight/*`, Contact Master `assignedMerchant` (display-name string), allocation APIs, and follow-up contacted audit patterns.

## Technical Context

**Language/Version**: TypeScript 5, Next.js App Router (Cosmo OS web)

**Primary Dependencies**: React client panel, Prisma, Zod (`@/lib/validation`), Auth0 + `requirePermission` / `requireAnyPermission` (`lib/rbac.ts`), existing `lib/customer-insight/*`, `lib/phone-lookup.ts`, contact allocation page-data, audit-log follow-up contacted

**Storage**: Neon PostgreSQL — extend/reuse `ContactMaster` (`assignedMerchant`, birth fields); reuse `ContactAllocationUpdate` + audit log for contacted; **no new tables required** if contacted stays audit-based (same as contact-updates). Brand via `ProductItem.vendor` → `Vendor.name` (and Adapt line metadata when present). Migration only if a denormalized brand cache is added later (deferred).

**Testing**: Vitest for loyalty thresholds 75k/200k (inclusive Platinum), Push filter bands, ownership visibility helpers, birthday-month match, brand resolution; manual quickstart for allocated vs non-allocated UI

**Target Platform**: Cosmo OS dashboard (web), mobile-responsive

**Project Type**: Web application (Next.js page + admin API routes)

**Performance Goals**: Phone insight &lt; 30s; allocated filter list capped/paginated (e.g. 25–50) sorted by lifetime total desc; avoid full Contact Master dump for merchants

**Constraints**: Server-side authZ + Zod; non-owners never receive owner-only DTO fields; filters only allocated set (admins all); Principle V — reuse allocation + follow-up patterns; update loyalty constants in place (replace 100k/250k)

**Scale/Scope**: One insight page enhancement; filter list endpoint; profile PATCH; allocation auto-hook + bulk transfer UI (may reuse/extend allocation panel); contacted from insight; brand join on filter queries

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Multi-Database Migration Discipline — PASS**: Prefer no schema change. If a migration is later required (e.g. brand denorm), use `npm run db:migrate:create` + `db:deploy:all` (never `db push` on shared DBs).
- **II. Environment & Credential Isolation — PASS**: No new secrets.
- **III. Test & Typecheck Gates — PASS**: Unit tests for tier/ownership/filter helpers; `npm test` / lint clean for changed files.
- **IV. Production Deployment Safety — PASS**: No push to `main` / prod migrate without explicit user request.
- **V. Simplicity & Scope Discipline — PASS**: Extend existing insight + allocation + follow-up; no parallel CRM; brand from Vendor join not a new brand entity unless proven necessary.

**Post-design re-check**: Still PASS — research R1–R9 resolve thresholds, ownership matching, brand source, contacted persistence, and auto-allocate identity without speculative tables.

## Project Structure

### Documentation (this feature)

```text
specs/033-insight-allocation-loyalty/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── insight-allocation-loyalty.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
lib/customer-insight/
  loyalty-tier.ts              # UPDATE thresholds 75_000 / 200_000 inclusive platinum
  ownership.ts                 # isAllocatedOwner(viewer, contact.assignedMerchant)
  visibility.ts                # strip owner-only fields for limited DTO
  progress-bar.ts              # milestone positions + amountToNext
  filters.ts                   # Push Gold/Platinum, birthday month, brand, sort by total
  brand.ts                     # resolve brand from ProductItem.vendor.name (+ Adapt)
  auto-allocate.ts             # set assignedMerchant when empty from recent purchase merchant
  load.ts                      # visibility-aware insight payload + lastContacted
  ...existing helpers

lib/rbac.ts                    # optional contacts.insight.manage; wire allocation.manage usage
lib/validation/customer-insight.ts  # profile patch, filter query Zod

app/api/admin/customer-insight/
  search/route.ts              # exact phone (existing)
  [contactId]/route.ts        # GET visibility-aware; PATCH profile (owner)
  [contactId]/contacted/route.ts  # POST mark contacted (owner)
  filter/route.ts              # GET allocated list + filters

# Auto-allocate: hook from order assign / contact sync paths
# Bulk transfer: extend app/api/admin/contacts/allocation (mode bulk) + UI path for permissioned users

app/(dashboard)/dashboard/customer-insight/
  customer-insight-panel.tsx   # owner vs limited UI; progress bar; filters; contacted; profile edit
```

**Structure Decision**: Extend Feature 032 Customer Insight in place. Reuse Contact Allocation APIs for manual/bulk assign (`contacts.allocation.manage`). Contacted via dedicated insight endpoint wrapping existing audit follow-up pattern so owners with `contacts.insight.read` need not get Contact Updates manage.

## Complexity Tracking

> No constitution violations requiring justification.
