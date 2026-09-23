# Backup & disaster recovery (Cosmo OS / Vault OS)

Operator runbook. There is **no in-app Backup screen**. Copies live in Cloudflare R2 (encrypted). Neon rewind is the fast path when Neon still exists.

**RPO (independent copies):** 24 hours for production and Vault.  
**RTO (full rebuild from R2):** one working day, two authorised people, this document.

Do **not** restore onto live Cosmo production or Vault unless you have an in-the-moment yes and `CONFIRM_PRODUCTION_RESTORE=<system>` in that shell only.

---

## Protected systems

| id | Product | Dump cadence | Retention |
|----|---------|--------------|-----------|
| `vault` | Vault OS | Daily | 7 daily + 4 weekly + 12 monthly |
| `cosmo-prod` | Cosmo OS production | Daily (never skip) | 7 daily + 4 weekly + 12 monthly |
| `cosmo-dev` | Cosmo OS development | Daily | 7 daily only |

Vault copy **must not** land on Cosmo live, and reverse.

---

## Who may confirm a production restore

At least **two** people (roles) must be able to say yes. Fill names in 1Password / this table when you staff the roster (do not leave a single-person bus factor):

| Role | Name | May confirm live `cosmo-prod` / `vault` restore? |
|------|------|--------------------------------------------------|
| Technical owner | *(fill)* | Yes |
| Second operator / company admin | *(fill)* | Yes |

Prior approval of a *similar* restore does **not** count. Ask again, in the moment.

---

## Pick a path (do this first)

| What happened | Path |
|---------------|------|
| **(a) Vercel / app down, Neon healthy** | Redeploy from git. Do **not** restore the database. |
| **(b) Accidental delete / bad change, Neon still up, damage inside history window** | Neon rewind / snapshot (below). Confirm if production. |
| **(c) Neon project, account, or region gone; dumps exist** | Independent copy → `scripts/backup/restore.sh` onto a **new** Neon host, then point the app. |
| Rewind window expired or Neon gone | Same as (c). Do not invent a partial rewind. |
| Unsure of the exact damage time | Neon Time Travel / preview **before** in-place restore. |
| Drill / practice | Always a **new empty** Neon project or branch. Never live prod. |

Out of this job (use those vendors’ own recovery; **do not** rebuild Cosmo/Vault from them as the primary path):

- ERPNext (finance / stock)
- Shopify (store)
- Auth0 (logins)

---

## GitHub / R2 secret names (values in 1Password)

Create GitHub Actions secrets (not Vercel env) for the dump workflow:

| Name | Purpose |
|------|---------|
| `BACKUP_DIRECT_URL_VAULT` | Neon **DIRECT_URL** (no `-pooler`) |
| `BACKUP_DIRECT_URL_COSMO_DEV` | Neon **DIRECT_URL** |
| `BACKUP_DIRECT_URL_COSMO_PROD` | Neon **DIRECT_URL** |
| `BACKUP_AGE_RECIPIENT` | age **public** key (`age1…`) |
| `R2_ACCOUNT_ID` | Cloudflare account id |
| `R2_ACCESS_KEY_ID` | R2 API token |
| `R2_SECRET_ACCESS_KEY` | R2 secret |
| `R2_BUCKET` | Bucket name |
| `R2_ENDPOINT` | `https://<accountid>.r2.cloudflarestorage.com` |

Age **private** key: 1Password only. Never GitHub, never Vercel, never git.

Optional operator env for restore gates (hostnames only, not URLs):

| Name | Purpose |
|------|---------|
| `BACKUP_LIVE_HOST_VAULT` | Live Vault Neon compute hostname |
| `BACKUP_LIVE_HOST_COSMO_DEV` | Live Cosmo-dev hostname |
| `BACKUP_LIVE_HOST_COSMO_PROD` | Live Cosmo-prod hostname |

---

## R2 bucket lifecycle

Private bucket. No public access. Dump job does **not** bulk-delete.

| Prefix | Expire after |
|--------|----------------|
| `daily/` | 8 days |
| `weekly/` | 35 days |
| `monthly/` | 400 days |
| `status/` | never |

Keys: `daily/{system}/{system}-{YYYYMMDDTHHmmss}Z.dump.age`

---

## Daily dump (independent copies)

Workflow: `.github/workflows/backup-pg-dump.yml`

- Schedule: `30 20 * * *` UTC (~02:00 Asia/Colombo)
- Manual: Actions → **Backup pg_dump** → `system=all` or one id
- Uses `DIRECT_URL` only (pooled URLs fail that system)
- Encrypts with age; uploads to R2; writes `status/{system}.json`
- One system failing does not skip the others; the **job still fails** at the end so GitHub emails watchers

Local (Git Bash / WSL), never defaults to prod:

```bash
npm run backup:dump -- --system cosmo-dev
npm run backup:status
```

`backup:status` exit 2 if any system is overdue (>24h since `lastSuccessAt`) or missing.

### Failure notice (same calendar day)

Watch the GitHub repo (or enable Actions email). A red **Backup pg_dump** run is the notice. Status JSON keeps the previous `lastSuccessAt` when today’s dump fails — do not treat a failed run as “delete the last good pointer”.

---

## Neon rewind (host still exists)

Use when Neon is up and the mistake is inside the **history window**. Root branches only (`production` / `main`). Child branches cannot instant-restore.

### Console checklist (do this once, then yearly)

1. Paid Neon plan (Launch: history up to **7 days**; Scale: up to **30 days**). Set the window to the **maximum** the plan allows for **vault** and **cosmo-prod** root branches.
2. Enable **scheduled snapshots** daily on those root branches (keep ~14–35 days).
3. Confirm Time Travel / preview is available before you rewind live.

### Procedure

1. Stop writing if you can (tell the team).
2. Time Travel / read-only query (or Schema Diff) to pick the timestamp **before** the damage.
3. If the target is **production**: get in-the-moment confirmation (table above). Then restore in Console / `neon` CLI.
4. Neon keeps a backup branch of the pre-restore state — do not delete it until you have verified.
5. Verify with the checklist below.
6. If the window has expired or the project is gone → **stop**. Use independent-copy restore (`scripts/backup/restore.sh`), not a half rewind.

Do **not** automate prod rewind from GitHub Actions.

---

## Independent-copy restore (Neon gone, or drill)

```bash
export R2_BUCKET=… R2_ENDPOINT=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=…
export BACKUP_AGE_IDENTITY=/path/to/age-identity   # from 1Password, temp file
export BACKUP_LIVE_HOST_COSMO_PROD=…               # hostname only

# Drill — NEW Neon project/branch DIRECT_URL
./scripts/backup/restore.sh \
  --system cosmo-dev \
  --from-latest-daily \
  --target-direct-url "$THROWAY_DIRECT_URL"

# Live prod only with in-the-moment yes:
CONFIRM_PRODUCTION_RESTORE=cosmo-prod ./scripts/backup/restore.sh \
  --system cosmo-prod \
  --from-latest-daily \
  --target-direct-url "$LIVE_DIRECT_URL"
```

Gates: no `-pooler`; object key system must match `--system`; live host requires confirm env; Vault object will not restore onto Cosmo live hosts (and reverse).

After restore: `prisma migrate status` only. **Never** `db push`. Point Vercel `DATABASE_URL` / `DIRECT_URL` at the new host only after verification.

Windows: Git Bash or WSL (same script).

---

## Post-restore verification

- [ ] Authorised users can sign in (Auth0 still configured)
- [ ] Recent orders appear (Cosmo) or Vault equivalent records appear
- [ ] Vault vs Cosmo were **not** swapped
- [ ] `prisma migrate status` matches enough to serve traffic
- [ ] Drill: live production row counts unchanged

---

## Files and media (not in the Postgres dump)

| Store | What | v1 recovery |
|-------|------|-------------|
| Vercel Blob | Book-note receipts, admin files, academy media | Vendor recovery / Vercel support. Independent copy job **not built yet**. |
| Cloudinary | Logos / academy uploads | Cloudinary plan backup. |

**Mismatch after a DB restore:** rows may point at blobs that are newer, older, or missing. Prefer the restored DB as source of truth for *which* files should exist; missing files stay missing until re-uploaded or restored from the vendor. Do not bulk-delete Blob objects to “match” an older DB without an explicit yes.

---

## Secret inventory (values in 1Password)

Names only here. Production values never go in git.

| Name | Used for |
|------|----------|
| `DATABASE_URL` / `DIRECT_URL` × vault, cosmo-dev, cosmo-prod | App + migrate + dump |
| `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`, M2M ids | Login |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob |
| `CLOUDINARY_URL`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Media |
| `BACKUP_AGE_RECIPIENT` / age **private** identity | Dump encrypt / restore decrypt |
| R2 token + bucket + endpoint | Independent copies |
| `BACKUP_LIVE_HOST_*` | Restore gates |
| Shopify / ERPNext / Maileroo keys | Integrations (those vendors’ DR is separate) |

Cross-check: `.env.example` lists app env names. GitHub dump secrets are **not** copied into Vercel.

---

## Restore drill log (every 90 days)

Target is **always** a new empty host. Programme is not complete until the first row is filled.

| Date | Operator | System | Object key | Verification | Live prod untouched |
|------|----------|--------|------------|--------------|---------------------|
| | | | | | |
| | | | | | |

---

## Notify

On a real incident: the two restore-confirmers, then whoever owns Vercel DNS, then business owners. Failed nightly dump: fix secrets/R2 the same day — do not wait for a disaster.
