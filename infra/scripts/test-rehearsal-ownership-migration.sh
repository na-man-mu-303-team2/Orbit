#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

database_name="orbit"
container_name="orbit-rehearsal-ownership-test-${RANDOM}-$$"
ownership_migration_name="AddRehearsalOwnership2026071503000"
max_targeted_reverts=20

postgres() {
  docker exec -i "$container_name" psql \
    -U orbit \
    -d "$database_name" \
    -v ON_ERROR_STOP=1 \
    "$@"
}

ownership_migration_is_applied() {
  local applied
  applied="$({ postgres -tAc "
    SELECT EXISTS (
      SELECT 1
      FROM typeorm_migrations
      WHERE name = '${ownership_migration_name}'
    );
  "; } | tr -d '[:space:]')"
  test "$applied" = "t"
}

revert_through_ownership_migration() {
  local revert_count=0

  if ! ownership_migration_is_applied; then
    echo "ownership migration is not applied: ${ownership_migration_name}" >&2
    exit 1
  fi

  while ownership_migration_is_applied; do
    if ((revert_count >= max_targeted_reverts)); then
      echo "ownership migration remained applied after ${max_targeted_reverts} reverts" >&2
      exit 1
    fi

    pnpm db:migration:revert
    revert_count=$((revert_count + 1))
  done

  echo "Reverted ownership migration and ${revert_count} migration(s) at or after it."
}

cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
}

trap cleanup EXIT

docker run \
  --detach \
  --rm \
  --name "$container_name" \
  --env POSTGRES_DB="$database_name" \
  --env POSTGRES_USER=orbit \
  --env POSTGRES_PASSWORD=orbit \
  --publish 127.0.0.1::5432 \
  pgvector/pgvector:pg18 \
  >/dev/null

for _ in {1..60}; do
  if docker exec "$container_name" pg_isready -U orbit -d "$database_name" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker exec "$container_name" pg_isready -U orbit -d "$database_name" >/dev/null 2>&1; then
  echo "temporary PostgreSQL did not become ready" >&2
  exit 1
fi

postgres_port="$(docker port "$container_name" 5432/tcp | awk -F: 'NR == 1 { print $NF }')"
set -a
source .env.example
set +a
export NODE_ENV=test
export APP_ENV=test
export DATABASE_URL="postgresql://orbit:orbit@127.0.0.1:${postgres_port}/${database_name}"

# Build the complete schema, then return to the state immediately before the
# ownership migration. Newer migrations must be reverted first because TypeORM
# only reverts the latest applied migration.
pnpm db:migration:run
revert_through_ownership_migration

postgres <<'SQL'
INSERT INTO projects (project_id, workspace_id, title, created_by)
VALUES ('project_legacy', 'workspace_test', 'Legacy rehearsal project', 'user_legacy_owner');

INSERT INTO project_assets (
  file_id,
  project_id,
  storage_key,
  original_name,
  mime_type,
  size,
  url,
  purpose,
  status,
  uploaded_at
)
VALUES
  (
    'file_legacy_audio',
    'project_legacy',
    'projects/project_legacy/private/rehearsal.webm',
    'rehearsal.webm',
    'audio/webm',
    16,
    'internal://legacy-audio',
    'rehearsal-audio',
    'uploaded',
    now()
  ),
  (
    'file_legacy_snapshot',
    'project_legacy',
    'projects/project_legacy/private/slide-1.png',
    'slide-1.png',
    'image/png',
    8,
    'internal://legacy-snapshot',
    'rehearsal-slide-snapshot',
    'uploaded',
    now()
  ),
  (
    'file_public_deck',
    'project_legacy',
    'projects/project_legacy/deck.pptx',
    'deck.pptx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    32,
    'internal://public-deck',
    'pptx-import',
    'uploaded',
    now()
  );

INSERT INTO rehearsal_runs (run_id, project_id, deck_id, status)
VALUES ('run_legacy', 'project_legacy', 'deck_legacy', 'created');
SQL

pnpm db:migration:run

ownership_rows="$({ postgres -tAc "
  SELECT
    (SELECT count(*) FROM users
      WHERE user_id = 'user_legacy_owner'
        AND email LIKE 'disabled-legacy-project-owner-%@invalid'
        AND password_hash LIKE '\$argon2id\$%'),
    (SELECT created_by_user_id FROM rehearsal_runs WHERE run_id = 'run_legacy'),
    (SELECT created_by_user_id FROM project_assets WHERE file_id = 'file_legacy_audio'),
    (SELECT created_by_user_id FROM project_assets WHERE file_id = 'file_legacy_snapshot'),
    (SELECT created_by_user_id IS NULL FROM project_assets WHERE file_id = 'file_public_deck');
"; } | tr -d '[:space:]')"
test "$ownership_rows" = "1|user_legacy_owner|user_legacy_owner|user_legacy_owner|t"

schema_objects="$({ postgres -tAc "
  SELECT count(*)
  FROM (
    SELECT conname AS object_name
    FROM pg_constraint
    WHERE conname IN (
      'fk_rehearsal_runs_created_by_user',
      'fk_project_assets_created_by_user',
      'ck_project_assets_private_rehearsal_creator'
    )
    UNION ALL
    SELECT indexname
    FROM pg_indexes
    WHERE indexname IN (
      'idx_rehearsal_runs_project_creator_created_at',
      'idx_project_assets_project_creator_purpose_status'
    )
  ) ownership_objects;
"; } | tr -d '[:space:]')"
test "$schema_objects" = "5"

if postgres -c "
  INSERT INTO project_assets (
    file_id, project_id, storage_key, original_name, mime_type, size, url, purpose, status
  ) VALUES (
    'file_invalid_private', 'project_legacy', 'invalid', 'invalid.webm',
    'audio/webm', 1, 'internal://invalid', 'rehearsal-audio', 'uploaded'
  );
" >/dev/null 2>&1; then
  echo "private rehearsal assets unexpectedly accepted a null creator" >&2
  exit 1
fi

postgres -c "
  INSERT INTO project_assets (
    file_id, project_id, storage_key, original_name, mime_type, size, url, purpose, status
  ) VALUES (
    'file_public_without_creator', 'project_legacy', 'public', 'public.pdf',
    'application/pdf', 1, 'internal://public', 'reference-material', 'uploaded'
  );
" >/dev/null

revert_through_ownership_migration

columns_after_revert="$({ postgres -tAc "
  SELECT count(*)
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('rehearsal_runs', 'project_assets')
    AND column_name = 'created_by_user_id';
"; } | tr -d '[:space:]')"
test "$columns_after_revert" = "0"

legacy_rows_after_revert="$({ postgres -tAc "
  SELECT
    (SELECT count(*) FROM rehearsal_runs WHERE run_id = 'run_legacy'),
    (SELECT count(*) FROM project_assets WHERE file_id IN (
      'file_legacy_audio',
      'file_legacy_snapshot',
      'file_public_deck',
      'file_public_without_creator'
    )),
    (SELECT count(*) FROM users WHERE user_id = 'user_legacy_owner');
"; } | tr -d '[:space:]')"
test "$legacy_rows_after_revert" = "1|4|1"

pnpm db:migration:run

second_backfill="$({ postgres -tAc "
  SELECT
    (SELECT count(*) FROM project_assets
      WHERE file_id IN ('file_legacy_audio', 'file_legacy_snapshot')
        AND created_by_user_id = 'user_legacy_owner'),
    (SELECT count(*) FROM users WHERE user_id = 'user_legacy_owner');
"; } | tr -d '[:space:]')"
test "$second_backfill" = "2|1"

echo "Rehearsal ownership migration cycle passed."
