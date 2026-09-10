# Contract: Restore CLI

**Path**: `scripts/backup/restore.sh`  
**Windows**: Git Bash or WSL (same script).

## Synopsis

```bash
./scripts/backup/restore.sh \
  --system vault|cosmo-dev|cosmo-prod \
  --object-key <R2 key> \
  --target-direct-url "$DIRECT_URL"
```

Optional: `--from-latest-daily` (resolves latest `daily/{system}/` object).

## Safety gates (must all pass)

| Gate | Rule |
|------|------|
| Target is direct | Reject if URL host contains `-pooler` |
| System matches key | `{system}` in `--system` equals key segment |
| Drill vs live | If target host matches known live host for that system, require `CONFIRM_PRODUCTION_RESTORE=<system>` in the environment **for this process only** |
| Cross-product | Refuse `vault` object against a target labelled cosmo (and reverse) when live-host denylist matches |
| Empty-ish target | Operator confirms restore may drop/replace objects (`pg_restore --clean --if-exists`) |

Live host denylist: document actual Neon compute hostnames in runbook (not in git if they are sensitive; pattern-match `neon.tech` + env `BACKUP_LIVE_HOST_COSMO_PROD` etc. as GitHub/operator env). Safer: compare target host to `BACKUP_LIVE_HOST_*` secrets; if equal and no confirm env → exit 2.

## Steps

1. GET object from R2  
2. `age -d` with private key from stdin or `BACKUP_AGE_IDENTITY` file (never log the key)  
3. `pg_restore --no-owner --no-acl --clean --if-exists -d "$TARGET"`  
4. `npx prisma migrate status` with `DIRECT_URL`/`DATABASE_URL` pointed at target  
5. Print verification checklist (do not auto-tick)

Exit 0 only if restore process completed; migrate drift is a warning + non-zero if status is not up to date unless `--allow-schema-drift`.

## Forbidden

- Default target = production  
- Reading `DATABASE_URL` pooled as restore target  
- Restoring without `--system`  
- Printing connection strings
