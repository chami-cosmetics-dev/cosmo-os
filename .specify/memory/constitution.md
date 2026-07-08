<!--
Sync Impact Report
Version change: [TEMPLATE] → 1.0.0 (initial ratification)
Modified principles: n/a (first adoption)
Added sections:
  - Core Principles I–V (Multi-Database Migration Discipline, Environment & Credential
    Isolation, Test & Typecheck Gates, Production Deployment Safety, Simplicity & Scope
    Discipline)
  - Technology Stack Constraints
  - Development Workflow
  - Governance
Removed sections: none (template placeholders only)
Templates requiring updates:
  - .specify/templates/plan-template.md: ✅ compatible (Constitution Check gate is generic,
    resolves against this file at plan time; no edit needed)
  - .specify/templates/spec-template.md: ✅ compatible (no constitution-specific references)
  - .specify/templates/tasks-template.md: ✅ compatible (task categories are generic)
  - .specify/templates/checklist-template.md: ✅ compatible
Follow-up TODOs: none
-->

# cosmo-os Constitution

## Core Principles

### I. Multi-Database Migration Discipline (NON-NEGOTIABLE)
This codebase runs **Vault OS** and **Cosmo OS** against three separate Neon
PostgreSQL databases (`vault`, `cosmo-dev`, `cosmo-prod`) from a single Prisma
schema. Every schema change MUST be created with `npm run db:migrate:create`
(never `prisma migrate dev`, which fails with P3006 because there is no shadow
init migration) and MUST be deployed to all three databases via
`npm run db:deploy:all` before the change is considered complete.
`prisma db push` (`npm run db:push`) MUST NOT be run against `cosmo-dev`,
`vault`, or `cosmo-prod` — it is for local throwaway databases only.
Rationale: the three databases share one migrations folder; letting them drift
breaks `prisma migrate status` and silently corrupts whichever environment was
skipped.

### II. Environment & Credential Isolation
Each deployment target (`vault`, `cosmo-dev`, `cosmo-prod`) has its own env
file (`.env.vault`, `.env.cosmo-dev`, `.env.cosmo-prod`) holding distinct
database URLs and Auth0 configuration; `npm run env:use <target>` copies the
target into the active `.env`. Production credentials live only in
`.env.cosmo-prod`. Env files MUST NOT be committed; secrets MUST NOT be copied
between target files or hardcoded into source or scripts.
Rationale: Vault OS and Cosmo OS are distinct tenants on the same codebase —
credential bleed between them is a data-isolation incident, not a bug.

### III. Test & Typecheck Gates Before Merge
`npm test` (Vitest, `lib`/`mobile` units) and `npm run mobile:typecheck` MUST
pass before a PR merges, matching `.github/workflows/ci.yml`. Changes that
touch `mobile/rider-app` MUST also be verified against that app's typecheck
locally when CI is not available. `npm run lint` MUST be clean for changed
files.
Rationale: CI already enforces this for PRs; the constitution codifies it so
local/agent-driven changes hold the same bar before a PR is opened.

### IV. Production Deployment Safety
`main` auto-deploys to production via Vercel, and `db:deploy:cosmo-prod` /
`db:deploy:all` push schema changes to the live production database. Pushing
to `main`, force-pushing any branch, or running a prod database deploy/rollback
MUST NOT happen without the user's explicit, in-the-moment confirmation — prior
approval of a similar action does not carry forward to later ones.
Rationale: these actions are hard to reverse and affect a live paying-customer
system; the cost of asking first is far lower than the cost of an unwanted
production change.

### V. Simplicity & Scope Discipline
Implement what the task requires and no more: no speculative abstractions,
no unused feature flags, no backwards-compatibility shims for code that can
just be changed directly. Prefer a few duplicated lines over a premature
shared helper until a third real use case appears.
Rationale: this is a small team maintaining two product lines (Vault OS,
Cosmo OS) plus a mobile app on one codebase — unnecessary abstraction layers
cost more in review and onboarding time than they save.

## Technology Stack Constraints

- **Web app**: Next.js (App Router) + React, TypeScript throughout.
- **Data layer**: Prisma ORM against Neon-hosted PostgreSQL; pooled
  `DATABASE_URL` for runtime, direct `DIRECT_URL` for migrations, per
  `lib/prisma.ts`.
- **Auth**: Auth0 (`@auth0/nextjs-auth0`), with separate tenants/config per
  deployment target; M2M credentials required for mobile login.
- **External integrations**: Shopify (orders/fulfillment), ERPNext (finance /
  credit notes), Cloudinary (media). Changes to these integrations must
  preserve the existing field-mapping contracts (e.g. gateway → ERP payment
  type mapping) unless the task explicitly changes that mapping.
- **Mobile**: `mobile/rider-app` is a standalone Expo project consuming the
  same Next.js backend; it has its own dependency tree and typecheck step and
  MUST be built/tested independently of the web app's Vitest suite.
- **Testing**: Vitest for unit tests; no test framework substitution without
  updating both `package.json` scripts and `.github/workflows/ci.yml`.

## Development Workflow

- New work happens on feature branches; `main` is production and protected by
  Principle IV.
- After pulling a branch with new migrations: `npm install` →
  `npm run db:generate` → `npm run db:deploy:<your-target>`.
- After a migration merges to the shared branch: `npm run db:deploy:all` so no
  database is left behind.
- PRs must pass the CI gate in `.github/workflows/ci.yml` (root tests + mobile
  typecheck) before merge.
- Commit messages describe why a change was made, not just what changed;
  favor small, reviewable commits over large mixed-purpose ones.

## Governance

This constitution supersedes ad hoc practice for anything it covers. Amendments
require: (1) a documented reason for the change, (2) a version bump per the
policy below, and (3) a check of `.specify/templates/*.md` for now-outdated
guidance as part of the same amendment.

**Versioning policy** (semantic versioning applied to this document):
- **MAJOR**: backward-incompatible governance changes or principle removals/
  redefinitions.
- **MINOR**: a new principle or materially expanded section.
- **PATCH**: clarifications, wording, or non-semantic fixes.

All feature plans produced via `/speckit-plan` must pass the Constitution
Check gate against the Core Principles above; violations must be justified in
that plan's Complexity Tracking table or the simpler alternative adopted
instead.

**Version**: 1.0.0 | **Ratified**: 2026-07-01 | **Last Amended**: 2026-07-01
