#!/usr/bin/env bash
set -euo pipefail

required_keys=(
  NODE_ENV
  APP_ENV
  WEB_PORT
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
  S3_PUBLIC_ENDPOINT
  S3_REGION
  OPENAI_API_KEY
  OPENAI_MODEL
  OPENAI_TRANSCRIPTION_MODEL
  OPENAI_EMBEDDING_MODEL
  AWS_REGION
  TRANSCRIBE_LANGUAGE_CODE
  LLM_PROVIDER
  DEMO_USER_ID
  DEMO_WORKSPACE_ID
  DEMO_PROJECT_ID
  DEMO_DECK_ID
  DEMO_SESSION_ID
)

missing_keys=()
invalid_app_env=0

for key in "${required_keys[@]}"; do
  if [[ ! -v "$key" ]]; then
    missing_keys+=("$key")
    continue
  fi

  value="${!key}"
  if [[ -z "${value//[[:space:]]/}" ]]; then
    missing_keys+=("$key")
  fi
done

if [[ -v APP_ENV && -n "${APP_ENV//[[:space:]]/}" && "$APP_ENV" != "staging" ]]; then
  invalid_app_env=1
fi

if (( ${#missing_keys[@]} > 0 || invalid_app_env == 1 )); then
  echo "Personal staging environment validation failed:"
  for key in "${missing_keys[@]}"; do
    echo "- ${key} is required"
  done
  if (( invalid_app_env == 1 )); then
    echo "- APP_ENV must be staging"
  fi
  exit 1
fi

echo "Personal staging environment validation passed."
