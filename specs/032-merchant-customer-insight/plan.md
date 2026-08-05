# Implementation Plan: Merchant Customer Insight

**Branch**: `032-merchant-customer-insight` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/032-merchant-customer-insight/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Merchants look up a single customer by phone and see identity, loyalty group (Standard / Gold `loyalcs` / Platinum `loyalcs2` from lifetime placed-order totals), invoice history (Cosmo `Order` + Adapt `AdaptPurchaseHistory`), item and frequency insights, and Recharts visualizations — all view-only. Access is gated by a new `contacts.insight.read` permission so merchants never receive Contact Master list/export/import rights. Totals and tiers are computed on read (no new Prisma models); reuse existing phone-lookup and contact–order join helpers.

## Technical Context

**Language/Version**: TypeScript 5, Next.js App Router (Cosmo OS web)

**Primary Dependencies**: React client panel, Prisma, Zod (`@/lib/validation`), Auth0 + `requirePermission` (`lib/rbac.ts`), existing `lib/phone-lookup.ts` / `lib/contact-purchase-lookup.ts` / `lib/contact-identifiers.ts`, Recharts via `components/ui/chart.tsx`

**Storage**: Neon PostgreSQL — **read-only** against existing `ContactMaster`, `ContactPhone`, `Order`, `OrderLineItem`, `AdaptPurchaseHistory`. No new tables/migrations for v1.

**Testing**: Vitest for loyalty-tier classifier, lifetime-total aggregation rules (exclude cancelled), phone-search result capping; manual quickstart for merchant UI/API

**Target Platform**: Cosmo OS dashboard (web), mobile-responsive

**Project Type**: Web application (Next.js page + admin API routes)

**Performance Goals**: Phone search + insight load usable in &lt; 30s end-to-end (SC-001); single aggregated insight fetch after contact selection; invoice history paginated (default page size ~25–50); search matches hard-capped (≤10)

**Constraints**: Server-side authZ + Zod; merchants MUST NOT use `contacts.page-data`, export, or import; no write/mutate APIs; Principle V — derive group on read, no speculative CRM sync to ERP `loyalcs` tags; no mobile app work

**Scale/Scope**: One merchant page; 2–3 API routes; one contact at a time; histories may be large (paginate); company-scoped data only

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Multi-Database Migration Discipline — PASS**: v1 adds no Prisma schema/migrations. If a later iteration caches lifetime totals, must use `npm run db:migrate:create` + `db:deploy:all` (never `db push` on vault/cosmo-dev/cosmo-prod).
- **II. Environment & Credential Isolation — PASS**: No new secrets; Auth0 session + existing RBAC only.
- **III. Test & Typecheck Gates — PASS**: Unit tests for tier + total helpers; `npm test` / lint clean for changed files before merge. No `mobile/rider-app` changes.
- **IV. Production Deployment Safety — PASS**: Plan does not push `main` or prod-migrate without explicit user request.
- **V. Simplicity & Scope Discipline — PASS**: Search + read insight only; reuse phone/order lookup libs; compute loyalty on read; no Contact Master permission reuse; no ERP group write-back; Recharts already in tree.

**Post-design re-check**: Still PASS — no schema; dedicated insight permission + capped search + aggregated insight DTO; charts via existing Recharts wrapper; research R1–R8 resolve data/permission unknowns without new abstractions beyond a small `lib/customer-insight/*` helper module.

## Project Structure

### Documentation (this feature)

```text
specs/032-merchant-customer-insight/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1
│   └── customer-insight.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
lib/rbac.ts                                   # contacts.insight.read + default role wiring
lib/validation.ts                             # phone search / insight query Zod (cuid, limits)
lib/customer-insight/
  loyalty-tier.ts                             # thresholds → standard|gold|platinum + labels
  lifetime-total.ts                           # sum Orders (non-cancelled) + Adapt ttlAmount
  frequency.ts                                # order count, avg gap, series buckets
  top-items.ts                                # aggregate OrderLineItem + Adapt lineItems JSON
  serialize.ts                                # insight DTO builders

app/api/admin/customer-insight/
  search/route.ts                             # GET ?phone= → capped matches (no directory)
  [contactId]/route.ts                       # GET insight + optional ?invoicesPage=
  # optional thin page-data if nav needs static copy only — prefer search + [id]

app/(dashboard)/dashboard/customer-insight/
  page.tsx                                    # server shell, requirePermission, PermissionDeniedCard
  customer-insight-panel.tsx                  # search UI, match picker, summary, tables, charts

components/organisms/app-sidebar.tsx          # nav item gated by contacts.insight.read
# charts: components/ui/chart.tsx + recharts (existing)
```

**Structure Decision**: Stay in Cosmo OS Next.js app — thin `lib/customer-insight/*` helpers, dedicated admin API under `customer-insight/` (not `contacts/`), one dashboard page. Do not extend Contact Master list/export APIs. No mobile, no ERP mutations.

## Complexity Tracking

> No constitution violations requiring justification.
