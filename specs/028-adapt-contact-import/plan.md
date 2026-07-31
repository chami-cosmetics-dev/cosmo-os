# Implementation Plan: Adapt Sales Invoice Contact & Purchase History Import

**Branch**: `028-adapt-contact-import` | **Date**: 2026-07-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/028-adapt-contact-import/spec.md`

## Summary

One-time Cosmetics Cosmo OS migration: import Adapt sales-invoice CSV (**primary: `invoice_data_headers.csv`**, ~723 MB / 86 cols) into **Contact Master** (fill-blanks only) and **dedicated Adapt purchase-history records** (never Cosmo Orders), so merchants see Adapt-era purchases in the existing contact purchase-history UI.

**Technical approach**: New Prisma table `AdaptPurchaseHistory` keyed by Adapt invoice identity; ops CLI streaming CSV (pattern of `scripts/backfill-erp-customer-contacts.mjs`) with `--dry-run` / real run; reuse `findMatchingContacts` + best-match for phones; optional Adapt→Cosmo location map file (map `sales_location_id` / `location_name` e.g. “Head Office- Pepiliyana”); extend `GET /api/admin/contacts/[id]/orders` to merge Adapt history with source label.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js scripts (`.cjs`/`.mjs` or `tsx` as existing scripts use)

**Primary Dependencies**: Prisma, Zod (`@/lib/validation`), `xlsx` (already in package.json), existing `lib/phone-lookup.ts`, `lib/contact-identifiers.ts`, `lib/contact-master-sync.ts` patterns, Vitest

**Storage**: Neon PostgreSQL via Prisma — new `AdaptPurchaseHistory` (+ optional lightweight `AdaptLocationMapping` or JSON map file for one-time ops); migrate with `npm run db:migrate:create` + `npm run db:deploy:all`

**Testing**: Vitest for row classification, identity keys, best-match, fill-blanks, skip rules, idempotent upsert; manual UAT per [quickstart.md](./quickstart.md)

**Target Platform**: Cosmo OS (Cosmetics company) — Contact Master / Contact Updates UI + ops CLI on operator machine against target env

**Project Type**: Web application + one-time ops import script (no merchant self-serve import UI)

**Performance Goals**: Dry-run and real import of full Adapt export without blocking order queues; batch writes (e.g. 500–2000 rows) with resumable progress; contact purchase history API remains within existing ~200-item UX budget (paginate or cap Adapt rows similarly)

**Constraints**: Never create `Order` rows; fill-blanks-only on ContactMaster; company-scoped; Cosmetics only for v1; Constitution multi-DB migration discipline; no general admin import UI; prod deploy/migrate only with explicit user confirmation

**Scale/Scope**: ~700 MB / hundreds of thousands of invoice rows in `invoice_data_headers.csv`; one new table; one streaming CLI; small API + UI merge for history display; location map file

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — new table via `db:migrate:create`; deploy with `db:deploy:all` (or user-confirmed target deploys) before complete |
| II. Environment & Credential Isolation | **Pass** — script uses `npm run env:use <target>` / existing `.env`; Adapt file and mapping stay local; no secrets in repo |
| III. Test & Typecheck Gates | **Pass** — Vitest for pure import helpers; `npm test` before merge |
| IV. Production Deployment Safety | **Pass** — no auto push to `main`; prod import/migrate only with explicit user confirmation |
| V. Simplicity & Scope Discipline | **Pass** — dedicated history table (not Orders); CLI not in-app importer; JSON/CSV location map over speculative sync service |

**Post-design re-check**: Still pass — one primary table; reuse contact match helpers; UI is merge-into existing orders endpoint, not a new product surface.

## Project Structure

### Documentation (this feature)

```text
specs/028-adapt-contact-import/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── adapt-contact-import.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
prisma/schema.prisma
└── AdaptPurchaseHistory (+ ContactMaster relation)

lib/
├── adapt-import/
│   ├── columns.ts              # Header normalize + column map
│   ├── row-classify.ts         # Skip cancelled/deleted/no-id; parse dates/amounts
│   ├── contact-resolve.ts      # findMatchingContacts + best-match / ambiguous
│   ├── fill-blanks.ts          # ContactMaster fill-blanks patch builder
│   ├── location-map.ts         # Adapt location id/name → CompanyLocation
│   ├── invoice-identity.ts     # Unique Adapt invoice key
│   └── import-run.ts           # Dry-run / real batch orchestrator
├── adapt-import/*.test.ts
└── (extend) contact purchase history fetch used by API

scripts/
└── import-adapt-sales-invoices.mjs   # --company-id --file --dry-run --map --resume (pattern: backfill-erp-customer-contacts.mjs)

app/api/admin/contacts/[id]/orders/route.ts
└── Merge AdaptPurchaseHistory into response (source: "adapt")

components/organisms/
├── contacts-panel.tsx           # Show Adapt rows / source badge; no invoice deep-link for Adapt-only
└── contact-updates-panel.tsx    # Same purchase-history display rules
```

**Structure Decision**: Keep Cosmo as a single Next.js app. Persistence and matching logic live under `lib/adapt-import/` (testable). Operator entrypoint is a `scripts/` CLI modeled on `import-contacts.cjs`. Merchant visibility reuses the existing contact orders API/UI with a merged Adapt section—no new dashboard page for v1.

## Complexity Tracking

> No constitution violations requiring justification.
