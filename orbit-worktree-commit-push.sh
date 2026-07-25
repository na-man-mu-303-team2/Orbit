#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
REPORT_FILE="${1:-$REPO_ROOT/dirty-worktree-report.csv}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TMP_REPORT="${REPORT_FILE%.csv}.tmp.$TIMESTAMP.csv"

echo '"path","branch","status","commit","status_detail","error"' > "$TMP_REPORT"

done_count=0
skipped_count=0
failed_count=0

declare -a failed_rows=()

csv_escape() {
  local value=${1:-}
  value="${value//$'\n'/ }"
  value="${value//$'\r'/ }"
  printf '"%s"' "${value//\"/\"\"}"
}

classify_error() {
  local msg=$1

  if [[ "$msg" == *"non-fast-forward"* ]] || [[ "$msg" == *"fetch first"* ]] || [[ "$msg" == *"need to pull"* ]]; then
    echo "FAILED_NEEDS_PULL"
    return
  fi

  if [[ "$msg" == *"Authentication failed"* ]] || [[ "$msg" == *"could not read Username"* ]] || [[ "$msg" == *"Permission denied"* ]] || [[ "$msg" == *"Repository not found"* ]]; then
    echo "FAILED_AUTH"
    return
  fi

  if [[ "$msg" == *"Could not resolve host"* ]] || [[ "$msg" == *"Network is unreachable"* ]] || [[ "$msg" == *"Failed to connect"* ]] || [[ "$msg" == *"Connection timed out"* ]]; then
    echo "FAILED_NETWORK"
    return
  fi

  echo "FAILED_OTHER"
}

list_worktrees() {
  local raw
  raw="$(git -C "$REPO_ROOT" worktree list --porcelain)"
  local -a entries=()
  local path="" branch="" prunable=0 detached=0

  flush_entry() {
    if [[ -n "$path" ]]; then
      entries+=("${path}"$'\t'"${branch}"$'\t'"${prunable}"$'\t'"${detached}")
    fi
  }

  while IFS='' read -r line; do
    if [[ -z "$line" ]]; then
      flush_entry
      path=""
      branch=""
      prunable=0
      detached=0
      continue
    fi

    case "$line" in
      worktree\ *)
        path="${line#worktree }"
        ;;
      branch\ refs/heads/*)
        branch="${line#branch refs/heads/}"
        ;;
      detached)
        detached=1
        ;;
      prunable)
        prunable=1
        ;;
    esac
  done <<< "$raw"

  flush_entry
  printf '%s\n' "${entries[@]}"
}

run_push() {
  local path=$1 branch=$2
  local commit_ref=$3
  local attempt=1
  local max_attempts=2
  local output status

  while ((attempt <= max_attempts)); do
    if output="$(git -C "$path" push -u origin "$commit_ref" 2>&1)"; then
      echo "OK"
      return 0
    fi
    status=$(classify_error "$output")
    if ((attempt == 1)) && ( [[ "$status" == "FAILED_AUTH" ]] || [[ "$status" == "FAILED_NETWORK" ]] ); then
      ((attempt++))
      continue
    fi
    echo "$status|$output"
    return 1
  done
}

while IFS= read -r entry; do
  path=""
  branch=""
  prunable=0
  detached=0
  IFS=$'\t' read -r path branch prunable detached <<< "$entry"
  status="SKIPPED"
  status_detail="SKIPPED"
  commit_sha=""
  error=""

  if ((prunable == 1)); then
    status_detail="SKIPPED_PRUNABLE"
    skipped_count=$((skipped_count + 1))
    echo "$(csv_escape "$path"),$(csv_escape "$branch"),$(csv_escape "$status"),$(csv_escape "$commit_sha"),$(csv_escape "$status_detail"),$(csv_escape "$error")" >> "$TMP_REPORT"
    continue
  fi

  if ((detached == 1)) || [[ -z "$branch" ]]; then
    status_detail="SKIPPED_DETACHED"
    skipped_count=$((skipped_count + 1))
    echo "$(csv_escape "$path"),$(csv_escape "$branch"),$(csv_escape "$status"),$(csv_escape "$commit_sha"),$(csv_escape "$status_detail"),$(csv_escape "$error")" >> "$TMP_REPORT"
    continue
  fi

  if [[ "$branch" == "main" || "$branch" == "master" ]]; then
    status_detail="SKIPPED_PROTECTED_BRANCH"
    skipped_count=$((skipped_count + 1))
    echo "$(csv_escape "$path"),$(csv_escape "$branch"),$(csv_escape "$status"),$(csv_escape "$commit_sha"),$(csv_escape "$status_detail"),$(csv_escape "$error")" >> "$TMP_REPORT"
    continue
  fi

  if ! git -C "$path" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    status_detail="FAILED_INVALID_WORKTREE"
    status="FAILED"
    failed_count=$((failed_count + 1))
    error="git metadata invalid"
    failed_rows+=("$path:$branch:$status_detail")
    echo "$(csv_escape "$path"),$(csv_escape "$branch"),$(csv_escape "$status"),$(csv_escape "$commit_sha"),$(csv_escape "$status_detail"),$(csv_escape "$error")" >> "$TMP_REPORT"
    continue
  fi

  if ! status_short="$(git -C "$path" status --short 2>&1)"; then
    status_detail="FAILED_INVALID_WORKTREE"
    status="FAILED"
    failed_count=$((failed_count + 1))
    error="$status_short"
    failed_rows+=("$path:$branch:$status_detail")
    echo "$(csv_escape "$path"),$(csv_escape "$branch"),$(csv_escape "$status"),$(csv_escape "$commit_sha"),$(csv_escape "$status_detail"),$(csv_escape "$error")" >> "$TMP_REPORT"
    continue
  fi

  if [[ -z "${status_short//$'\n'/}" ]]; then
    status_detail="SKIPPED_CLEAN"
    skipped_count=$((skipped_count + 1))
    echo "$(csv_escape "$path"),$(csv_escape "$branch"),$(csv_escape "$status"),$(csv_escape "$commit_sha"),$(csv_escape "$status_detail"),$(csv_escape "$error")" >> "$TMP_REPORT"
    continue
  fi

  changed_count=$(printf '%s\n' "$status_short" | sed '/^$/d' | wc -l | tr -d ' ')
  printf "=== %s (%s) | dirty files: %s ===\n" "$path" "$branch" "$changed_count"
  printf '%s\n' "$status_short"

  if ! git -C "$path" add -A; then
    status_detail="FAILED_OTHER"
    status="FAILED"
    failed_count=$((failed_count + 1))
    error="git add failed"
    failed_rows+=("$path:$branch:$status_detail")
    echo "$(csv_escape "$path"),$(csv_escape "$branch"),$(csv_escape "$status"),$(csv_escape "$commit_sha"),$(csv_escape "$status_detail"),$(csv_escape "$error")" >> "$TMP_REPORT"
    continue
  fi

  if ((changed_count > 1)); then
    title="chore: 워크트리 변경 반영"
    body="워크트리에서 변경된 파일을 반영했습니다."
    if ! commit_output="$(git -C "$path" commit -m "$title" -m "$body" 2>&1)"; then
      status_detail="FAILED_OTHER"
      status="FAILED"
      failed_count=$((failed_count + 1))
      error="$commit_output"
      failed_rows+=("$path:$branch:$status_detail")
      echo "$(csv_escape "$path"),$(csv_escape "$branch"),$(csv_escape "$status"),$(csv_escape "$commit_sha"),$(csv_escape "$status_detail"),$(csv_escape "$error")" >> "$TMP_REPORT"
      continue
    fi
  else
    title="chore: 워크트리 변경 반영"
    if ! commit_output="$(git -C "$path" commit -m "$title" 2>&1)"; then
      status_detail="FAILED_OTHER"
      status="FAILED"
      failed_count=$((failed_count + 1))
      error="$commit_output"
      failed_rows+=("$path:$branch:$status_detail")
      echo "$(csv_escape "$path"),$(csv_escape "$branch"),$(csv_escape "$status"),$(csv_escape "$commit_sha"),$(csv_escape "$status_detail"),$(csv_escape "$error")" >> "$TMP_REPORT"
      continue
    fi
  fi

  commit_sha="$(git -C "$path" rev-parse HEAD)"
  status_detail="COMMITTED"

  if ! git -C "$path" fetch origin --prune; then
    status="FAILED"
    status_detail="FAILED_OTHER"
    failed_count=$((failed_count + 1))
    error="fetch failed"
    failed_rows+=("$path:$branch:$status_detail")
    echo "$(csv_escape "$path"),$(csv_escape "$branch"),$(csv_escape "$status"),$(csv_escape "$commit_sha"),$(csv_escape "$status_detail"),$(csv_escape "$error")" >> "$TMP_REPORT"
    continue
  fi

  if git -C "$path" rev-parse --quiet --verify "origin/$branch" >/dev/null 2>&1; then
    refspec="$branch:$branch"
  else
    refspec="HEAD:$branch"
  fi

  push_result="$(run_push "$path" "$branch" "$refspec")"
  push_status=$?
  if [[ "$push_status" -ne 0 ]]; then
    status="FAILED"
    status_detail="${push_result%%|*}"
    error="${push_result#*|}"
    failed_count=$((failed_count + 1))
    failed_rows+=("$path:$branch:$status_detail")
    echo "$(csv_escape "$path"),$(csv_escape "$branch"),$(csv_escape "$status"),$(csv_escape "$commit_sha"),$(csv_escape "$status_detail"),$(csv_escape "$error")" >> "$TMP_REPORT"
    continue
  fi

  origin_remote="$(git -C "$path" config --get "branch.$branch.remote" || true)"
  origin_merge="$(git -C "$path" config --get "branch.$branch.merge" || true)"
  if [[ "$origin_remote" != "origin" || "$origin_merge" != "refs/heads/$branch" ]]; then
    status="FAILED"
    status_detail="FAILED_OTHER"
    error="upstream verification failed"
    failed_count=$((failed_count + 1))
    failed_rows+=("$path:$branch:$status_detail")
    echo "$(csv_escape "$path"),$(csv_escape "$branch"),$(csv_escape "$status"),$(csv_escape "$commit_sha"),$(csv_escape "$status_detail"),$(csv_escape "$error")" >> "$TMP_REPORT"
    continue
  fi

  if ! git -C "$path" ls-remote --heads origin "$branch" >/dev/null 2>&1; then
    status="FAILED"
    status_detail="FAILED_OTHER"
    error="ls-remote verification failed"
    failed_count=$((failed_count + 1))
    failed_rows+=("$path:$branch:$status_detail")
    echo "$(csv_escape "$path"),$(csv_escape "$branch"),$(csv_escape "$status"),$(csv_escape "$commit_sha"),$(csv_escape "$status_detail"),$(csv_escape "$error")" >> "$TMP_REPORT"
    continue
  fi

  status="DONE"
  status_detail="DONE"
  done_count=$((done_count + 1))
  echo "$(csv_escape "$path"),$(csv_escape "$branch"),$(csv_escape "$status"),$(csv_escape "$commit_sha"),$(csv_escape "$status_detail"),$(csv_escape "$error")" >> "$TMP_REPORT"
done < <(list_worktrees)

mv "$TMP_REPORT" "$REPORT_FILE"

echo ""
echo "done: $done_count"
echo "skipped: $skipped_count"
echo "failed: $failed_count"
echo "report: $REPORT_FILE"

if ((failed_count > 0)); then
  echo "retry list:"
  printf '  - %s\n' "${failed_rows[@]}"
fi
