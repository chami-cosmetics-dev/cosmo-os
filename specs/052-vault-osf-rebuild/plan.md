# Implementation Plan: Supplement Vault Order Support File (OSF)

**Branch**: `052-vault-osf-rebuild` (not yet created) | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/052-vault-osf-rebuild/spec.md`

## Summary

Build a Supplement Vault-specific Order Support File generator that reports three
business units (SV / ORI / AE) side by side across a April-to-date monthly grid
of sales and purchases, with pricing and catalog data drawn live from the two
supplement ERPs.

The existing generator (`lib/osf/*`, `POST /api/admin/osf/generate`) is shaped
around the Cosmo tenant: rows come from the Vault OS `ProductItem` catalog,
sales are a single company-wide calendar-month figure read from the OS order
table, and roughly a third of the columns are Cosmo-only. SC-007 requires the
Cosmo workbook to be byte-for-byte unchanged, so this feature adds a parallel
generator under `lib/vault-osf/` and a new route rather than reshaping the
shared one. Genuinely shared pieces — ERP credential resolution, `Bin` stock
fetching, the reorder-point template and import — are reused as-is.

Three capabilities do not exist anywhere today and drive most of the work:
per-ERP-company sales attribution, an item-level pricing-rule resolver for the
discounted price, and a per-month purchase quantity/value grid. Two small schema
additions support them: an ERP company name on the OSF column config, and a
table to hold the manually imported April/May sales history.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 20, Next.js App Router + React 19

**Primary Dependencies**: Prisma (Neon PostgreSQL), `xlsx` for workbook output,
ERPNext/Frappe REST API over `fetch`, Auth0 for session and RBAC

**Storage**: Neon PostgreSQL via Prisma (Vault OS tenant database). Report data
is read live from ERPNext at generation time and is not cached or snapshotted.

**Testing**: Vitest (`npm test`) for pure reducer/formula units under `lib/`

**Target Platform**: Vercel-hosted Next.js server route producing an `.xlsx`
download

**Project Type**: Web application feature (server route + admin UI panel), no
mobile surface

**Performance Goals**: Full-catalog generation completes inside the Vercel
serverless function timeout. The dominant cost is paginated ERP reads: roughly
one `Bin` batch per warehouse group plus a full April-to-date scan of Sales
Invoice and Purchase Invoice lines in both ERPs.

**Constraints**:
- ERPNext child tables are not directly queryable by these API users, so all
  line-level reads must use the parent+child "fields-only join" pattern already
  proven in `lib/osf/erp-purchases.ts`.
- The current pagination guard is 500 rows × 60 pages = 30,000 lines. A
  multi-month retail sales scan can exceed that; see research decision R-004.
- Vault OS and Cosmo OS share one Prisma schema across three databases, so any
  schema change must follow Constitution Principle I.

**Scale/Scope**: Roughly 350 catalog rows in the current manual workbook; low
hundreds to low thousands of ERP items. Single-digit concurrent users (internal
purchasing team). Six month-groups today, growing by one per month until the
April rollover.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Multi-Database Migration Discipline | Pass, with required care | This feature adds a column to `OsfColumnConfig` and one new model. The migration MUST be authored with `npm run db:migrate:create` and deployed with `npm run db:deploy:all`; `prisma db push` is forbidden against the shared databases. Both additions are additive and nullable/new-table, so Cosmo and prod are unaffected at rest. |
| II. Environment & Credential Isolation | Pass | No new secrets and no new env keys. ERP credentials continue to come from `ErpnextInstance` rows scoped by `companyId`, so Vault credentials never leave the Vault database. |
| III. Test & Typecheck Gates | Pass | All arithmetic and reduction logic (month bucketing, sales/purchase accumulation, pricing-rule resolution, max sale, months of cover, reorder quantity) lands in pure functions under `lib/vault-osf/` with Vitest coverage. Network and Prisma calls stay in thin wrappers. |
| IV. Production Deployment Safety | Attention required | `npm run db:deploy:all` touches the live Cosmo production database. The implementing agent MUST get explicit in-the-moment confirmation before running it, even though this feature is Vault-only. |
| V. Simplicity & Scope Discipline | Pass, justified | A parallel `lib/vault-osf/` module duplicates some structure from `lib/osf/`. See Complexity Tracking. |

**Post-Phase 1 re-check**: Pass. The design added no further schema changes, no
new external services, and no feature flags. The one duplication risk is
recorded and bounded in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/052-vault-osf-rebuild/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── vault-osf-generate.md
│   ├── vault-osf-sales-import.md
│   └── vault-osf-workbook.md
├── checklists/
│   └── requirements.md  # Written by /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
lib/vault-osf/                      # New — Vault-only OSF logic
├── columns.ts                      # SV/ORI/AE column resolution + ERP company mapping
├── catalog.ts                      # Rows from ERP1 Item, enriched from ProductItem
├── erp-sales.ts                    # Sales Invoice line fetch + per-company month buckets
├── erp-purchases-monthly.ts        # Purchase Invoice line fetch + per-month qty/value
├── erp-pricing.ts                  # Standard Selling price + item-code Pricing Rule resolve
├── sales-history-import.ts         # April/May import parse + upsert
├── months.ts                       # April → as-of month window helpers
├── formulas.ts                     # max sale, months of cover, reorder qty
├── build-workbook.ts               # Column layout + xlsx emit
└── *.test.ts                       # Vitest units for every pure module above

lib/osf/                            # Existing — reused, not modified
├── erp-stock.ts                    # getAllOsfErpInstances, fetchBinActualQty, stockForColumn
├── erp-purchases.ts                # normalizeSupplierKey, buildSupplierAllowlist, isAllowedSupplier
├── rop-import.ts                   # ROP template build + import parse
└── column-config.ts                # resolveOsfColumns (extended read, see data-model)

app/api/admin/osf/vault/
├── generate/route.ts               # New — POST, returns .xlsx
└── sales-history/route.ts          # New — POST import, GET template

app/api/admin/osf/
├── rop-template/route.ts           # Existing — reused unchanged
└── rop-import/route.ts             # Existing — reused unchanged

components/organisms/
└── vault-osf-generate-panel.tsx    # New — generate + sales-history upload UI

app/(dashboard)/dashboard/purchasing/osf/page.tsx   # Existing — mount new panel

prisma/
├── schema.prisma                                   # + OsfColumnConfig.erpCompany, + OsfMonthlySalesHistory
└── migrations/<timestamp>_vault_osf/migration.sql  # Created via db:migrate:create

scripts/
└── seed-vault-osf-columns.mjs      # New — seed SV / ORI / AE columns for the Vault company
```

**Structure Decision**: Follow the repository's existing feature layout — pure
domain logic in `lib/<feature>/` with colocated Vitest files, HTTP handlers in
`app/api/admin/...`, and a single client panel in `components/organisms/`
mounted by the existing purchasing OSF page. Vault-specific logic is namespaced
under `lib/vault-osf/` so that nothing in `lib/osf/` needs to change behaviour
and the Cosmo workbook cannot regress.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Parallel `lib/vault-osf/` module alongside `lib/osf/` | SC-007 requires the Cosmo workbook to be byte-for-byte unchanged. The two reports now differ in row source (ERP items vs OS catalog), sales source (ERP invoices vs OS orders), sales shape (month grid × business vs one company total), and about a third of the columns. | Adding a tenant branch inside `lib/osf/build-workbook.ts` and `monthly-sales.ts` was rejected: every shared function would need a mode flag threaded through it, which is exactly the speculative-abstraction cost Principle V warns about, and any mistake silently changes a live Cosmo report. Duplication is bounded — stock fetching, ERP credential resolution, supplier allowlisting, and the entire ROP template/import flow are imported from `lib/osf/`, not copied. |
