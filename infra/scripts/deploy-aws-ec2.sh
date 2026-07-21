#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${ORBIT_APP_DIR:-/opt/orbit/source}"
ENV_FILE="${ORBIT_ENV_FILE:-/etc/orbit/production.env}"
COMPOSE_FILE="${ORBIT_COMPOSE_FILE:-docker-compose.aws.yml}"
LOCK_FILE="${ORBIT_DEPLOY_LOCK_FILE:-/tmp/orbit-aws-production-deploy.lock}"

cd "$APP_DIR"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another production deployment is already running."
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing production env file: $ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

required_keys=(
  NODE_ENV
  APP_ENV
  API_PORT
  WORKER_PORT
  PYTHON_WORKER_PORT
  WEB_ORIGIN
  API_BASE_URL
  PYTHON_WORKER_URL
  DATABASE_URL
  REDIS_URL
  SESSION_SECRET
  COOKIE_SECRET
  STORAGE_DRIVER
  S3_BUCKET
  S3_REGION
  S3_FORCE_PATH_STYLE
  JOB_QUEUE_DRIVER
  SLIDE_PRACTICE_ENABLED
  SLIDE_QUESTION_GUIDES_ENABLED
  LIVE_STT_PROVIDER
  REPORT_STT_PROVIDER
  REHEARSAL_AUDIO_MAX_BYTES
  OCR_PROVIDER
  LLM_PROVIDER
  OPENAI_API_KEY
  OPENAI_MODEL
  OPENAI_TRANSCRIPTION_MODEL
  OPENAI_EMBEDDING_MODEL
  AWS_REGION
  TRANSCRIBE_LANGUAGE_CODE
  TEXTRACT_ENABLED
  AUTH_COOKIE_SECURE
  LOG_LEVEL
  LOG_PRETTY
  DEMO_USER_ID
  DEMO_WORKSPACE_ID
  DEMO_PROJECT_ID
  DEMO_DECK_ID
  DEMO_SESSION_ID
)

missing_keys=()
for key in "${required_keys[@]}"; do
  if [ -z "${!key:-}" ]; then
    missing_keys+=("$key")
  fi
done

if [ "${#missing_keys[@]}" -gt 0 ]; then
  printf 'Missing required env keys: %s\n' "${missing_keys[*]}"
  exit 1
fi

COMPOSE=(docker compose -f "$COMPOSE_FILE")

"${COMPOSE[@]}" config --quiet

# Prepare service images. Default keeps the existing on-box build so behaviour
# is unchanged until the registry cutover is deliberately enabled. Set
# DEPLOY_USE_REGISTRY=true (once GHCR images and auth are in place) to pull
# prebuilt images instead of building them here. See
# docs/runbooks/deploy-image-registry-migration.md.
if [ "${DEPLOY_USE_REGISTRY:-false}" = "true" ]; then
  IMAGE_REGISTRY="${IMAGE_REGISTRY:-ghcr.io}"
  # Use the branch tag (e.g. main) rather than the exact commit SHA: commits
  # that touch only scripts or docs do not trigger build-images, so a per-SHA
  # tag may not exist, while the branch tag always points at the latest built
  # app image.
  IMAGE_TAG="${IMAGE_TAG:-$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD)}"
  export IMAGE_TAG
  ghcr_user="${GHCR_USERNAME:-orbit-deploy}"
  ghcr_token="${GHCR_TOKEN:-}"
  if [ -z "$ghcr_token" ] && [ -n "${GHCR_TOKEN_SSM_PARAM:-}" ]; then
    ghcr_token="$(aws ssm get-parameter --with-decryption --region "$AWS_REGION" \
      --name "$GHCR_TOKEN_SSM_PARAM" --query 'Parameter.Value' --output text)"
  fi
  if [ -z "$ghcr_token" ]; then
    echo "DEPLOY_USE_REGISTRY=true but no GHCR token (set GHCR_TOKEN or GHCR_TOKEN_SSM_PARAM)."
    exit 1
  fi
  printf '%s' "$ghcr_token" | docker login "$IMAGE_REGISTRY" -u "$ghcr_user" --password-stdin
  "${COMPOSE[@]}" pull api worker python-worker
else
  "${COMPOSE[@]}" build
fi

"${COMPOSE[@]}" up -d --wait --wait-timeout 120 redis private-evidence-redis
"${COMPOSE[@]}" run --rm --no-deps api corepack pnpm --filter @orbit/api migration:run
"${COMPOSE[@]}" up -d

for attempt in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3000/health >/dev/null && curl -fsS http://127.0.0.1/api/health >/dev/null; then
    "${COMPOSE[@]}" ps
    exit 0
  fi

  echo "Waiting for production services... attempt ${attempt}/60"
  sleep 5
done

echo "Deployment finished, but health checks did not pass in time."
"${COMPOSE[@]}" ps
exit 1
