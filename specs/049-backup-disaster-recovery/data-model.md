# Data Model: Backup & Disaster Recovery

**Feature**: `049-backup-disaster-recovery`  
**Date**: 2026-09-05

No Prisma models. Copies live in the independent object store. App databases are **sources**, not backup catalogs.

Logical entities map to objects + metadata (see [contracts/backup-object-store.md](./contracts/backup-object-store.md)).

## Protected system

Stable id used in every key, status file, and restore flag.

| id | Label | Copy cadence | Retention |
|----|--------|--------------|-----------|
| `vault` | Vault OS | Daily | 7 daily + 4 weekly + 12 monthly |
| `cosmo-prod` | Cosmo OS production | Daily (never skip) | 7 daily + 4 weekly + 12 monthly |
| `cosmo-dev` | Cosmo OS development | Daily | 7 daily only |

**Validation**: id ∈ {`vault`,`cosmo-dev`,`cosmo-prod`}. Restore CLI requires this id; must match object key prefix and `CONFIRM_PRODUCTION_RESTORE` when targeting live prod.

**Invariant**: Vault dump MUST NOT restore onto Cosmo live (and reverse) — FR-013.

## Independent copy (object)

One encrypted dump file.

| Field | Source | Rules |
|-------|--------|--------|
| system | key prefix / metadata | Required; one of the three ids |
| takenAt | metadata + filename timestamp | UTC ISO-8601 |
| retentionClass | prefix `daily` / `weekly` / `monthly` | See research R5 |
| contentType | `application/octet-stream` | age ciphertext |
| bytes | object size | > 0 or treat as failed copy |
| checksum | optional SHA-256 metadata | Recommended on upload |
| ok | implied by successful PUT | Missing/0-byte = failure (FR-018) |

**State**: `pending` (local dump) → `uploaded` (R2 PUT ok) → `expired` (lifecycle). No `uploaded` without encrypt step.

## Status snapshot

Object `status/{system}.json` overwritten each attempt.

| Field | Type | Rules |
|-------|------|--------|
| system | string | id |
| lastAttemptAt | string (ISO UTC) | Always set |
| lastSuccessAt | string (ISO UTC) \| null | Set only after encrypt+PUT of dump |
| ok | boolean | This attempt |
| error | string \| null | Short reason; no connection strings |
| objectKey | string \| null | Key of this attempt’s dump if ok |
| bytes | number \| null | |
| ageHours | derived | `(now - lastSuccessAt)` for overdue (>24h on prod/vault) |

**Overdue**: `cosmo-prod` or `vault` with `lastSuccessAt` older than 24h, or `ok: false` on last attempt — FR-004.

## Host rewind point

Not stored by us. Neon history window + snapshot name/timestamp. Runbook records: branch name, timestamp or LSN, operator, confirmation.

## Restore event

Recorded in the runbook drill log (markdown table or ops note), not a DB table.

| Field | Rules |
|-------|--------|
| at | ISO time |
| operator | name |
| system | id |
| path | `rewind` \| `independent-copy` |
| objectKey or rewind timestamp | Required for the path |
| target | `drill` \| `live` |
| confirmation | required if `live` |
| verification | checklist ticks (FR-011) |
| liveProductionUntouched | must be true for drills (FR-009) |

## Secret inventory (P2)

Names only in `docs/ops/backup-disaster-recovery.md`. Values in 1Password. Includes: three `DIRECT_URL`s, R2 token, age private key, Auth0/Vercel/Blob/Cloudinary keys needed to rebuild the app.

## Relationships

```text
ProtectedSystem 1──* IndependentCopy
ProtectedSystem 1──1 StatusSnapshot
IndependentCopy  *──? RestoreEvent
HostRewindPoint  *──? RestoreEvent
```

## Validation rules (shared)

- System id enum only
- Object keys: `{class}/{system}/{system}-{YYYYMMDDTHHmmss}Z.dump.age`
- Status JSON must not contain URLs with passwords
- Restore to live prod: `CONFIRM_PRODUCTION_RESTORE` equals `system`
- Restore drill: target URL must not equal live DIRECT_URL hosts for that system
