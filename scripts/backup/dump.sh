#!/usr/bin/env bash
# Dump one protected system: pg_dump -Fc → age → R2.
# Usage: scripts/backup/dump.sh --system vault|cosmo-dev|cosmo-prod
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

SYSTEM=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --system)
      SYSTEM="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$SYSTEM" ]]; then
  echo "Usage: scripts/backup/dump.sh --system vault|cosmo-dev|cosmo-prod" >&2
  exit 1
fi

case "$SYSTEM" in
  vault)
    export DIRECT_URL="${BACKUP_DIRECT_URL_VAULT:-${DIRECT_URL:-}}"
    ;;
  cosmo-dev)
    export DIRECT_URL="${BACKUP_DIRECT_URL_COSMO_DEV:-${DIRECT_URL:-}}"
    ;;
  cosmo-prod)
    export DIRECT_URL="${BACKUP_DIRECT_URL_COSMO_PROD:-${DIRECT_URL:-}}"
    ;;
  *)
    echo "Invalid --system: $SYSTEM" >&2
    exit 1
    ;;
esac

if [[ -z "${DIRECT_URL:-}" ]]; then
  echo "DIRECT_URL missing for $SYSTEM (set BACKUP_DIRECT_URL_* or DIRECT_URL)" >&2
  exit 1
fi

for cmd in pg_dump age aws npx; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Required command not found: $cmd" >&2
    exit 1
  fi
done

if [[ -z "${BACKUP_AGE_RECIPIENT:-}" ]]; then
  echo "BACKUP_AGE_RECIPIENT (age public key) is required" >&2
  exit 1
fi
if [[ -z "${R2_BUCKET:-}" || -z "${R2_ENDPOINT:-}" || -z "${R2_ACCESS_KEY_ID:-}" || -z "${R2_SECRET_ACCESS_KEY:-}" ]]; then
  echo "R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY are required" >&2
  exit 1
fi

npx tsx scripts/backup/assert-direct-url.ts

TMP="$(mktemp -d)"
DUMP="$TMP/${SYSTEM}.dump"
DUMP_AGE="$TMP/${SYSTEM}.dump.age"
EXISTING="$TMP/existing.json"
STATUS_OUT="$TMP/status.json"
ERROR_MSG=""
OK=false
DAILY_KEY=""
BYTES=""

r2() {
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
    AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}" \
    aws --endpoint-url "$R2_ENDPOINT" "$@"
}

upload_status() {
  local ok_flag="$1"
  local err="${2:-}"
  if r2 s3 cp "s3://${R2_BUCKET}/status/${SYSTEM}.json" "$EXISTING" >/dev/null 2>&1; then
    :
  else
    printf '%s\n' '{}' >"$EXISTING"
  fi
  local args=(
    --system "$SYSTEM"
    --existing "$EXISTING"
    --out "$STATUS_OUT"
  )
  if [[ "$ok_flag" == "true" ]]; then
    args+=(--ok true --object-key "$DAILY_KEY" --bytes "${BYTES:-0}")
  else
    args+=(--ok false --error "${err:-dump failed}")
  fi
  npx tsx scripts/backup/write-status.ts "${args[@]}"
  r2 s3 cp "$STATUS_OUT" "s3://${R2_BUCKET}/status/${SYSTEM}.json" \
    --content-type application/json >/dev/null
}

cleanup() {
  rm -rf "$TMP"
}
trap cleanup EXIT

set +e
eval "$(npx tsx scripts/backup/print-object-key.ts --system "$SYSTEM" --format env)"
set -e
DAILY_KEY="${DAILY_KEY:-}"

if [[ -z "$DAILY_KEY" ]]; then
  echo "Failed to compute object keys" >&2
  exit 1
fi

if pg_dump -Fc -d "$DIRECT_URL" --no-owner --no-acl -f "$DUMP"; then
  if age -r "$BACKUP_AGE_RECIPIENT" -o "$DUMP_AGE" "$DUMP"; then
    BYTES="$(wc -c <"$DUMP_AGE" | tr -d ' ')"
    META_TAKEN="${TAKEN_AT:-}"
    if r2 s3 cp "$DUMP_AGE" "s3://${R2_BUCKET}/${DAILY_KEY}" \
      --content-type application/octet-stream \
      --metadata "system=${SYSTEM},taken-at=${META_TAKEN},format=pg_dump-Fc"; then
      if [[ -n "${WEEKLY_KEY:-}" ]]; then
        r2 s3 cp "$DUMP_AGE" "s3://${R2_BUCKET}/${WEEKLY_KEY}" \
          --content-type application/octet-stream \
          --metadata "system=${SYSTEM},taken-at=${META_TAKEN},format=pg_dump-Fc"
      fi
      if [[ -n "${MONTHLY_KEY:-}" ]]; then
        r2 s3 cp "$DUMP_AGE" "s3://${R2_BUCKET}/${MONTHLY_KEY}" \
          --content-type application/octet-stream \
          --metadata "system=${SYSTEM},taken-at=${META_TAKEN},format=pg_dump-Fc"
      fi
      OK=true
    else
      ERROR_MSG="R2 upload failed"
    fi
  else
    ERROR_MSG="age encrypt failed"
  fi
else
  ERROR_MSG="pg_dump failed"
fi

rm -f "$DUMP" "$DUMP_AGE"

if [[ "$OK" == "true" ]]; then
  upload_status true
  echo "Dumped $SYSTEM -> $DAILY_KEY (${BYTES} bytes)"
  if [[ -n "${WEEKLY_KEY:-}" ]]; then echo "Also weekly: $WEEKLY_KEY"; fi
  if [[ -n "${MONTHLY_KEY:-}" ]]; then echo "Also monthly: $MONTHLY_KEY"; fi
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    {
      echo "### $SYSTEM"
      echo "- daily: \`$DAILY_KEY\`"
      echo "- bytes: $BYTES"
    } >>"$GITHUB_STEP_SUMMARY"
  fi
  exit 0
fi

upload_status false "$ERROR_MSG" || true
echo "Dump failed for $SYSTEM: $ERROR_MSG" >&2
exit 1
