# Tasks: Backup & Disaster Recovery

**Input**: Design documents from `/specs/049-backup-disaster-recovery/`  
**Prerequisites**: `plan.md`, `spec.md`, `data-model.md`, `contracts/`, `research.md`, `quickstart.md`, `.specify/memory/constitution.md`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Exact file paths included in every task description

**Tests**: Vitest for `lib/backup/*` is required by `plan.md` (not optional TDD for the whole feature). No Prisma migration.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Ignore dump artifacts; create ops/script folders so later tasks have a home.

- [ ] T001 Add `*.dump`, `*.dump.age`, and `*.bak` ignore rules in `.gitignore`
- [ ] T002 [P] Create `lib/backup/` and `scripts/backup/` directories with a short operator pointer in `scripts/backup/README.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared system ids, object keys, retention calendar, and status-JSON merge. All dump/restore/status stories depend on this.

**⚠️ CRITICAL**: No user story implementation until this phase is complete.

- [ ] T003 Implement protected-system enum (`vault` | `cosmo-dev` | `cosmo-prod`), R2 key builder, and Asia/Colombo Sunday/1st retention-class rules in `lib/backup/object-key.ts`
- [ ] T004 Add unit tests for object keys (invalid system rejected, daily always, weekly only Sunday, monthly only day 1, `cosmo-dev` daily-only) in `lib/backup/object-key.test.ts`
- [ ] T005 Implement status snapshot merge (preserve `lastSuccessAt` on failure; never embed connection strings) in `lib/backup/status.ts`
- [ ] T006 Add unit tests for status merge and overdue (>24h) helper in `lib/backup/status.test.ts`

**Checkpoint**: `npm test -- lib/backup` green. Ready for dump/restore/runbook stories.

---

## Phase 3: User Story 1 - Independent copies exist without anyone remembering to click (Priority: P1) 🎯 MVP

**Goal**: Nightly (and manual) encrypted `pg_dump -Fc` of all three systems lands in Cloudflare R2 under the contract key layout; operators can read last-success time from `status/{system}.json`.

**Independent Test**: Dispatch workflow for `cosmo-dev` (or `npm run backup:dump -- --system cosmo-dev`); confirm `daily/cosmo-dev/…dump.age` and `status/cosmo-dev.json` with `ok: true` and age within minutes. Prod URL must not be required for this test.

### Implementation for User Story 1

- [ ] T007 [P] [US1] Add CLI that prints object keys / retention class for bash using `lib/backup/object-key.ts` in `scripts/backup/print-object-key.ts`
- [ ] T008 [US1] Implement dump pipeline (`DIRECT_URL` only, reject `-pooler`, `pg_dump -Fc`, `age` encrypt, PUT daily + weekly/monthly copies, write status JSON) in `scripts/backup/dump.sh`
- [ ] T009 [US1] Add `backup:dump` npm script wrapper in `package.json` (local: `--system` required; default must not be `cosmo-prod`)
- [ ] T010 [US1] Add scheduled + `workflow_dispatch` workflow with `concurrency.group: backup-pg-dump`, `cancel-in-progress: false`, per-system secrets, continue-after-one-failure then upload successes in `.github/workflows/backup-pg-dump.yml`
- [ ] T011 [US1] Implement `backup:status` that lists `status/{system}.json` from R2 (lastSuccessAt, ok, overdue) in `scripts/backup/status.ts` and wire `backup:status` in `package.json`
- [ ] T012 [P] [US1] Document required GitHub/R2/`BACKUP_AGE_RECIPIENT` secret *names* (no values) and bucket lifecycle table in `docs/ops/backup-disaster-recovery.md`

**Checkpoint**: One successful `cosmo-dev` encrypted object in R2; status JSON readable without Neon/Vercel consoles.

---

## Phase 4: User Story 4 - Operators notice a missed copy the same day (Priority: P1)

**Goal**: Failed or overdue production/vault copies fail the GitHub Actions job (repo watchers get the notice) and status JSON keeps prior `lastSuccessAt`.

**Independent Test**: Break `BACKUP_DIRECT_URL_COSMO_DEV`; dispatch `all`; cosmo-dev `ok: false` with previous `lastSuccessAt` intact; workflow conclusion failure; other systems still upload if URLs valid.

### Implementation for User Story 4

- [ ] T013 [US4] Fail `.github/workflows/backup-pg-dump.yml` at end if any required system failed (`vault`, `cosmo-prod`, `cosmo-dev`) after all systems attempted
- [ ] T014 [US4] Ensure `scripts/backup/dump.sh` loads existing status, updates `lastAttemptAt`/`error`, and does not clear `lastSuccessAt` on failure (uses `lib/backup/status.ts`)
- [ ] T015 [P] [US4] Document GitHub failed-workflow notification (watch repo / Actions email) and 24h overdue meaning of `backup:status` in `docs/ops/backup-disaster-recovery.md`

**Checkpoint**: Simulated dump failure is visible the same day and does not erase the last good copy pointer.

---

## Phase 5: User Story 3 - Rebuild from independent copies when the database host is gone (Priority: P1)

**Goal**: Operator restores a chosen R2 object onto a **new** Neon DIRECT_URL via gated CLI; live prod refused without `CONFIRM_PRODUCTION_RESTORE`.

**Independent Test**: Restore latest `cosmo-dev` dump onto a throwaway Neon direct URL; `prisma migrate status` on throwaway; live prod untouched. Restore pointed at live prod without confirm env exits non-zero.

### Implementation for User Story 3

- [ ] T016 [US3] Implement GET → `age -d` → `pg_restore --no-owner --no-acl --clean --if-exists` plus `--system` / `--object-key` / `--from-latest-daily` in `scripts/backup/restore.sh`
- [ ] T017 [US3] Enforce restore safety gates in `scripts/backup/restore.sh`: reject `-pooler`, system must match key, live-host denylist via `BACKUP_LIVE_HOST_*`, require `CONFIRM_PRODUCTION_RESTORE=<system>` for live, refuse Vault object onto Cosmo live (and reverse)
- [ ] T018 [P] [US3] Add `backup:restore` wrapper in `package.json` and document throwaway-only default in `scripts/backup/README.md`
- [ ] T019 [US3] After restore, run `npx prisma migrate status` against target and warn/non-zero on drift (no `db push`) inside `scripts/backup/restore.sh`

**Checkpoint**: Throwaway restore works; live prod restore is blocked without explicit env.

---

## Phase 6: User Story 2 - Undo recent accidental data loss without a full rebuild (Priority: P1)

**Goal**: Written Neon rewind / snapshot procedure (console or `neon` CLI) for when the host still exists; production still needs in-the-moment yes.

**Independent Test**: Reviewer follows only the runbook section, previews a timestamp on a non-prod branch, and does not rewind live prod. Optional: delete a test row on cosmo-dev and rewind.

### Implementation for User Story 2

- [ ] T020 [US2] Write Neon history-window + scheduled-snapshot + Time Travel preview + in-place restore steps (root branch only) in `docs/ops/backup-disaster-recovery.md`
- [ ] T021 [P] [US2] Add a console checklist (Launch 7d / Scale 30d window, daily snapshots on vault and cosmo-prod roots) in `docs/ops/backup-disaster-recovery.md`
- [ ] T022 [US2] If rewind window expired or Neon gone, runbook MUST send operator to independent-copy restore (`scripts/backup/restore.sh`) in `docs/ops/backup-disaster-recovery.md`

**Checkpoint**: Accidental-delete path is documented without automating prod rewind.

---

## Phase 7: User Story 5 - Written restore path anyone on the ops roster can follow (Priority: P1)

**Goal**: One runbook covers: app down / DB healthy; accidental loss; host gone; confirmation; Vault vs Cosmo; verify checklist; who to notify.

**Independent Test**: Two people read only `docs/ops/backup-disaster-recovery.md`; both choose independent copy for “Neon deleted”; both redeploy-only for “Vercel down”; both refuse drill onto live prod.

### Implementation for User Story 5

- [ ] T023 [US5] Complete scenario sections (a)–(g) from spec FR-010 in `docs/ops/backup-disaster-recovery.md`
- [ ] T024 [P] [US5] Add post-restore verification checklist (login, recent orders/Vault records, product-line not swapped, schema match) in `docs/ops/backup-disaster-recovery.md`
- [ ] T025 [P] [US5] Name at least two roles/people who may confirm production restore in `docs/ops/backup-disaster-recovery.md`
- [ ] T026 [US5] Explicitly out-of-scope ERPNext, Shopify, Auth0 recovery (use vendor backups; do not rebuild Cosmo from SI) in `docs/ops/backup-disaster-recovery.md`

**Checkpoint**: Second operator can pick the right path from the runbook alone.

---

## Phase 8: User Story 6 - Uploaded files and media survive a store outage (Priority: P2)

**Goal**: Runbook names how receipts/logos/academy media are recovered (vendor and/or future copy job). No app feature required in v1.

**Independent Test**: Runbook lists Vercel Blob and Cloudinary recovery (or “not yet copied”) and a mismatch rule after DB restore.

### Implementation for User Story 6

- [ ] T027 [US6] Add file-store stub: Vercel Blob (book notes, admin files, academy) and Cloudinary (logos/media) vendor recovery plus row-vs-file mismatch rule in `docs/ops/backup-disaster-recovery.md`

**Checkpoint**: Operators know files are not in the Postgres dump.

---

## Phase 9: User Story 7 - App can be stood up without tribal knowledge of secrets (Priority: P2)

**Goal**: Named inventory of production settings; values in 1Password only; repo scan stays clean.

**Independent Test**: Checklist of names matches `.env.example` / Vercel env needs; `git grep` for production secrets stays empty (SC-006).

### Implementation for User Story 7

- [ ] T028 [US7] Add secret-inventory table (DIRECT_URLs, Auth0, Blob, Cloudinary, R2, age private key) with “value lives in 1Password” in `docs/ops/backup-disaster-recovery.md`
- [ ] T029 [P] [US7] Cross-check names against `.env.example` (do not add secret values) in `.env.example`

**Checkpoint**: Rebuild of Vercel+env can proceed from inventory names + 1Password.

---

## Phase 10: User Story 8 - Prove restore works on a calendar, not only in theory (Priority: P2)

**Goal**: Drill log template; 90-day cadence; first drill is programme-complete gate (not required to merge dump workflow).

**Independent Test**: Empty log exists with columns date, operator, system, object key, verification, live untouched. Instructions say target is always a new host.

### Implementation for User Story 8

- [ ] T030 [US8] Add restore-drill log table and quarterly instructions (never live prod) in `docs/ops/backup-disaster-recovery.md`
- [ ] T031 [P] [US8] Point `specs/049-backup-disaster-recovery/quickstart.md` section 4 at the drill log so the first recorded drill has a place to write

**Checkpoint**: First drill can be recorded without inventing a format.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Validate the feature as specified; keep dumps and prod safety tight.

- [ ] T032 [P] Confirm `.gitignore` covers local dump leftovers after a dry-run of `scripts/backup/dump.sh`
- [ ] T033 Confirm no Prisma schema/migration was added (constitution I) — `prisma/schema.prisma` unchanged by this feature
- [ ] T034 Run `npm test` (includes `lib/backup`) and walk [quickstart.md](./quickstart.md) scenarios 1–5, 7 on **non-prod** only
- [ ] T035 [P] Add a one-line pointer from root `README.md` Database setup section to `docs/ops/backup-disaster-recovery.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: After Foundational — MVP
- **US4 (Phase 4)**: After US1 (same workflow/dump script)
- **US3 (Phase 5)**: After Foundational; better after US1 so a real object exists to restore
- **US2 (Phase 6)**: After Foundational; can parallel US1 (docs only)
- **US5 (Phase 7)**: After US2 + US3 sections exist (runbook stitches them)
- **US6–US8 (Phases 8–10)**: After US5 runbook skeleton (append sections)
- **Polish (Phase 11)**: After desired stories; T034 after dump+restore scripts exist

### User Story Dependencies

- **US1 (P1)**: After Phase 2 — no other stories
- **US4 (P1)**: Extends US1 workflow/dump — not independently shippable without US1
- **US3 (P1)**: After Phase 2; needs a dump object for a full E2E (US1)
- **US2 (P1)**: Docs only — parallel with US1
- **US5 (P1)**: Aggregates US1–US4 paths into one runbook
- **US6, US7, US8 (P2)**: After US5; do not block merging dump workflow

### Within Each User Story

- Helpers (`lib/backup`) before bash
- Dump before “fail the job” (US4)
- Restore gates before documenting live restore
- Runbook sections before P2 stubs

### Parallel Opportunities

- T001 and T002
- T007 and T012 once T003 exists
- T018 with T016–T017 (README vs script)
- T020–T022 (same file — **not** parallel with each other; T021 [P] only if splitting sections carefully — prefer sequential edits to `docs/ops/backup-disaster-recovery.md`)
- T024, T025 [P] after T023 if different sections
- T027, T028, T030 append-only if different headings
- T032 and T035

**Same-file warning**: Most of US2, US5, US6–US8 edit `docs/ops/backup-disaster-recovery.md` — do **not** parallel those tasks.

---

## Parallel Example: User Story 1

```bash
# After T003–T006:
Task: "CLI print-object-key in scripts/backup/print-object-key.ts"
Task: "Secret names + lifecycle table in docs/ops/backup-disaster-recovery.md"

# Then sequential:
Task: "dump.sh"
Task: "package.json backup:dump"
Task: "backup-pg-dump.yml"
Task: "status.ts + backup:status"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 2 Foundational (`npm test -- lib/backup`)
3. Phase 3 US1 — dump to R2 for `cosmo-dev`
4. **STOP**: dispatch workflow; inspect R2 object + status JSON
5. Then US4 (alerts) before trusting prod secrets

### Incremental Delivery

1. Setup + Foundational
2. US1 → demo: object in R2
3. US4 → demo: failed job notice
4. US3 → demo: throwaway restore
5. US2 + US5 → demo: runbook review (two people)
6. US6–US8 → programme complete (first drill recorded)

### Parallel Team Strategy

- Dev A: Phase 2 + US1 + US4 (scripts + GHA)
- Dev B: US2 + US5 runbook (after T012 stub exists)
- Dev A: US3 restore CLI
- Together: P2 stubs + first drill

---

## Notes

- [P] = different files, no incomplete dependency
- Do not add Backup UI, Prisma models, or Vercel cron
- Age **private** key never in GitHub secrets
- Never restore live `cosmo-prod` / `vault` in CI or quickstart
- Commit after each task or logical group
- Next: `/speckit-implement` from T001
