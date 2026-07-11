#!/usr/bin/env bash
set -euo pipefail

docker compose up -d postgres
until docker compose exec -T postgres pg_isready -U orbit -d orbit >/dev/null 2>&1; do sleep 1; done
export DATABASE_URL="postgresql://orbit:orbit@127.0.0.1:5432/orbit"
pnpm db:migration:run
pnpm db:migration:revert
pnpm db:migration:revert
pnpm db:migration:revert
pnpm db:migration:run
docker compose exec -T postgres psql -U orbit -d orbit -v ON_ERROR_STOP=1 -tAc "SELECT count(*) FROM pg_constraint WHERE conname IN ('ck_qna_source_mode','ck_qna_answer_audio_mode','fk_focused_attempt_session')" | grep -qx '3'
