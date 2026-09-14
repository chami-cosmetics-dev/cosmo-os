#!/usr/bin/env bash
# Restore an encrypted dump onto a throwaway (or confirmed live) DIRECT_URL.
# Usage: scripts/backup/restore.sh --system vault|cosmo-dev|cosmo-prod \
#   (--object-key KEY | --from-latest-daily) --target-direct-url URL
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

SYSTEM=""
OBJECT_KEY=""
FROM_LATEST=false
TARGET=""
ALLOW_DRIFT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --system)
      SYSTEM="${2:-}"
      shift 2
      ;;
    --object-key)
      OBJECT_KEY="${2:-}"
      shift 2
      ;;
    --from-latest-daily)
      FROM_LATEST=true
      shift
      ;;
    --target-direct-url)
      TARGET="${2:-}"
      shift 2
      ;;
    --allow-schema-drift)
      ALLOW_DRIFT=true
      shift
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$SYSTEM" || -z "$TARGET" ]]; then
  echo "Usage: scripts/backup/restore.sh --system <id> --target-direct-url <direct-url> (--object-key <key> | --from-latest-daily)" >&2
  exit 1
fi

if [[ "$FROM_LATEST" != true && -z "$OBJECT_KEY" ]]; then
  echo "Provide --object-key or --from-latest-daily" >&2
  exit 1
fi

for cmd in pg_restore age aws npx; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Required command not found: $cmd" >&2
    exit 1
  fi
done

if [[ -z "${BACKUP_AGE_IDENTITY:-}" ]]; then
  echo "BACKUP_AGE_IDENTITY must be a file path to the age private key (1Password → temp file). Never commit it." >&2
  exit 1
fi
if [[ ! -f "$BACKUP_AGE_IDENTITY" ]]; then
  echo "BACKUP_AGE_IDENTITY file not found" >&2
  exit 1
fi
if [[ -z "${R2_BUCKET:-}" || -z "${R2_ENDPOINT:-}" || -z "${R2_ACCESS_KEY_ID:-}" || -z "${R2_SECRET_ACCESS_KEY:-}" ]]; then
  echo "R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY are required" >&2
  exit 1
fi

r2() {
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
    AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}" \
    aws --endpoint-url "$R2_ENDPOINT" "$@"
}

if [[ "$FROM_LATEST" == true && -z "$OBJECT_KEY" ]]; then
  OBJECT_KEY="$(
    r2 s3 ls "s3://${R2_BUCKET}/daily/${SYSTEM}/" \
      | awk '{print $4}' \
      | sort \
      | tail -n 1
  )"
  if [[ -z "$OBJECT_KEY" ]]; then
    echo "No daily objects for $SYSTEM" >&2
    exit 1
  fi
  OBJECT_KEY="daily/${SYSTEM}/${OBJECT_KEY}"
fi

export BACKUP_SYSTEM="$SYSTEM"
export TARGET_DIRECT_URL="$TARGET"
export BACKUP_OBJECT_KEY="$OBJECT_KEY"
npx tsx scripts/backup/assert-restore-gates.ts

echo "Restoring $SYSTEM from $OBJECT_KEY onto target host (URL not printed)"
echo "pg_restore --clean --if-exists will replace objects on the target."

TMP="$(mktemp -d)"
AGE_FILE="$TMP/dump.dump.age"
DUMP_FILE="$TMP/dump.dump"
cleanup() {
  rm -rf "$TMP"
}
trap cleanup EXIT

r2 s3 cp "s3://${R2_BUCKET}/${OBJECT_KEY}" "$AGE_FILE"
age -d -i "$BACKUP_AGE_IDENTITY" -o "$DUMP_FILE" "$AGE_FILE"
pg_restore --no-owner --no-acl --clean --if-exists -d "$TARGET" "$DUMP_FILE" || true

export DATABASE_URL="$TARGET"
export DIRECT_URL="$TARGET"
set +e
npx prisma migrate status
MIGRATE_STATUS=$?
set -e

echo ""
echo "Verification checklist (tick in the runbook, do not skip):"
echo "  [ ] authorised users can sign in"
echo "  [ ] recent orders (or Vault equivalent) appear"
echo "  [ ] Vault vs Cosmo product lines were not swapped"
echo "  [ ] prisma migrate status is acceptable for serving traffic"

if [[ "$MIGRATE_STATUS" -ne 0 && "$ALLOW_DRIFT" != true ]]; then
  echo "prisma migrate status reported drift or error (exit $MIGRATE_STATUS). Re-run with --allow-schema-drift only if you understand the risk. Do not db push." >&2
  exit "$MIGRATE_STATUS"
fi

exit 0
