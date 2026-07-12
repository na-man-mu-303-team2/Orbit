#!/usr/bin/env bash
set -euo pipefail

docker compose up -d postgres redis private-evidence-redis minio minio-init
until docker compose exec -T postgres pg_isready -U orbit -d orbit >/dev/null 2>&1; do sleep 1; done
until docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do sleep 1; done
until docker compose exec -T private-evidence-redis redis-cli ping 2>/dev/null | grep -q PONG; do sleep 1; done
pnpm --filter @orbit/api test
pnpm --filter @orbit/worker test
