# Contract: Independent backup object store

S3-compatible layout on Cloudflare R2 (or documented S3 fallback). Private bucket. No public ACLs.

## Bucket

- One bucket for all three systems (isolation is key prefix + encryption, not separate buckets).
- Region: operator choice; not Neon’s AWS account.

## Object keys

```
daily/{system}/{system}-{YYYYMMDDTHHmmss}Z.dump.age
weekly/{system}/{system}-{YYYYMMDDTHHmmss}Z.dump.age
monthly/{system}/{system}-{YYYYMMDDTHHmmss}Z.dump.age
status/{system}.json
```

`{system}` = `vault` | `cosmo-dev` | `cosmo-prod`.  
Timestamp = copy start, UTC, compact ISO without colons.

**Example**: `daily/cosmo-prod/cosmo-prod-20260905T163000Z.dump.age`

## Dump object

| Item | Value |
|------|--------|
| Body | age ciphertext of `pg_dump -Fc` |
| Content-Type | `application/octet-stream` |
| Metadata | `x-amz-meta-system`, `x-amz-meta-taken-at` (ISO), `x-amz-meta-format` = `pg_dump-Fc` |

PUT is the commit point. Partial/local files are not backups.

## Status object `status/{system}.json`

```json
{
  "system": "cosmo-prod",
  "lastAttemptAt": "2026-09-05T16:30:00.000Z",
  "lastSuccessAt": "2026-09-05T16:30:00.000Z",
  "ok": true,
  "error": null,
  "objectKey": "daily/cosmo-prod/cosmo-prod-20260905T163000Z.dump.age",
  "bytes": 123456789
}
```

On failure: `ok: false`, `error` set, `objectKey`/`bytes` null, **do not** clear `lastSuccessAt` from the previous success (read-modify-write: load existing status, update attempt fields, keep prior `lastSuccessAt` if this attempt failed).

## Lifecycle (bucket rules)

| Prefix | Expire after |
|--------|----------------|
| `daily/` | 8 days |
| `weekly/` | 35 days |
| `monthly/` | 400 days |
| `status/` | never |

Do not add a job that bulk-deletes `daily/` on failure days.

## Access

| Principal | Allow |
|-----------|--------|
| GitHub Actions (R2 token) | `PutObject`, `GetObject`, `ListBucket` on this bucket (delete not required for v1) |
| Operator restore machine | `GetObject`, `ListBucket` |
| Public | none |

## Forbidden

- Keys containing secrets or `DIRECT_URL`
- Unencrypted `.dump` left in the bucket
- Writing Vault dumps under `cosmo-*` prefixes
