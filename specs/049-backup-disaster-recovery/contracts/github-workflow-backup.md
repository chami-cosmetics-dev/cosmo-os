# Contract: GitHub Actions backup workflow

**Path**: `.github/workflows/backup-pg-dump.yml`

## Triggers

| Event | When |
|-------|------|
| `schedule` | Daily cron, ~02:00 Asia/Colombo (`30 20 * * *` UTC) |
| `workflow_dispatch` | Manual; optional input `system` = `all` \| one id |

## Concurrency

```yaml
concurrency:
  group: backup-pg-dump
  cancel-in-progress: false
```

## Secrets (GitHub Actions, not Vercel)

| Name | Purpose |
|------|---------|
| `BACKUP_DIRECT_URL_VAULT` | Neon **direct** URL, Vault |
| `BACKUP_DIRECT_URL_COSMO_DEV` | Neon **direct** URL, Cosmo dev |
| `BACKUP_DIRECT_URL_COSMO_PROD` | Neon **direct** URL, Cosmo prod |
| `BACKUP_AGE_RECIPIENT` | age public key (`age1…`) |
| `R2_ACCOUNT_ID` | Cloudflare account |
| `R2_ACCESS_KEY_ID` | R2 token |
| `R2_SECRET_ACCESS_KEY` | R2 secret |
| `R2_BUCKET` | Bucket name |
| `R2_ENDPOINT` | `https://<accountid>.r2.cloudflarestorage.com` |

Pooled URLs MUST be rejected (hostname contains `-pooler` → fail that system).

## Per-system steps

1. `pg_dump -Fc` → temp file  
2. `age -r "$BACKUP_AGE_RECIPIENT"` → `.dump.age`  
3. PUT daily key; if Colombo Sunday PUT weekly; if Colombo day==1 PUT monthly  
4. Update `status/{system}.json` (preserve `lastSuccessAt` on failure)  
5. Shred/delete temp files on the runner

Systems run so that one failure does not skip remaining systems. Workflow **fails** if `vault` or `cosmo-prod` failed. `cosmo-dev` failure fails the workflow too unless a documented exception is added later.

## Outputs / visibility

- GitHub Actions log + job conclusion (failure notice)  
- R2 `status/{system}.json`  
- Job summary lists object keys written  

No commit, no Vercel deploy, no Prisma.

## Local equivalent

`npm run backup:dump -- --system cosmo-dev` (uses `.env.cosmo-dev` **DIRECT_URL**, still encrypts and uploads if R2 env present). Local dump must not default to uploading prod.
