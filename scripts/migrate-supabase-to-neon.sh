#!/usr/bin/env bash
# Migrate data from Supabase to Neon using pg_dump and pg_restore
# Requires: pg_dump and pg_restore (install via: brew install libpq && brew link --force libpq)
#
# Get Supabase direct connection from: Project Settings > Database > Connection string > Direct connection
# Use db.[ref].supabase.co (NOT pooler.supabase.com) for pg_dump

set -e

SUPABASE_DIRECT_URL="${SUPABASE_DIRECT_URL:-}"
NEON_DIRECT_URL="${NEON_DIRECT_URL:-$DIRECT_URL}"
DUMP_FILE="supabase_dump.bak"

if [ -z "$SUPABASE_DIRECT_URL" ]; then
  echo "Error: Set SUPABASE_DIRECT_URL to your Supabase direct connection string"
  echo "Example: SUPABASE_DIRECT_URL='postgresql://postgres.ftfijdplywnxneglwqwi:[password]@db.ftfijdplywnxneglwqwi.supabase.co:5432/postgres?sslmode=require'"
  echo "Get it from: Supabase Dashboard > Project Settings > Database > Connection string > Direct connection"
  exit 1
fi

if [ -z "$NEON_DIRECT_URL" ]; then
  echo "Error: Set NEON_DIRECT_URL (or DIRECT_URL from .env) for the Neon restore target"
  echo "Example: source .env && ./scripts/migrate-supabase-to-neon.sh"
  exit 1
fi

echo "Step 1: Dumping from Supabase (public schema)..."
pg_dump -Fc -v -d "$SUPABASE_DIRECT_URL" --schema=public -f "$DUMP_FILE"

echo ""
echo "Step 2: Restoring to Neon..."
pg_restore -v --no-owner --no-acl --clean --if-exists -d "$NEON_DIRECT_URL" "$DUMP_FILE" || true
# --clean --if-exists drops existing objects before restore (full migration)
# pg_restore may exit 1 for non-fatal errors; ignore for idempotency

echo ""
echo "Done. Dump saved to $DUMP_FILE (keep as backup)."
echo "Verify data in Neon Console, then run: npx prisma generate"
