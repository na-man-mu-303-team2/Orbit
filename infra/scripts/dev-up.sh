#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PYTHON_WORKER_DIR="$ROOT_DIR/services/python-worker"

cd "$ROOT_DIR"

cleanup() {
  local exit_code=$?

  trap - EXIT INT TERM

  if [[ -n "${NODE_DEV_PID:-}" ]] && kill -0 "$NODE_DEV_PID" 2>/dev/null; then
    kill "$NODE_DEV_PID" 2>/dev/null || true
  fi

  if [[ -n "${PYTHON_DEV_PID:-}" ]] && kill -0 "$PYTHON_DEV_PID" 2>/dev/null; then
    kill "$PYTHON_DEV_PID" 2>/dev/null || true
  fi

  wait "${NODE_DEV_PID:-}" "${PYTHON_DEV_PID:-}" 2>/dev/null || true

  exit "$exit_code"
}

trap cleanup EXIT INT TERM

echo "[dev-up] starting local infra containers"
docker compose up -d postgres redis minio minio-init

echo "[dev-up] running API migrations"
corepack pnpm --filter @orbit/api migration:run

echo "[dev-up] starting web/api/worker dev processes"
corepack pnpm dev &
NODE_DEV_PID=$!

echo "[dev-up] syncing python worker dependencies"
(
  cd "$PYTHON_WORKER_DIR"
  uv sync

  echo "[dev-up] starting python worker"
  uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
) &
PYTHON_DEV_PID=$!

wait -n "$NODE_DEV_PID" "$PYTHON_DEV_PID"
