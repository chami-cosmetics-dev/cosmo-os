# Implementation Plan: Backup & Disaster Recovery

**Branch**: `feature/backup-disaster-recovery` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/049-backup-disaster-recovery/spec.md`

**Note**: Filled by `/speckit-plan`. Workflow: `.specify/templates/plan-template.md`.

## Summary

Protect Vault OS, Cosmo OS production, and Cosmo OS development with two recovery paths: **Neon instant restore + scheduled snapshots** (host still exists) and **nightly encrypted `pg_dump -Fc` to Cloudflare R2** (Neon gone). GitHub Actions runs dumps against **DIRECT_URL** only. No in-app Backup UI. Restore is a gated CLI + written runbook. First delivery is database copies, alerts, restore script, and runbook; Blob/secret inventory and the first recorded drill close the programme (P2).

## Technical Context

**Language/Version**: TypeScript (key/status helpers) + Bash (dump/restore) + GitHub Actions YAML. App remains Next.js 16 / Prisma 6 — **no schema change**.

**Primary Dependencies**: `pg_dump`/`pg_restore` (PostgreSQL 16+ client), `age`, S3-compatible API (Cloudflare R2), existing GitHub Actions, existing `scripts/with-env.mjs` / `DIRECT_URL` convention

**Storage**: Neon PostgreSQL (source, three projects). Independent copies: R2 objects. No new Prisma models.

**Testing**: Vitest for `lib/backup/object-key.ts` (and status merge). Live dump/restore against **cosmo-dev** + throwaway Neon per [quickstart.md](./quickstart.md). Do not restore live prod in CI.

**Target Platform**: GitHub-hosted `ubuntu-latest` runners; operator laptop/WSL for restore; Neon Console for rewind

**Project Type**: Ops automation in the existing monorepo (workflow + scripts + docs). Not a user-facing web feature.

**Performance Goals**: Daily dump of each system completes within the Actions 6h job cap (expect well under 1h at current DB size). Status JSON readable immediately after upload. Restore drill of production-sized dump onto a new host within **one working day** (SC-002).

**Constraints**: Constitution I — no `db push`; restore then `prisma migrate status` only. Constitution II — prod `DIRECT_URL` only in GitHub secrets / 1Password, never committed. Constitution IV — live rewind/restore needs in-the-moment confirm (`CONFIRM_PRODUCTION_RESTORE`). Pooled URLs forbidden for dump/restore. RPO 24h independent copies; RTO one working day full rebuild.

**Scale/Scope**: 3 databases, 1 nightly workflow, 1 R2 bucket, 1 runbook. No hot standby. No ERPNext/Shopify/Auth0 dumps.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Multi-Database Migration Discipline | **PASS** | No Prisma migration. Restore must not `db push`. Post-restore: `migrate status` only. Dump all three systems; do not treat one DB as covering the others. |
| II. Environment & Credential Isolation | **PASS** | Separate `BACKUP_DIRECT_URL_*` secrets per system. Age **private** key not in GitHub. Cross-restore Vault↔Cosmo forbidden. Status JSON must not embed URLs with passwords. |
| III. Test & Typecheck Gates | **PASS** | Vitest for object-key/retention/status-merge; `npm test` still green; no mobile changes. |
| IV. Production Deployment Safety | **PASS** | Workflow does not push `main` or mutate prod data. Restore CLI refuses live hosts without `CONFIRM_PRODUCTION_RESTORE`. Plan does not run prod restore. |
| V. Simplicity & Scope Discipline | **PASS** | No Backup product UI, no extra app routes, no hot standby, no client-side backup dashboard. GHA + R2 + scripts + docs. |

**Post-design re-check:** **PASS** — entities are R2 objects + JSON status; contracts are workflow/CLI/store; P2 files/secrets stubbed in runbook only.

## Project Structure

### Documentation (this feature)

```text
specs/049-backup-disaster-recovery/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── backup-object-store.md
│   ├── github-workflow-backup.md
│   └── restore-cli.md
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
.github/workflows/backup-pg-dump.yml     # nightly + workflow_dispatch
docs/ops/backup-disaster-recovery.md     # operator runbook (US2, US5, P2 stubs)

lib/backup/
├── object-key.ts                        # system ids, prefixes, Colombo Sunday/1st
├── object-key.test.ts
├── status.ts                            # merge lastSuccessAt on failure
└── status.test.ts

scripts/backup/
├── dump.sh                              # pg_dump -Fc + age + S3 PUT (used by GHA)
└── restore.sh                           # GET + age -d + pg_restore + gates

package.json                             # backup:dump, backup:status (thin wrappers)
.gitignore                               # *.dump, *.dump.age, *.bak if missing
```

**Structure Decision**: Keep dumps out of `app/` and Prisma. Mirror existing `scripts/` + `.github/workflows/` pattern (like CI). Pure TS only where tests catch retention/status bugs.

## Complexity Tracking

> No constitution violations requiring justification.

| Item | Phase | Notes |
|------|-------|-------|
| Vercel Blob / Cloudinary copy | P2 | Runbook stub in v1 |
| 1Password secret inventory | P2 | Checklist in runbook |
| Quarterly drill | P2 | Gate for programme complete, not for merging dump workflow |

## Implementation Phases (aligned with spec priorities)

### Phase 1 — Independent copies + alert (P1 US-1, US-4)

1. `lib/backup/object-key.ts` + `status.ts` + Vitest
2. R2 bucket + lifecycle (manual/ops) documented in runbook
3. `scripts/backup/dump.sh` + workflow secrets contract
4. `.github/workflows/backup-pg-dump.yml` (schedule + dispatch, concurrency, per-system continue, fail job if any fail)
5. `backup:status` lists `status/*.json`

### Phase 2 — Restore from independent copy (P1 US-3)

6. `scripts/backup/restore.sh` per [restore-cli.md](./contracts/restore-cli.md)
7. Prod confirm env + live-host denylist
8. Quickstart throwaway restore (cosmo-dev dump → new Neon)

### Phase 3 — Runbook + Neon rewind (P1 US-2, US-5)

9. `docs/ops/backup-disaster-recovery.md` — scenarios a–g, confirmation, Vault vs Cosmo, verify checklist, two named roles
10. Neon history window + snapshot schedule (console); document clicks/CLI
11. Explicit “Vercel down / Neon up → redeploy only”

### Phase 4 — Retention calendar copies (P1 FR-006)

12. Sunday weekly + 1st monthly extra PUTs in dump script (already designed; ship with Phase 1 if cheap)

### Phase 5 — Programme close (P2 US-6, US-7, US-8)

13. File-store vendor notes + secret name inventory in runbook
14. First recorded restore drill

## Key Integration Points

| Need | Reuse / add |
|------|-------------|
| Direct DB URL | Same `DIRECT_URL` as Prisma migrate; GH secret copy, not `.env` in CI |
| Env targets | `scripts/env-targets.mjs` ids `vault`, `cosmo-dev`, `cosmo-prod` |
| CI pattern | New workflow file; do **not** slow `ci.yml` with dumps |
| Failure notice | GitHub Actions failed-workflow email (repo watchers) |
| Prod safety | Constitution IV + `CONFIRM_PRODUCTION_RESTORE` |
| Existing dump lore | `scripts/migrate-supabase-to-neon.sh` (`pg_dump -Fc` / `pg_restore --no-owner --no-acl`) |

## Agent context

Skipped — repo has no `.specify` `update-agent-context` script (same as 041–044).
