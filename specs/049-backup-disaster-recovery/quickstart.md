# Quickstart: Backup & Disaster Recovery

**Feature**: `049-backup-disaster-recovery`  
**Date**: 2026-09-05

Validation after implementation. Do **not** restore onto live Cosmo prod or Vault.

## Prerequisites

- GitHub repo secrets from [contracts/github-workflow-backup.md](./contracts/github-workflow-backup.md)
- R2 bucket + lifecycle rules from [contracts/backup-object-store.md](./contracts/backup-object-store.md)
- age keypair: public in `BACKUP_AGE_RECIPIENT`; private in 1Password only
- Neon: paid plan, history window max, daily snapshot schedule on **vault** and **cosmo-prod** root branches
- `docs/ops/backup-disaster-recovery.md` present
- Postgres client (`pg_dump` / `pg_restore`) locally for restore drill

```bash
npm test -- lib/backup
```

Expect object-key / retention unit tests green.

## 1) Naming / retention (offline)

1. Unit tests: Sunday → weekly prefix also used; day 1 → monthly; `cosmo-dev` never weekly/monthly
2. Invalid system id rejected

## 2) Manual dump of Cosmo dev (safe)

1. `workflow_dispatch` with `system=cosmo-dev` **or** local `npm run backup:dump -- --system cosmo-dev`
2. R2 has `daily/cosmo-dev/cosmo-dev-….dump.age`
3. `status/cosmo-dev.json` has `ok: true` and `lastSuccessAt` within minutes
4. Runner/workspace has no leftover unencrypted dump

## 3) Partial failure isolation

1. Temporarily break `BACKUP_DIRECT_URL_COSMO_DEV` (invalid host)
2. Dispatch `system=all` (or run workflow)
3. Cosmo-dev status `ok: false`, **previous** `lastSuccessAt` still set if one existed
4. Vault and cosmo-prod still upload if their URLs are valid
5. Workflow conclusion **failure** (notice fires)

## 4) Restore drill (throwaway Neon)

1. Create a new Neon branch/project; copy its **direct** URL
2. `./scripts/backup/restore.sh --system cosmo-dev --from-latest-daily --target-direct-url "$THROWAY"`
3. Without age private key → decrypt fails, target empty
4. With key from 1Password → restore completes
5. `prisma migrate status` on throwaway
6. Spot-check: order or contact count vs a note taken before dump
7. Confirm live Cosmo prod row counts unchanged
8. Log drill row in the runbook (date, operator, key, live untouched)

## 5) Prod gate

1. Point restore at live prod URL **without** `CONFIRM_PRODUCTION_RESTORE` → exit non-zero, no restore
2. Do **not** complete a live prod restore in this quickstart

## 6) Neon rewind (cosmo-dev or disposable branch)

1. Delete a known test row on a non-prod DB
2. Follow runbook Time Travel / restore-to-timestamp
3. Row is back; procedure took ≤ 30 minutes (SC-003)

## 7) Runbook review (two people)

1. Each reads only `docs/ops/backup-disaster-recovery.md`
2. Scenario “Neon project deleted” → both say independent copy, not rewind
3. Scenario “Vercel down, Neon up” → redeploy, no restore
4. Both refuse drill onto live prod

## 8) Overdue visibility

1. Inspect `status/cosmo-prod.json`
2. If `lastSuccessAt` > 24h, overdue is obvious (`backup:status` or reading the JSON)

## Done when

- [ ] Daily workflow has a green `cosmo-prod` run
- [ ] Failure path notified
- [ ] One throwaway restore recorded
- [ ] Neon snapshots + history window confirmed in console
- [ ] Runbook merged
