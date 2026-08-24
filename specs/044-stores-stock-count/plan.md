# Implementation Plan: Store Stock Count

**Branch**: `044-stores-stock-count` | **Date**: 2026-08-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/044-stores-stock-count/spec.md`

**Note**: Filled by `/speckit-plan`. Workflow: `.specify/templates/plan-template.md`.

## Summary

Store worksheet: pick one or more **ERP companies** from this OS’s connected ERPs, load **all stock items** with **live company-wise on-hand**, scan/type barcodes to increment session counts, type counts by hand, show **difference = count − sum of selected companies’ live stock** (uncounted ≠ shortage). **No** ERP posting, **no** saved count documents.

**Technical approach**: New Store page + two APIs. List companies from ERP `Company`. Load **one ERP company per items request** (client loops) so serverless time stays inside `maxDuration = 60`. Catalog = paginated ERP `Item` (`disabled=0`, `is_stock_item=1`) + `Item Barcode`; stock = sum of `Bin.actual_qty` on that company’s non-group warehouses. Client holds counts; barcode match + difference are pure Vitest-covered helpers. Reuse `getAllOsfErpInstances`; do **not** reuse `fetchBinActualQty` (SKU-batched; too many round-trips for a full catalog).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 (Next.js App Router / repo tsconfig)

**Primary Dependencies**: Next.js, React, Prisma (read `ErpnextInstance` only), Zod (`lib/validation`), Auth0 via `requirePermission`, existing ERP token fetch pattern (`lib/osf/erp-stock.ts` credentials), `notify`

**Storage**: **No Prisma migration.** Counts are client session state. Read: `ErpnextInstance` (URLs/keys already stored), RBAC `Permission` upsert via `DEFAULT_PERMISSIONS` (existing seed, not a schema change). Live stock/items/barcodes from ERPNext over HTTP.

**Testing**: Vitest for scan match, difference, SKU merge, company-key helpers; `npm test` + lint on touched files; manual UAT per [quickstart.md](./quickstart.md)

**Target Platform**: Cosmo OS and Vault OS web dashboard (each tenant’s own two ERPs). Store nav. Keyboard-wedge scanner on the page.

**Project Type**: Single full-stack Next.js web app (rider app unchanged)

**Performance Goals**: Company picker ready on first paint (or immediately after one small GET). First selected company’s item list usable for scanning within **60s** of confirm under normal ERP latency. Full multi-company load is sequential per company with on-screen progress. Scan increment is client-only after load (**no** round-trip per beep). Table must stay interactive for several thousand rows (window the body; no new virtualization package unless UAT proves native table fails).

**Constraints**: Constitution I–V. No invented stock (ERP fail → unavailable, not 0). No ERP Stock Reconciliation / Stock Entry from this feature (FR-015). Session-only counts. `companyId` + ERP instance scoping. Secrets stay in existing instance rows / env files.

**Scale/Scope**: 2 ERP instances per OS; typically a handful of ERP companies selected; full stock-item catalog per instance (thousands of SKUs); one new permission; two routes; one panel.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-research gate

- **I. Multi-Database Migration Discipline — PASS**: No Prisma model/field. Permission catalog uses existing `ensureDefaultRbacSetup` upsert. No `db:migrate:create`, no `db:push` to shared DBs.
- **II. Environment & Credential Isolation — PASS**: Reuse per-tenant `ErpnextInstance` credentials. No new env keys, no secret copy.
- **III. Test & Typecheck Gates — PASS**: Vitest for match/difference/merge; CI scripts unchanged; no rider-app files.
- **IV. Production Deployment Safety — PASS**: Planning only; no prod deploy/push in this phase.
- **V. Simplicity & Scope Discipline — PASS**: Worksheet + compare only. No count history table, no warehouse picker, no ERP writeback. New `lib/store-stock-count/*` instead of overloading OSF `fetchBinActualQty`. No extra npm virtualization lib unless UAT requires it.

### Post-design gate

All gates remain **PASS** after Phase 1:

- [data-model.md](./data-model.md) is session + ERP read shapes — no new tables.
- [contracts/store-stock-count.md](./contracts/store-stock-count.md) is GET companies + POST items (one company per call); no mutate-ERP route.
- [quickstart.md](./quickstart.md) validates scan/difference/refresh; explicitly checks ERP stock unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/044-stores-stock-count/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── store-stock-count.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
app/(dashboard)/dashboard/store/stock-count/
└── page.tsx                              # auth gate + panel (optional initialCompanies)

components/organisms/
├── store-stock-count-panel.tsx           # NEW: companies, scan field, table, refresh
└── app-sidebar.tsx                       # Store group: allocation + stock count

lib/store-stock-count/
├── auth.ts                               # store.stock_count.read + requireStoreStockCountAccess
├── types.ts
├── company-key.ts                        # instanceId + erpCompany identity
├── difference.ts                         # count − stockSum; null if uncounted
├── difference.test.ts
├── match-scan.ts                         # unique / none / ambiguous
├── match-scan.test.ts
├── merge-items.ts                        # union SKUs; stockByCompany; keep counts
├── merge-items.test.ts
└── erp.ts                                # server-only: Company, Item, Item Barcode, Warehouse, Bin

app/api/admin/store-stock-count/
├── companies/route.ts                    # GET
└── items/route.ts                        # POST one company; maxDuration 60

lib/validation/store-stock-count.ts       # Zod for POST body
lib/rbac.ts                               # DEFAULT_PERMISSIONS + pin stores-level-01/02
lib/osf/erp-stock.ts                      # reuse getAllOsfErpInstances + OsfErpCredentials only
```

**Structure Decision**: Sibling of store location allocation under `/dashboard/store/*`. Dedicated ERP catalog/bin dump in `lib/store-stock-count/erp.ts` — OSF bin helper stays SKU-batched for purchasing. No new package, no rider-app, no Prisma schema.

## Complexity Tracking

> No constitution violations requiring justification.
