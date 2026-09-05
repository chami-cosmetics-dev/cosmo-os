# Research: Backup & Disaster Recovery

**Feature**: `049-backup-disaster-recovery`  
**Date**: 2026-09-05

## R1 — Where the daily copy job runs

**Decision**: GitHub Actions scheduled workflow on `ubuntu-latest`. Not Vercel cron, not a Next.js API route, not a laptop.

**Rationale**: Spec needs `pg_dump` against **DIRECT_URL** (unpooled), 10–30+ minute runtime, and disk for dump files. Vercel serverless/cron cannot host `pg_dump`, hits timeouts, and would put dump credentials on the app runtime. GitHub Actions already exists (`.github/workflows/ci.yml`); a second workflow with `schedule` + `workflow_dispatch` matches Neon’s own off-site dump guide. Operators see last run in the Actions tab (FR-003) without an in-app screen (out of scope).

**Alternatives considered**:
- *Vercel cron hitting `/api/cron/backup`* — rejected; no `pg_dump`, timeout, dumps on the app host
- *Neon-only snapshots* — rejected as sole path; same-vendor, fails if Neon account/project is gone (FR-001)
- *Manual laptop `pg_dump`* — rejected; FR-002 requires daily without someone remembering

---

## R2 — Independent object store

**Decision**: **Cloudflare R2** private bucket (S3-compatible API). Different vendor from Neon (Neon storage sits on AWS). Zero egress on R2 keeps restore drills cheap.

**Rationale**: Spec FR-001 requires copies usable if the primary database *account, project, or region* is gone. Neon is AWS `ap-southeast-1`. Putting dumps in AWS S3 in the same org is weaker vendor isolation. R2 is a second company, S3 API so tooling (`aws` CLI / `@aws-sdk/client-s3`) stays standard.

Bucket layout and metadata: [contracts/backup-object-store.md](./contracts/backup-object-store.md).

**Alternatives considered**:
- *AWS S3, separate account + region* — acceptable fallback if R2 is blocked; document as equivalent if account ≠ Neon’s AWS
- *Backblaze B2* — also fine S3-compatible; skip unless R2 signup is the blocker
- *GitHub Actions artifacts / git LFS* — rejected; retention too short, dumps in the git org next to code, not a DR store

---

## R3 — Dump format and connection

**Decision**: `pg_dump -Fc` (custom format) per protected system, using that system’s **DIRECT_URL** only (host without `-pooler`). Never `DATABASE_URL` / PgBouncer. `pg_restore --no-owner --no-acl` on restore. Dump public schema (app data); exclude unnecessary Neon internals if they appear.

**Rationale**: FR-018 (consistent restorable image). Neon documents that pooled connections break `pg_dump`. Custom format is compressed, supports parallel restore later, matches `scripts/migrate-supabase-to-neon.sh`. One dump file per system per run so a Vault failure cannot skip Cosmo prod (US1.3).

**Alternatives considered**:
- *Plain SQL (`-Fp`)* — larger, slower restore
- *Directory format (`-Fd`)* — more objects to encrypt/upload; custom file is enough at current size
- *Dump via pooled URL* — rejected; torn/unusable copies

---

## R4 — Encryption and access

**Decision**:
1. R2 bucket: private, no public access, scoped API token (put/list/get/delete on this bucket only).
2. Client-side encrypt dump with **age** before upload (`*.dump.age`). **Public** key in GitHub Actions secret `BACKUP_AGE_RECIPIENT`. **Private** key only in the team secret inventory (1Password) — not in GitHub, not in Vercel, not in the repo.
3. Dump files never committed. `.gitignore` already covers `.env*`; add `*.dump`, `*.dump.age`, `*.bak` if missing.

**Rationale**: FR-005. If GitHub secrets leak, an attacker can *upload/list* but cannot decrypt dumps without the age private key. Restore drill uses the private key from 1Password on an operator machine.

**Alternatives considered**:
- *R2 SSE only* — simpler, but leaked R2+GitHub tokens expose all customer data
- *gpg* — heavier UX; age is one binary, two keys
- *Encrypt with a key stored in the same GitHub repo secrets as R2* — rejected; one leak decrypts everything

---

## R5 — Retention (7 daily / 4 weekly / 12 monthly)

**Decision**: Prefix layout, not a single pile:

| Prefix | When written | Lifecycle expire |
|--------|----------------|------------------|
| `daily/{system}/` | Every successful run | 8 days |
| `weekly/{system}/` | Extra copy when Asia/Colombo weekday is Sunday | 35 days |
| `monthly/{system}/` | Extra copy when Asia/Colombo day-of-month is 1 | 400 days |

Job always writes `daily/`. Same blob also copied to `weekly/` and/or `monthly/` when the calendar rule matches. **Retention must not delete `daily/` objects if that day’s upload failed** (edge case: skip lifecycle delete on empty/missing — R2 expire is time-based, last good daily remains until 8 days). Cosmo-dev: daily prefix only (7-day expire); no weekly/monthly required.

Key helper (testable): `lib/backup/object-key.ts` — system id, timestamp, retention class.

**Rationale**: FR-006 without a custom garbage collector that could wipe the last good copy (edge: storage unavailable → do not run deletes). Time-based lifecycle is dumber and safer.

**Alternatives considered**:
- *Single prefix + job-side delete* — risk of deleting last good copy on a bad day
- *Keep everything forever* — cost + restore-picker noise

---

## R6 — Overlap and partial failure

**Decision**: Workflow `concurrency: group: backup-pg-dump, cancel-in-progress: false`. Matrix or sequential steps for `vault` | `cosmo-dev` | `cosmo-prod`. Each system: dump → encrypt → upload → write `status/{system}.json`. If one system fails, continue others; **job fails** at the end if any required system failed (so GitHub failure notice fires). Do not mark a system success unless upload of the encrypted dump **and** status object succeeded.

**Rationale**: Slow dump must not start a second overlapping dump that corrupts the object (edge). US1.3: prod success must be kept even if dev fails. FR-004: failed job notifies.

**Alternatives considered**:
- *Three separate workflows* — more secrets duplication; one workflow with isolated steps is enough
- *`cancel-in-progress: true`* — could kill a still-running dump

---

## R7 — Failure notice and last-success visibility (no app UI)

**Decision**:
- GitHub Actions failure email / watching the repo (FR-004 within 24h — cron is daily so same calendar day).
- `status/{system}.json` on R2 (`lastSuccessAt`, `lastAttemptAt`, `ok`, `error`, `objectKey`, `bytes`). Operators (or `npm run backup:status`) read this without Neon/Vercel consoles.
- Optional later: Slack webhook. Not v1.

**Rationale**: Spec forbids a Cosmo OS Backup screen. Actions UI + status JSON meets FR-003.

**Alternatives considered**:
- *In-app admin page* — out of scope
- *Commit status to git* — rejected; secrets-adjacent, noisy

---

## R8 — Neon rewind / snapshots (host still exists)

**Decision**: **No application code.** Runbook steps: Neon Console (or `neon` CLI) — set root-branch history window to plan max (Launch 7d / Scale 30d); enable **scheduled snapshots** daily on `cosmo-prod` and `vault` root branches; Time Travel / preview before in-place restore; production restore still needs in-the-moment human yes (constitution IV + FR-008). Child branches do not support instant restore — only root.

**Rationale**: FR-007. Neon PITR is the fast path for “oops” (US2). Independent dumps remain the path when Neon is gone (US3).

**Alternatives considered**:
- *Automate rewind from GitHub* — rejected; too easy to rewind prod unattended (FR-008, constitution IV)

---

## R9 — Restore CLI and prod gate

**Decision**: `scripts/backup/restore.sh` (bash; documented Windows: Git Bash or WSL). Args: `--system vault|cosmo-dev|cosmo-prod` `--object-key …` `--target-direct-url …`. Default: refuse if target host matches known live prod hostnames (from a denylist env or substring `-pooler` forbidden). Live prod restore requires `CONFIRM_PRODUCTION_RESTORE=<system>` in the same invocation. Drill always uses a **new Neon project or new root branch** URL.

After restore: `npx prisma migrate status` against target; stop if drift vs application; do not `db push`. Verification checklist in runbook (FR-011).

**Rationale**: FR-009, FR-013, FR-017, constitution I + IV.

**Alternatives considered**:
- *Restore in GitHub Actions onto prod* — rejected
- *Prisma db push after restore* — forbidden by constitution I

---

## R10 — Runbook location

**Decision**: Ship `docs/ops/backup-disaster-recovery.md` in the repo (operators clone git). Covers US5 scenarios a–g. Spec folder keeps contracts; runbook is the human interface.

**Rationale**: FR-010. Not a product module.

---

## R11 — P2 files and secrets (follow-through, not first delivery)

**Decision**: First delivery = R1–R10 (US1–US5, FR-001–014). Runbook **stubs**:
- Vercel Blob: vendor recovery + later `rclone`/list+copy job
- Cloudinary: vendor backup on their plan
- Secret inventory: table of names from `.env.example` / Vercel env, values in 1Password (FR-015)

First recorded drill (US8) is a go-live gate for “programme complete,” not for merging the workflow PR.

**Rationale**: Constitution V; spec FR-015.

**Alternatives considered**:
- *Build Blob copy in the same PR as pg_dump* — extra vendors, delays P1

---

## R12 — Tests and agent context

**Decision**: Vitest for `lib/backup/object-key.ts` (system ids, prefixes, Sunday/1st promotion, status JSON shape). No Prisma migration. No `update-agent-context` script in this repo — skip (same as 041–044).

**Rationale**: Constitution III. Naming/retention bugs are cheap to unit-test; dump itself is validated in quickstart against cosmo-dev.

**Alternatives considered**:
- *No unit tests, only live dumps* — rejected; FR-006 rules would only fail in prod
