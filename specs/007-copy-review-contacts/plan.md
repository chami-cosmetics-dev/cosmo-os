# Implementation Plan: Copy Review Contacts for Follow-up

**Branch**: `007-copy-review-contacts` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-copy-review-contacts/spec.md`

## Summary

On Merchant Reviews, reviewers filter the Assigned Review Queue (merchant, status, dates, search), then use **Copy all contact numbers** to put call-ready phones on the clipboard and bulk-mark eligible orders **Follow up**. They continue calling outside Cosmo OS and finish each order via the existing Review Capture Form.

**Technical approach**: Client-side clipboard from the current `filteredOrders` set; after a successful `navigator.clipboard.writeText`, call a new bulk API that upserts `MerchantOrderReview.reviewStatus` to `follow_up` for company-scoped, eligible order IDs only. No schema migration — reuse existing status values and save paths. Gate with `merchant_reviews.manage`; toast summary of copied / updated / skipped counts; refresh queue state in place.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js as in repo

**Primary Dependencies**: Next.js, React, Prisma, Zod (`@/lib/validation`), Auth0 RBAC (`requirePermission`), Vitest, existing `notify` / action-loading UX

**Storage**: Neon PostgreSQL via Prisma — existing `MerchantOrderReview` / `Order` (no new models)

**Testing**: Vitest for eligibility helpers (phone present, status filter, skip rules) and response-count aggregation; manual UAT per quickstart

**Target Platform**: Cosmo OS web admin (Merchant Reviews at `/dashboard/contacts/reviews`)

**Project Type**: Web application (Next.js App Router + API routes)

**Performance Goals**: Copy + bulk mark for ≥50 (target up to ~500) filtered orders in under 15 seconds under normal network; one bulk request (not N individual PUTs)

**Constraints**: Server-side auth + Zod ID validation (never trust client status/eligibility alone); clipboard success gates persistence; Constitution — no prod deploy without confirmation; no schema change unless later proven necessary

**Scale/Scope**: One panel action + one bulk API + thin lib helper; queue already client-filtered (hundreds of rows in typical merchant views)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — no Prisma schema change; no `db:push` / migrate required |
| II. Environment & Credential Isolation | **Pass** — no new secrets; company-scoped via existing `requirePermission` companyId |
| III. Test & Typecheck Gates | **Pass** — Vitest for pure eligibility/count helpers; `npm test` before merge |
| IV. Production Deployment Safety | **Pass** — no auto push/deploy; feature is app code only |
| V. Simplicity & Scope Discipline | **Pass** — reuse panel + `MerchantOrderReview` + single-order save patterns; one bulk endpoint instead of looping client PUTs |

**Post-design re-check**: Still pass — no new tables; contract is one POST; clipboard stays browser-only; audit as one bulk event (optional per-order avoided for volume).

## Project Structure

### Documentation (this feature)

```text
specs/007-copy-review-contacts/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── copy-review-contacts.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
components/organisms/
└── merchant-review-panel.tsx          # Copy-all button + handler + queue refresh

lib/
├── merchant-order-reviews.ts          # Optional: markManyFollowUp helper
└── merchant-review-copy-contacts.ts   # Pure eligibility + clipboard text builder (+ Vitest)

app/api/admin/merchant-reviews/
├── orders/[id]/route.ts              # Existing per-order GET/PUT (unchanged behavior)
└── mark-follow-up/route.ts            # NEW bulk POST

lib/audit-log.ts                       # Add action key e.g. merchant_review_bulk_follow_up
lib/validation.ts                      # Optional: max batch size constant for orderIds[]
```

**Structure Decision**: Extend the existing Merchant Reviews UI and API namespace. Client owns clipboard; server owns durable Follow up transition. No page-data endpoint change required — queue is already in panel memory and updates after success.

## Complexity Tracking

> No constitution violations requiring justification.
