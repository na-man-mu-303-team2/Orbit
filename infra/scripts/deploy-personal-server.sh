#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${ORBIT_APP_DIR:-/var/www/orbit}"
DEPLOY_BRANCH="${ORBIT_DEPLOY_BRANCH:-develop}"
LOCK_FILE="${ORBIT_DEPLOY_LOCK_FILE:-/tmp/orbit-personal-server-deploy.lock}"

COMPOSE=(
  docker compose
  -f docker-compose.yml
  -f docker-compose.staging.yml
)

check_web_headers() {
  local headers
  headers="$(curl -fsSI http://127.0.0.1/)" || return 1
  printf '%s\n' "$headers" | tr -d '\r' | grep -qi '^Cross-Origin-Opener-Policy: same-origin$' || return 1
  printf '%s\n' "$headers" | tr -d '\r' | grep -qi '^Cross-Origin-Embedder-Policy: require-corp$' || return 1
  printf '%s\n' "$headers" | tr -d '\r' | grep -qi '^Cross-Origin-Resource-Policy: same-origin$' || return 1
}

cd "$APP_DIR"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another deployment is already running."
  exit 1
fi

git switch "$DEPLOY_BRANCH"
git pull --ff-only origin "$DEPLOY_BRANCH"

doppler run -- "${COMPOSE[@]}" config --quiet
doppler run -- "${COMPOSE[@]}" build
doppler run -- "${COMPOSE[@]}" up -d postgres redis minio minio-init
doppler run -- "${COMPOSE[@]}" run --rm api corepack pnpm db:migration:run
doppler run -- "${COMPOSE[@]}" up -d

for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1/api/health >/dev/null && check_web_headers; then
    doppler run -- "${COMPOSE[@]}" ps
    exit 0
  fi

  echo "Waiting for services to become healthy... attempt ${attempt}/30"
  sleep 2
done

echo "Deployment finished, but health checks did not pass in time."
doppler run -- "${COMPOSE[@]}" ps
exit 1
