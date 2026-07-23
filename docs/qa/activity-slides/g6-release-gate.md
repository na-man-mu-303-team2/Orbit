# G6 참여 장표 Release Gate

- 검증일: 2026-07-17
- 대상 branch: `feature/activity-slides-hardening`
- 환경: macOS Docker Desktop, 격리 Compose project `orbit-activity-h4`
- 판정: G6 통과

## 검증 요약

| Gate | 결과 | 판정 |
| --- | --- | --- |
| workspace build | 10/10 package 성공 | 통과 |
| workspace lint | 17/17 task 성공 | 통과 |
| workspace test | 17/17 task 성공 (`turbo --env-mode=loose`) | 통과 |
| workspace typecheck | 17/17 task 성공 | 통과 |
| API regression | 410 passed, opt-in load 1 skipped | 통과 |
| Worker regression | 302 passed, integration 10 skipped | 통과 |
| Python worker | ruff 통과, mypy 50 files 통과, pytest 548 passed | 통과 |
| 환경 계약 | `check-env.mjs` 성공 | 통과 |
| Compose 계약 | `docker compose config --quiet` 성공 | 통과 |
| DB migration | `run → revert → run` 성공 | 통과 |
| 200명 부하 | 200/200, p50 225ms, p95 334ms, event→snapshot 10ms | 통과 |
| 전체 E2E | Chromium 1/1, 31.5초 | 통과 |

## 실행 명령

```bash
pnpm build
pnpm lint

set -a
source .env.example
set +a
ADAPTIVE_REHEARSAL_COACH_ENABLED=false \
FOCUSED_PRACTICE_ENABLED=false \
CHALLENGE_QNA_ENABLED=false \
pnpm exec turbo run test --env-mode=loose

pnpm typecheck
node infra/scripts/check-env.mjs
docker compose config --quiet
```

Turbo의 기본 strict env mode는 shell에서 읽은 API test 환경변수를 child task로 전달하지 않는다. 따라서 workspace 전체 test는 같은 값과 `--env-mode=loose`를 사용했다. API 단독 suite도 동일 환경에서 별도로 410/410 통과했다.

Python worker는 writable cache를 명시했다.

```bash
cd services/python-worker
uv --cache-dir /tmp/orbit-uv-cache sync --locked
uv --cache-dir /tmp/orbit-uv-cache run ruff check .
uv --cache-dir /tmp/orbit-uv-cache run mypy app
uv --cache-dir /tmp/orbit-uv-cache run pytest
```

## Migration 왕복에서 발견한 결함

최초 왕복에서 `CreateActivityRuntime2026071702000.down()`이 runtime table을 삭제한 뒤 `presentation_sessions.active_activity_run_id`를 남겨 재적용 FK 생성이 실패했다. 다음을 수정하고 실제 격리 DB에서 다시 `revert → run`했다.

- down에서 session의 active run pointer를 먼저 `NULL`로 정리
- up에서 FK 생성 전 존재하지 않는 run pointer를 방어적으로 정리
- migration 단위 테스트에 up/down 정리 계약 추가

수정 후 최신 migration의 down과 up이 모두 성공했고 API 전체 regression과 최종 E2E가 통과했다.

## G6 핵심 조건

- retention은 실제 Worker Job에서 snapshot 1개를 보존한 뒤 raw response 0개와 삭제 시각을 확인했다.
- selected-session PPTX는 Job 성공, 다운로드 ZIP signature, 민감 이름 비노출을 전체 E2E에서 확인했다. QR·원문 배제와 원본 Deck 불변은 shared/Worker/Python regression이 함께 검증한다.
- 200명 burst는 실패·유실·중복 없이 최종 count/revision 200 흐름을 유지했고 p95 334ms로 2초 예산 이내였다.
- passcode/public, session isolation, refresh, mobile/desktop, moderation/reveal, archive, export, retention을 하나의 브라우저 story로 재검증했다.
