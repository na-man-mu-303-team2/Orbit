#!/usr/bin/env bash
set -euo pipefail

docker compose up -d postgres redis private-evidence-redis minio minio-init
until docker compose exec -T postgres pg_isready -U orbit -d orbit >/dev/null 2>&1; do sleep 1; done
until docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do sleep 1; done
until docker compose exec -T private-evidence-redis redis-cli ping 2>/dev/null | grep -q PONG; do sleep 1; done
minio_init_id="$(docker compose ps -aq minio-init)"
if [[ -z "${minio_init_id}" ]]; then
  echo "minio-init container was not created."
  exit 1
fi
for _ in {1..60}; do
  minio_init_status="$(docker inspect --format '{{.State.Status}}' "${minio_init_id}")"
  if [[ "${minio_init_status}" == "exited" ]]; then
    break
  fi
  sleep 1
done
if [[ "${minio_init_status:-}" != "exited" ]] ||
  [[ "$(docker inspect --format '{{.State.ExitCode}}' "${minio_init_id}")" != "0" ]]; then
  docker compose logs minio-init
  exit 1
fi

# 통합 vitest가 @orbit/editor-core 등 워크스페이스 패키지의 빌드 산출물(dist)에 의존하므로 먼저 빌드한다.
pnpm --filter "@orbit/worker^..." build

python_port="${PPTX_INTEGRATION_PYTHON_PORT:-18080}"
python_url="http://127.0.0.1:${python_port}"
python_log="${RUNNER_TEMP:-/tmp}/orbit-python-worker-integration.log"
database_url="${PPTX_INTEGRATION_DATABASE_URL:-postgresql://orbit:orbit@127.0.0.1:5432/orbit}"
redis_url="${PPTX_INTEGRATION_REDIS_URL:-redis://127.0.0.1:6379}"
storage_endpoint="${PPTX_INTEGRATION_S3_ENDPOINT:-http://127.0.0.1:9000}"
storage_bucket="${PPTX_INTEGRATION_S3_BUCKET:-orbit-local}"
storage_region="${PPTX_INTEGRATION_S3_REGION:-ap-northeast-2}"
storage_access_key_id="${PPTX_INTEGRATION_S3_ACCESS_KEY_ID:-orbit}"
storage_secret_access_key="${PPTX_INTEGRATION_S3_SECRET_ACCESS_KEY:-orbit-password}"
(
  cd services/python-worker
  uv sync --locked
  NODE_ENV=test \
  APP_ENV=test \
  PYTHON_WORKER_PORT="${python_port}" \
  PYTHON_WORKER_URL="${python_url}" \
  API_BASE_URL=http://127.0.0.1:3000 \
  DATABASE_URL="${database_url}" \
  REDIS_URL="${redis_url}" \
  STORAGE_DRIVER=minio \
  S3_ENDPOINT="${storage_endpoint}" \
  S3_PUBLIC_ENDPOINT="${storage_endpoint}" \
  S3_BUCKET="${storage_bucket}" \
  S3_REGION="${storage_region}" \
  S3_FORCE_PATH_STYLE=true \
  JOB_QUEUE_DRIVER=bullmq \
  LIVE_STT_PROVIDER=sherpa \
  REPORT_STT_PROVIDER=openai \
  OCR_PROVIDER=python \
  LLM_PROVIDER=openai \
  OPENAI_API_KEY= \
  OPENAI_MODEL=integration-test \
  OPENAI_TRANSCRIPTION_MODEL=whisper-1 \
  OPENAI_EMBEDDING_MODEL=integration-test \
  AWS_REGION=ap-northeast-2 \
  AWS_ACCESS_KEY_ID= \
  AWS_SECRET_ACCESS_KEY= \
  S3_ACCESS_KEY_ID="${storage_access_key_id}" \
  S3_SECRET_ACCESS_KEY="${storage_secret_access_key}" \
  WHISPERX_API_KEY= \
  TRANSCRIBE_LANGUAGE_CODE=ko-KR \
  TEXTRACT_ENABLED=false \
  ORBIT_PPTX_OOXML_VECTOR_IMPORT=true \
  exec uv run uvicorn app.main:app --host 127.0.0.1 --port "${python_port}"
) >"${python_log}" 2>&1 &
python_pid=$!

cleanup() {
  if kill -0 "${python_pid}" >/dev/null 2>&1; then
    kill "${python_pid}" >/dev/null 2>&1 || true
    wait "${python_pid}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

for _ in {1..120}; do
  if curl --fail --silent "${python_url}/health" >/dev/null; then
    break
  fi
  if ! kill -0 "${python_pid}" >/dev/null 2>&1; then
    cat "${python_log}"
    exit 1
  fi
  sleep 1
done
curl --fail --silent "${python_url}/health" >/dev/null || {
  cat "${python_log}"
  exit 1
}

if ! env \
  ORBIT_DB_INTEGRATION=1 \
  ORBIT_PYTHON_WORKER_URL="${python_url}" \
  ORBIT_INTEGRATION_DATABASE_URL="${database_url}" \
  PPTX_INTEGRATION_DATABASE_URL="${database_url}" \
  PPTX_INTEGRATION_S3_ENDPOINT="${storage_endpoint}" \
  PPTX_INTEGRATION_S3_BUCKET="${storage_bucket}" \
  PPTX_INTEGRATION_S3_REGION="${storage_region}" \
  PPTX_INTEGRATION_S3_ACCESS_KEY_ID="${storage_access_key_id}" \
  PPTX_INTEGRATION_S3_SECRET_ACCESS_KEY="${storage_secret_access_key}" \
  pnpm exec vitest run \
  apps/worker/integration/slide-question-guide-generation-postgres.integration.spec.ts \
  apps/worker/integration/pptx-ooxml-roundtrip.integration.spec.ts; then
  cat "${python_log}"
  exit 1
fi
