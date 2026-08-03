# Implementation Plan: Merchant Daily Book Note

**Branch**: `029-merchant-book-note` | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/029-merchant-book-note/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Shop merchants capture a daily physical book ledger in Cosmo OS (outlet/location, date, sales invoice, Cash/Card/KOKO/Bank splits including dual payments). Persist per `CompanyLocation` + Colombo posting date with same-day-only edits. POS/order typeahead fills full invoice number and editable amounts. Finance/admin (intern) retrieves saved days via authenticated GET in an intern-compatible payload shape. ERP verify/recon stays out of Cosmo.

## Technical Context

**Language/Version**: TypeScript 5, Next.js App Router (Cosmo OS web)

**Primary Dependencies**: React client panel, Prisma, Zod (`@/lib/validation`), Auth0 + `requirePermission` (`lib/rbac.ts`), `lib/format-datetime.ts` (Asia/Colombo)

**Storage**: Neon PostgreSQL — new `BookNoteDay` + `BookNoteRow` (migration via `npm run db:migrate:create`, deploy all targets)

**Testing**: Vitest for payment-column mapper, Colombo lock helper, Zod schemas; manual quickstart for UI/API

**Target Platform**: Cosmo OS dashboard (web)

**Project Type**: Web application (Next.js page + admin API routes)

**Performance Goals**: Order suggestions &lt; 5s typical (SC-007); single page-data fetch for merchant page; suggestion query limited (~20), indexed location+date filter

**Constraints**: Server-side authZ + Zod; no ERP calls from merchant page; no anonymous retrieve; Principle V — no finance edit UI / verify badges in v1

**Scale/Scope**: One merchant page; 4 API routes; ~tens of locations; ≤ ~500 rows/day; finance pull by day or ≤31-day range

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Multi-Database Migration Discipline — PASS**: New models require `npm run db:migrate:create` + `db:deploy:all` before done; never `db push` on vault/cosmo-dev/cosmo-prod.
- **II. Environment & Credential Isolation — PASS**: No new secrets; Auth0 session only.
- **III. Test & Typecheck Gates — PASS**: Unit tests for mapper + lock + validation; `npm test` / lint clean for changed files before merge.
- **IV. Production Deployment Safety — PASS**: Plan does not push `main` or prod-migrate without explicit user request.
- **V. Simplicity & Scope Discipline — PASS**: Capture + persist + retrieve only; reuse CompanyLocation (not Outlet link); no ERP verify rebuild; finance uses GET API not a second editor.

**Post-design re-check**: Still PASS — schema is two tables + replace-on-save; APIs follow existing admin + page-data patterns; research R1–R8 resolved outlet/invoice/autofill unknowns without speculative abstractions.

## Project Structure

### Documentation (this feature)

```text
specs/029-merchant-book-note/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1
│   └── book-notes.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
prisma/schema.prisma                          # BookNoteDay, BookNoteRow
prisma/migrations/<ts>_book_notes/            # via db:migrate:create

lib/rbac.ts                                   # book_notes.manage, book_notes.read + role defaults
lib/validation.ts                             # LIMITS + book-note Zod schemas
lib/book-notes/
  payment-columns.ts                          # mop/rawPayload → cash/card/koko/bank
  lock.ts                                     # Colombo same-day write gate
  order-suggestions.ts                        # search + autofill DTO
  serialize.ts                                # Day DTO / intern field names

app/api/admin/book-notes/
  page-data/route.ts                          # GET manage
  order-suggestions/route.ts                  # GET manage
  route.ts                                    # PUT manage + GET read

app/(dashboard)/dashboard/book-notes/
  page.tsx                                    # server shell + nav permission
  book-notes-panel.tsx                        # client ledger UI

components/… or inline panel                   # match existing dashboard patterns
# nav: existing sidebar/nav config gated by book_notes.manage
```

**Structure Decision**: Stay in Cosmo OS Next.js app — Prisma models, `lib/book-notes/*` helpers, admin API routes, one dashboard page. No mobile, no ERP desk port.

## Complexity Tracking

> No constitution violations requiring justification.
