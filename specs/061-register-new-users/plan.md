# Implementation Plan: Register New Users

**Branch**: `feature/new-user-register` | **Date**: 2026-09-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/061-register-new-users/spec.md`

**Note**: Spec directory stays `specs/061-register-new-users`. Git branch is `feature/new-user-register`. `.specify/feature.json` points at the spec dir.

## Summary

Staff (permission `contacts.register`) run a **today-only workbook**: set **location + one date range** once, then add name/phone/email/birthday. Phone match loads already-registered rows; save may mark **updated**. History is kept. Customers can submit **name/email/phone** via a **QR portal**. New Contact Master rows stay unallocated, get a time-bounded **location badge** on Insight, appear in admin **location filter/export** only if **created** here (not already-registered). New creates stay out of **dumps** until first purchase. ERP customer webhook **reuses** the OS row, **does not** overwrite OS email with a merchant mailbox, and **allocates** the still-unallocated OS contact to the creating merchant.

**Technical approach**: Prisma fields on `ContactMaster` + `OsRegistrationQr` + `OsRegistrationCapture`. Helpers in `lib/register-users/`. Staff APIs under `/api/admin/register-users`. Public `/register/[token]`. Extend insight filter/export, dump query, and `shouldAutoAllocateErpCustomer`. Details in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 (Next.js App Router)

**Primary Dependencies**: Next.js, React, Prisma, Zod (`@/lib/validation`), Auth0 `requirePermission`, existing phone lookup / `isSharedMerchantEmail` / insight filter + export, `qrcode` (staff QR data URL only)

**Storage**: Neon PostgreSQL via Prisma. **New migration required** (`npm run db:migrate:create` — never `prisma migrate dev` / `db push` on vault, cosmo-dev, cosmo-prod). Deploy with `npm run db:deploy:all` only when the user asks.

**Testing**: Vitest on register helpers, ERP allocate helper, dump-exclude, badge-window, capture outcome. `npm test` + lint on touched files. No rider-app files.

**Target Platform**: Cosmo OS web dashboard + public register portal. Rider app unchanged.

**Project Type**: Single full-stack Next.js web app

**Performance Goals**: Staff save + lookup in a few seconds (spec SC-001). Insight search badge is a field read, not a capture scan. Workbook today = one query by `captureDate`.

**Constraints**: Constitution I–V. Phone-first identity. Header not stored overnight. Portal has no Cosmo login. Do not grant Contact Master directory via this permission. No OS→ERP customer create.

**Scale/Scope**: One dashboard page, one public page, ~5 staff/portal routes, insight filter param, dump where-clause, ERP allocate predicate. Event-day hundreds of captures, not a full contact dump.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-research gate

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **PASS** — new models/fields only via `db:migrate:create`; deploy all DBs when user confirms |
| II. Environment & Credential Isolation | **PASS** — no new env secrets; portal token in DB; company-scoped |
| III. Test & Typecheck Gates | **PASS** — Vitest on helpers; no `mobile/rider-app` |
| IV. Production Deployment Safety | **PASS** — planning only; no prod push/deploy |
| V. Simplicity & Scope Discipline | **PASS** — reuse phone lookup, insight filter/export, dump builder, ERP webhook; two tables + CM stamps; one permission |

### Post-design gate

All gates remain **PASS** after Phase 1:

- [data-model.md](./data-model.md) — CM stamps + Qr + Capture; no extra service layer
- [contracts/register-new-users.md](./contracts/register-new-users.md) — staff + public portal + filter/dump/ERP
- [quickstart.md](./quickstart.md) — workbook, QR, filter, dump, ERP; no prod steps

## Project Structure

### Documentation (this feature)

```text
specs/061-register-new-users/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── register-new-users.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
prisma/schema.prisma
lib/rbac.ts
lib/register-users/
  phone.ts                 # wrap existing variants
  badge.ts                 # Colombo inclusive window
  outcome.ts               # created | already_registered | updated
  dump-exclude.ts
lib/erp-customer-auto-allocation.ts   # allow enriched/unchanged
lib/reports/contact-dump.ts
lib/customer-insight/filters.ts
lib/customer-insight/filter-options.ts
lib/customer-insight/serialize.ts     # osRegBadge
app/(dashboard)/dashboard/register-users/page.tsx
components/organisms/register-users-workbook.tsx
app/register/[token]/page.tsx
app/api/admin/register-users/route.ts
app/api/admin/register-users/page-data/route.ts
app/api/admin/register-users/lookup/route.ts
app/api/admin/register-users/qr/route.ts
app/api/register/[token]/route.ts
app/api/admin/customer-insight/filter/route.ts          # osRegLocation
app/api/admin/customer-insight/filter/export/route.ts
app/api/webhooks/erpnext/customer/route.ts              # allocate gate only
components/organisms/app-sidebar.tsx
```

**Structure Decision**: Same Next.js app as the rest of Cosmo OS. New `lib/register-users` for testable rules. Public portal mirrors `/invite/*`. No new app package.

## Complexity Tracking

> No constitution violations to justify.

## Phase 0 / Phase 1

- [research.md](./research.md) — R1–R11, no open NEEDS CLARIFICATION
- [data-model.md](./data-model.md)
- [contracts/register-new-users.md](./contracts/register-new-users.md)
- [quickstart.md](./quickstart.md)
- Agent context script: **skipped** (none in this repo)

Next: `/speckit-tasks`
