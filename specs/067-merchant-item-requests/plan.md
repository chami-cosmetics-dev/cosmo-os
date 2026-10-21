# Implementation Plan: Merchant New Item Requests

**Branch**: `feature/067-merchant-item-requests` | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/067-merchant-item-requests/spec.md`

**Note**: Spec directory stays `specs/067-merchant-item-requests`. Git branch at plan time was `feat/master-order-item-reports`. Implementation should use `feature/067-merchant-item-requests`.

## Summary

Merchants log customer asks for items the company may not sell yet. They pick or type a brand (existing vendors suggest and show uploaded priority; unknown names are new), add a description, optional other-store link, optional photo. Manage users see only their own requests. Purchasing admins see a brand-wise dashboard with open counts, drill into each ask, mark **already have** or **closed** (status only, no SKU), upload a brand-priority file, and export. Inbox only — no Item Creation, ERP, or Shopify writes.

**Technical approach**: New `NewItemRequest` and `NewItemRequestBrandPriority` tables. Two permission keys. One page at `/dashboard/new-item-requests`. Vendor list for suggestions. Cloudinary for the photo. Sheet parse + xlsx export. Details in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 (Next.js App Router)

**Primary Dependencies**: Next.js, React, Prisma, Zod, Auth0 via `requireAnyPermission` / `hasPermission`, Cloudinary (`cloudinary.uploader.upload`), `xlsx` for priority parse and export

**Storage**: New `NewItemRequest` and `NewItemRequestBrandPriority`. Migration via `npm run db:migrate:create`. Deploy with `npm run db:deploy:all` only when the user asks. Image URL on the request row. Priority list replaced in one transaction. Vendor is read-only.

**Testing**: Vitest for brand normalize/match, priority parse, status transitions, and own-row scoping helpers. `npm test` and lint on touched files. Manual UAT in [quickstart.md](./quickstart.md). No rider-app change, so no mobile typecheck unless a shared type is touched.

**Target Platform**: Cosmo OS web dashboard. Vault OS has no extra hide; unassigned permissions keep it off.

**Project Type**: Single full-stack Next.js web app

**Performance Goals**: Merchant submits in under 2 minutes (SC-001). Brand suggest after 2 characters, cap 15, one Vendor query. Admin dashboard one grouped query, not one query per brand. First page load uses server `initial*` props (page-data rule).

**Constraints**: Constitution I–V. Inbox only (FR-015). Already-have is status only (FR-010). Manage cannot read others’ rows even by id. No `prisma db push` against vault / cosmo-dev / cosmo-prod. No prod deploy from this plan.

**Scale/Scope**: One page, two sidebar entries to the same URL, ~10 API routes, two tables. Manage list cap 300. Brand drill-in cap 500. Export cap 5_000.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-research gate

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **PASS** — one migration created with `npm run db:migrate:create`. Deploy only when the user confirms. No `prisma db push` against vault, cosmo-dev, or cosmo-prod. |
| II. Environment & Credential Isolation | **PASS** — Cloudinary and Auth0 already configured per env. No new secrets. |
| III. Test & Typecheck Gates | **PASS** — Vitest for the pure rules. Lint on touched files. No mobile change. |
| IV. Production Deployment Safety | **PASS** — planning only. No prod deploy, push, or database deploy in this command. |
| V. Simplicity & Scope Discipline | **PASS** — two tables, two permission keys, one page. Reuse Vendor, Cloudinary profile-photo upload, xlsx parse/export, `requireAnyPermission`. No Item Creation hook. No SKU matcher. No notifications. |

### Post-design gate

All gates remain **PASS** after Phase 1:

- [data-model.md](./data-model.md) — request row + replaceable priority list; existing/new frozen on the request, live on the brand group
- [contracts/merchant-item-requests.md](./contracts/merchant-item-requests.md) — suggest, create, list, brand drill-in, status, export, priority
- [quickstart.md](./quickstart.md) — unit checks plus staff UAT; no prod deploy step

## Project Structure

### Documentation (this feature)

```text
specs/067-merchant-item-requests/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── merchant-item-requests.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
prisma/schema.prisma
prisma/migrations/<timestamp>_new_item_requests/

lib/rbac.ts                                      # two DEFAULT_PERMISSIONS + manager admin key
lib/new-item-requests/permissions.ts             # keys, canAdmin / canManage
lib/new-item-requests/brand.ts                   # normalize, vendor match, suggest
lib/new-item-requests/brand.test.ts
lib/new-item-requests/priority-parse.ts          # xlsx/csv → rows
lib/new-item-requests/priority-parse.test.ts
lib/new-item-requests/status.ts                  # open → already_have | closed
lib/new-item-requests/status.test.ts
lib/new-item-requests/store.ts                   # create, list, scope, group, export rows
lib/validation/new-item-requests.ts              # Zod + LIMITS

components/organisms/new-item-request-form.tsx
components/organisms/new-item-request-own-list.tsx
components/organisms/new-item-request-brand-board.tsx
components/organisms/new-item-request-panel.tsx  # role switch
components/organisms/app-sidebar.tsx             # two slots, one href

app/(dashboard)/dashboard/new-item-requests/page.tsx
app/api/new-item-requests/route.ts               # GET list, POST create
app/api/new-item-requests/[id]/route.ts
app/api/new-item-requests/[id]/status/route.ts
app/api/new-item-requests/brands/suggest/route.ts
app/api/new-item-requests/brands/[brandNormalized]/route.ts
app/api/new-item-requests/export/route.ts
app/api/new-item-requests/priority/route.ts
```

**Structure Decision**: Keep the feature next to other dashboard products, not inside `lib/item-creation/`. Merchants never need that module. Draft form state stays in the browser until submit. Submitted rows are the new tables.

## Complexity Tracking

None. Constitution Check has no violations to justify.

## Agent context

No `.specify/scripts/**/update-agent-context*` script in this repo (same skip as `066-shop-item-requests`). Context is this plan plus [research.md](./research.md), [data-model.md](./data-model.md), and [contracts/merchant-item-requests.md](./contracts/merchant-item-requests.md).
