# Backup scripts

Operator tools for independent Postgres copies. **Not** an in-app feature.

See **[docs/ops/backup-disaster-recovery.md](../../docs/ops/backup-disaster-recovery.md)** for when to dump vs rewind vs restore.

```bash
# Requires: pg_dump, age, aws CLI, R2 env, BACKUP_AGE_RECIPIENT
npm run backup:dump -- --system cosmo-dev

npm run backup:status

# Restore onto a NEW Neon DIRECT_URL only (Git Bash / WSL on Windows)
export BACKUP_AGE_IDENTITY=/path/to/age-key   # from 1Password, never commit
npm run backup:restore -- --system cosmo-dev --from-latest-daily --target-direct-url "$THROWAY_DIRECT_URL"
```

`--system` is required for dump. There is **no default**; it will not pick `cosmo-prod`.

Live production restore requires `CONFIRM_PRODUCTION_RESTORE=<system>` in the same process. Drills always use a new empty host.
