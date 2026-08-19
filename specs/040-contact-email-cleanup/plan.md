# Implementation Plan: Contact Email Cleanup & Insight Display

**Branch**: `040-contact-email-cleanup` | **Date**: 2026-08-12 (clarify sync) | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/040-contact-email-cleanup/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Give staff a Contacts **email cleanup** tool to list and clear (1) invalid-format emails on **primary or secondary** aliases and (2) cosmetics/cosmatics-pattern matches — clearing **only matching** bad addresses per contact, promoting a valid secondary to primary when needed, with confirm + audit — without deleting customers. On Customer Insight, always show the email row: **Mail icon + full address** when present, `-` when absent. Reuse `ContactMaster` / `ContactEmail` / `writeAuditLog`; **no Prisma migration**. Invalid detection is **format-only** (no mailbox probing).

## Technical Context

**Language/Version**: TypeScript 5, Next.js App Router (Cosmo OS web)

**Primary Dependencies**: React dashboard panels, Prisma, Zod (`lib/validation` emailSchema), Auth0 + `requireAnyPermission` (`lib/rbac.ts`), `lib/audit-log.ts`, `lib/contact-identifiers.ts` (`normalizeContactEmail`, `listContactEmails`)

**Storage**: Neon PostgreSQL (vault / cosmo-dev / cosmo-prod). **No schema migration** — mutate existing `ContactMaster.email` + `ContactEmail` rows; audit via `AuditLog`

**Testing**: Vitest for pure helpers (invalid detection, cosmetics match, clear/promote rules); manual quickstart for UI + API

**Target Platform**: Cosmo OS dashboard (web)

**Project Type**: Web application (extend Contacts admin + Insight panel)

**Performance Goals**: Paginated lists (default 50 / max 100); batch clear ≤50 contacts per confirm; cosmetics query uses indexed `email` fields where practical

**Constraints**: Server-side authZ + Zod; re-validate reason before clear; no live mailbox probing; Principle V — no parallel CRM; no `db push` on shared DBs (N/A if no migration)

**Scale/Scope**: One cleanup page + 2 API routes + small insight UI tweak + audit action; company-scoped contact base

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Multi-Database Migration Discipline — PASS**: No Prisma schema change; no migrate/create required. If a later iteration adds tables, must use `npm run db:migrate:create` + `db:deploy:all`.
- **II. Environment & Credential Isolation — PASS**: No new secrets or mail-probe credentials.
- **III. Test & Typecheck Gates — PASS**: Unit tests for email-cleanup helpers; `npm test` / lint clean for changed files; no mobile app changes.
- **IV. Production Deployment Safety — PASS**: Plan does not push `main` or prod-migrate without explicit user request.
- **V. Simplicity & Scope Discipline — PASS**: One cleanup page + helpers + audit action; extend Insight display only; no new permission key; no SMTP verification service.

**Post-design re-check**: Still PASS — research R1–R9 + clarify session 2026-08-12 resolve format-only invalid, primary+secondary invalid scan, selective clear, secondary promotion, insight icon+address, permissions, UI placement, paging, and audit without unjustified abstraction or schema churn.

## Project Structure

### Documentation (this feature)

```text
specs/040-contact-email-cleanup/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1
│   └── contact-email-cleanup.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
lib/contacts/email-cleanup.ts            # NEW: match helpers, list query, clear + promote
lib/contacts/email-cleanup.test.ts       # NEW: unit tests
lib/validation/contact-email-cleanup.ts  # NEW: Zod for query/body
lib/audit-log.ts                         # ADD action contact_email_cleared (+ group)
lib/notify usage in panel                # existing toast pattern

app/api/admin/contacts/email-cleanup/route.ts        # NEW GET list
app/api/admin/contacts/email-cleanup/clear/route.ts  # NEW POST clear

app/(dashboard)/dashboard/contacts/email-cleanup/
  page.tsx                               # NEW page shell
  email-cleanup-panel.tsx                # NEW client: tabs, table, confirm, batch

app/(dashboard)/dashboard/customer-insight/
  customer-insight-panel.tsx             # ALWAYS show email row: icon + address or "-"

# Nav: wire Contacts sidebar/links to email-cleanup (same pattern as contact-updates)
```

**Structure Decision**: Single Next.js Cosmo OS app — Contacts admin tool for cleanup; Insight panel display-only change; reuse contact identifier helpers and audit log; no new DB models.

## Complexity Tracking

> No constitution violations requiring justification.
