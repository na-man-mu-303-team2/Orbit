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
  # Pin the images to the exact deployed commit rather than the branch tag. The
  # AWS deploy and build-images both trigger on push:main, so the branch tag may
  # still point at the previous build (stale) when a deploy races ahead. The
  # per-SHA tag can never be stale: it either matches this commit or is not yet
  # present, in which case we wait briefly for build-images and finally fall back
  # to an on-box build (e.g. a commit that did not trigger build-images at all).
  #
  # Prefer the deploying workflow's commit (DEPLOY_COMMIT_SHA) over the on-box
  # HEAD: the static web bundle in S3 is built from that commit, and the on-box
  # `git pull` may have advanced HEAD to a newer commit if main moved while this
  # deploy was queued. Using it keeps the backend images, the migrations (run
  # from the api image) and the web bundle on the same commit. Fall back to the
  # checked-out HEAD for manual/local runs that do not set it.
  IMAGE_TAG="${IMAGE_TAG:-${DEPLOY_COMMIT_SHA:-$(git -C "$APP_DIR" rev-parse HEAD)}}"
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
  # Wait for the per-SHA images (build-images may still be running, since it and
  # this deploy both start on push:main). Retry briefly, then fall back to an
  # on-box build so the deploy never blocks indefinitely or ships a stale image.
  pull_attempts="${REGISTRY_PULL_ATTEMPTS:-10}"
  pulled=0
  for attempt in $(seq 1 "$pull_attempts"); do
    if "${COMPOSE[@]}" pull api worker python-worker; then
      pulled=1
      break
    fi
    echo "Registry images for ${IMAGE_TAG} not ready (attempt ${attempt}/${pull_attempts}); waiting for build-images..."
    sleep 30
  done
  if [ "$pulled" -ne 1 ]; then
    echo "Registry images for ${IMAGE_TAG} unavailable; building on-box as a fallback."
    # The static web bundle in S3 was built from DEPLOY_COMMIT_SHA, but the
    # on-box `git pull` may have advanced HEAD past it while this deploy was
    # queued. Building on-box now would ship backend/migration images from a
    # different commit than the deployed web bundle. Refuse the mixed-commit
    # release: the newer commit that moved HEAD triggers its own deploy, so
    # aborting here self-heals rather than shipping mismatched artifacts. We
    # fail instead of checking out DEPLOY_COMMIT_SHA because this script lives
    # in the same repo and rewriting the working tree mid-run would corrupt the
    # executing shell.
    on_box_sha="$(git -C "$APP_DIR" rev-parse HEAD)"
    if [ -n "${DEPLOY_COMMIT_SHA:-}" ] && [ "$on_box_sha" != "$DEPLOY_COMMIT_SHA" ]; then
      echo "On-box HEAD (${on_box_sha}) does not match the deploy commit (${DEPLOY_COMMIT_SHA}); refusing a mixed-commit fallback build."
      exit 1
    fi
    "${COMPOSE[@]}" build
  fi
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
