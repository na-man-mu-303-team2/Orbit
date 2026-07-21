#!/usr/bin/env bash
set -euo pipefail

docker compose up -d postgres redis private-evidence-redis minio minio-init
until docker compose exec -T postgres pg_isready -U orbit -d orbit >/dev/null 2>&1; do sleep 1; done
until docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do sleep 1; done
until docker compose exec -T private-evidence-redis redis-cli ping 2>/dev/null | grep -q PONG; do sleep 1; done

# 통합 vitest가 @orbit/editor-core 등 워크스페이스 패키지의 빌드 산출물(dist)에 의존하므로 먼저 빌드한다.
pnpm --filter "@orbit/worker^..." build

python_port="${PPTX_INTEGRATION_PYTHON_PORT:-18080}"
python_url="http://127.0.0.1:${python_port}"
python_log="${RUNNER_TEMP:-/tmp}/orbit-python-worker-integration.log"
database_url="${PPTX_INTEGRATION_DATABASE_URL:-postgresql://orbit:orbit@127.0.0.1:5432/orbit}"
redis_url="${PPTX_INTEGRATION_REDIS_URL:-redis://127.0.0.1:6379}"
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
  STORAGE_DRIVER=s3 \
  S3_BUCKET=orbit-integration \
  S3_REGION=ap-northeast-2 \
  S3_FORCE_PATH_STYLE=false \
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
  S3_ACCESS_KEY_ID= \
  S3_SECRET_ACCESS_KEY= \
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

ORBIT_DB_INTEGRATION=1 \
ORBIT_PYTHON_WORKER_URL="${python_url}" \
ORBIT_INTEGRATION_DATABASE_URL="${database_url}" \
PPTX_INTEGRATION_DATABASE_URL="${database_url}" \
pnpm exec vitest run \
  apps/worker/integration/slide-question-guide-generation-postgres.integration.spec.ts \
  apps/worker/integration/pptx-ooxml-roundtrip.integration.spec.ts
