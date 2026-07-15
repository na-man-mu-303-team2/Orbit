#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${ORBIT_APP_DIR:-/var/www/orbit}"
DEPLOY_BRANCH="${ORBIT_DEPLOY_BRANCH:-develop}"
LOCK_FILE="${ORBIT_DEPLOY_LOCK_FILE:-/tmp/orbit-personal-server-deploy.lock}"
FIRST_ARGUMENT="${1:-}"

if [[ "$FIRST_ARGUMENT" =~ ^[0-9a-f]{40}$ ]]; then
  DEPLOYMENT_MODE="full"
  EXPECTED_SHA="$FIRST_ARGUMENT"
else
  DEPLOYMENT_MODE="${FIRST_ARGUMENT:-full}"
  EXPECTED_SHA="${2:-}"
fi

COMPOSE=(
  docker compose
  -f docker-compose.yml
  -f docker-compose.staging.yml
)

cd "$APP_DIR"

if [[ "$DEPLOYMENT_MODE" != "full" && "$DEPLOYMENT_MODE" != "environment-only" ]]; then
  echo "Invalid deployment mode."
  exit 1
fi

if [[ -n "$EXPECTED_SHA" && ! "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Invalid expected deployment SHA."
  exit 1
fi

if [[ "$DEPLOYMENT_MODE" == "environment-only" && -z "$EXPECTED_SHA" ]]; then
  echo "Environment-only deployment requires an expected SHA."
  exit 1
fi

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another deployment is already running."
  exit 1
fi

if [[ "$DEPLOYMENT_MODE" == "full" ]]; then
  git switch "$DEPLOY_BRANCH"
  git pull --ff-only origin "$DEPLOY_BRANCH"
fi

if [[ -n "$EXPECTED_SHA" && "$(git rev-parse HEAD)" != "$EXPECTED_SHA" ]]; then
  echo "Server HEAD does not match the requested develop SHA. Deployment refused."
  exit 1
fi

doppler run -- bash infra/scripts/check-personal-staging-env.sh
doppler run -- "${COMPOSE[@]}" config --quiet

if [[ "$DEPLOYMENT_MODE" == "environment-only" ]]; then
  doppler run -- "${COMPOSE[@]}" run --rm --no-deps api \
    node -e 'const { loadOrbitConfig } = require("/app/packages/config/dist/index.js"); loadOrbitConfig(process.env, { service: "api" });'
  doppler run -- "${COMPOSE[@]}" run --rm --no-deps worker \
    node -e 'const { loadOrbitConfig } = require("/app/packages/config/dist/index.js"); loadOrbitConfig(process.env, { service: "worker" });'
  doppler run -- "${COMPOSE[@]}" run --rm --no-deps python-worker \
    uv run python -c 'from app.config import load_config; load_config()'
  doppler run -- "${COMPOSE[@]}" up -d --no-build --force-recreate api worker python-worker web
else
  doppler run -- "${COMPOSE[@]}" build
  doppler run -- "${COMPOSE[@]}" up -d postgres redis minio minio-init
  doppler run -- "${COMPOSE[@]}" run --rm api corepack pnpm db:migration:run
  doppler run -- "${COMPOSE[@]}" up -d
fi

for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1/api/health >/dev/null && curl -fsS http://127.0.0.1/ >/dev/null; then
    doppler run -- "${COMPOSE[@]}" ps
    exit 0
  fi

  echo "Waiting for services to become healthy... attempt ${attempt}/30"
  sleep 2
done

echo "Deployment finished, but health checks did not pass in time."
doppler run -- "${COMPOSE[@]}" ps
exit 1
