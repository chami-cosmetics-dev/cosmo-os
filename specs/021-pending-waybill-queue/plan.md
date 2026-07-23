# Implementation Plan: Pending Waybill Queue

**Branch**: `021-pending-waybill-queue` | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/021-pending-waybill-queue/spec.md`

## Summary

Extend existing Waybill Lookup so courier file uploads are **cumulative** (with visible upload history), each imported row is **mapped to an OS order** when the invoice/reference matches, and a **pending waybills list** shows only unmatched rows plus matched rows whose order is not delivery-complete—hiding completed deliveries from the working queue while keeping them searchable.

**Technical approach**: Reuse `OrderWaybill` + `WaybillUpload` (no new tables). Fix import to resolve `orderId` via shared invoice-candidate matching already used in `findOrderWaybillsByInvoice`. Add rematch for `orderId IS NULL` on page-data load / after import. Add aggregated `GET /api/admin/waybills/page-data` (pending list + upload history + pagination). Extend `waybill-lookup.tsx` with pending table, details dialog, and upload history. Existing search/import routes stay; import must not delete prior rows (already true—clarify UX).

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js as in repo

**Primary Dependencies**: Next.js, React, Prisma, Zod (`@/lib/validation`), Auth0 RBAC (`requireAnyPermission` / existing `fulfillment.waybill_lookup.*`), `xlsx` (existing import), Vitest, `notify` / action-loading UX

**Storage**: Existing Neon PostgreSQL tables `OrderWaybill`, `WaybillUpload` via Prisma/raw SQL patterns in `lib/order-waybills.ts`. Prefer **no schema migration** unless pending-list query needs a supporting index (see research R4). If an index is added: `npm run db:migrate:create` + `npm run db:deploy:all`.

**Testing**: Vitest for pending-filter predicate, invoice-candidate normalization, rematch eligibility; manual UAT per [quickstart.md](./quickstart.md)

**Target Platform**: Cosmo OS / Vault OS web admin — `/dashboard/fulfillment/waybill-lookup`

**Project Type**: Web application (Next.js App Router + API routes)

**Performance Goals**: Pending list first page within 5s for ≤2,000 pending rows (SC-002); page-data one auth check + parallel queries; rematch batch capped (e.g. unmatched subset on page load, not unbounded full-table scan every request)

**Constraints**: Server-side auth + Zod on new endpoints; company-scoped queries; no hard-delete of delivery-complete waybills; reuse existing permissions (no new RBAC keys); Constitution multi-DB migration discipline if schema changes; keep import row limit 10k and CSV/XLSX/XLS support

**Scale/Scope**: One existing page enhanced; ~1–2 new API routes (page-data; optional rematch POST); extend `lib/order-waybills.ts` + UI panel; no mobile changes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — default path uses existing tables (no migration). If index migration is required, use `db:migrate:create` + `db:deploy:all` only with explicit user confirmation |
| II. Environment & Credential Isolation | **Pass** — no new secrets; company-scoped waybill/order queries |
| III. Test & Typecheck Gates | **Pass** — Vitest for pure match/pending helpers; `npm test` before merge |
| IV. Production Deployment Safety | **Pass** — no auto push/deploy; any `db:deploy:*` only with explicit confirmation |
| V. Simplicity & Scope Discipline | **Pass** — extend Waybill Lookup; no new sidebar module, no new tables, no soft-delete UI in v1 |

**Post-design re-check**: Still pass — contracts reuse permissions and entities; pending list is a filtered read over existing `OrderWaybill` joined to `Order.deliveryCompleteAt`; mapping reuses invoice-candidate logic already in `lib/order-waybills.ts`.

## Project Structure

### Documentation (this feature)

```text
specs/021-pending-waybill-queue/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── pending-waybill-queue.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
lib/
├── order-waybills.ts              # Extract findOrderByInvoiceRef; save with orderId; rematchUnmatched; listPending
├── order-waybills.test.ts         # Pending filter + normalize + rematch rules
└── page-data/waybill-lookup.ts    # Aggregated pending + uploads query helpers (optional split)

app/api/admin/waybills/
├── import/route.ts                # Resolve orderId on import; accurate unmatchedRows; keep cumulative upsert
├── search/route.ts                # Unchanged behavior (all waybills searchable)
├── page-data/route.ts             # NEW: pending list + upload history + optional rematch
└── rematch/route.ts               # OPTIONAL: POST rematch unmatched (or fold into page-data)

app/(dashboard)/dashboard/fulfillment/waybill-lookup/page.tsx
  # Optional: server-fetch initial page-data → pass as initialData

components/organisms/fulfillment-pages/waybill-lookup.tsx
  # Upload history table; pending waybills table; details dialog; keep search + import
```

**Structure Decision**: Stay inside existing fulfillment Waybill Lookup surface. Prefer one `page-data` endpoint per performance rule. Extend `lib/order-waybills.ts` rather than a parallel module until helpers exceed a clear second consumer.

## Complexity Tracking

> No constitution violations requiring justification.
