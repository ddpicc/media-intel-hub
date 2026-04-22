#!/usr/bin/env bash
set -euo pipefail

# Usage:
# LEGACY_DATABASE_URL=postgres://... DATABASE_URL=postgres://... ./scripts/migrate-from-supabase.sh
#
# Optional:
# - MIGRATE_TARGET_USER_ID=<uuid>   # map all imported rows to this user
# - MIGRATE_TARGET_EMAIL=<email>    # when MIGRATE_TARGET_USER_ID is set, ensure app_users has this email
# - MIGRATE_TRUNCATE=1              # truncate target tables before import

if [[ -z "${LEGACY_DATABASE_URL:-}" ]]; then
  echo "Missing LEGACY_DATABASE_URL"
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Missing DATABASE_URL"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "[1/6] Ensure target schema exists"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/db/schema.sql" >/dev/null

TABLES=(
  "public.monitor_sources"
  "public.monitor_items"
  "public.monitor_api_logs"
)

echo "[2/6] Discover legacy user ids"
LEGACY_USER_IDS_FILE="$TMP_DIR/legacy_user_ids.txt"
psql "$LEGACY_DATABASE_URL" -At <<'SQL' > "$LEGACY_USER_IDS_FILE"
select distinct user_id::text
from (
  select user_id from public.monitor_sources
  union all
  select user_id from public.monitor_items
  union all
  select user_id from public.monitor_api_logs
) t
where user_id is not null;
SQL

if [[ "${MIGRATE_TRUNCATE:-0}" == "1" ]]; then
  echo "[3/6] Truncate target tables"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
truncate table public.monitor_api_logs, public.monitor_items, public.monitor_sources restart identity cascade;
SQL
fi

echo "[4/6] Seed app_users placeholders for foreign keys"
while IFS= read -r uid; do
  [[ -z "$uid" ]] && continue
  safe_uid="${uid//\'/''}"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL >/dev/null
insert into public.app_users (id, email, password_hash)
values ('$safe_uid'::uuid, 'migrated+$safe_uid@local.invalid', 'migrated:disabled')
on conflict (id) do nothing;
SQL
done < "$LEGACY_USER_IDS_FILE"

if [[ -n "${MIGRATE_TARGET_USER_ID:-}" ]]; then
  target_email="${MIGRATE_TARGET_EMAIL:-${MIGRATE_TARGET_USER_ID}@local.invalid}"
  echo "[4.1/6] Ensure target mapped user exists: ${MIGRATE_TARGET_USER_ID}"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL >/dev/null
insert into public.app_users (id, email, password_hash)
values ('${MIGRATE_TARGET_USER_ID}'::uuid, '${target_email}', 'migrated:disabled')
on conflict (id) do update set email = excluded.email, updated_at = timezone('utc', now());
SQL
fi

echo "[5/6] Dump and restore legacy data"
for table in "${TABLES[@]}"; do
  name="${table##*.}"
  dump_file="$TMP_DIR/${name}.sql"
  pg_dump "$LEGACY_DATABASE_URL" \
    --data-only \
    --inserts \
    --column-inserts \
    --table="$table" \
    > "$dump_file"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$dump_file" >/dev/null
done

if [[ -n "${MIGRATE_TARGET_USER_ID:-}" ]]; then
  echo "[5.1/6] Remap all imported rows to target user: ${MIGRATE_TARGET_USER_ID}"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL >/dev/null
update public.monitor_sources set user_id = '${MIGRATE_TARGET_USER_ID}'::uuid where user_id is not null;
update public.monitor_items set user_id = '${MIGRATE_TARGET_USER_ID}'::uuid where user_id is not null;
update public.monitor_api_logs set user_id = '${MIGRATE_TARGET_USER_ID}'::uuid where user_id is not null;
SQL
fi

echo "[6/6] Done"
echo "Migration completed."
