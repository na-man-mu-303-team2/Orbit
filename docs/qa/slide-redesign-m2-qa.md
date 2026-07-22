# 슬라이드 리디자인 M2 QA 기록

- 검증일: 2026-07-22
- 대상 branch: `feature/slide-redesign-agent-v2-pr17-m2-verification`
- 범위: 이미지 포함 비동기 리디자인, 단계별 읽기 전용 preview, stale·fallback, 최종 apply·undo, 로그 안전성
- 판정: 자동 release gate 통과, 실제 provider 수동 검증과 사람 중심 시각 QA는 미실행

## 자동 검증 요약

| Gate | 결과 | 판정 |
| --- | --- | --- |
| 이미지 포함 전체 흐름 | layout operation 보존, 이미지 1장 상한, 최종 proposal 적용 성공 | 통과 |
| stale·fallback | `baseVersion` stale 사전 차단, provider 예외 시 layout proposal과 bounded warning 유지 | 통과 |
| preview·undo | intermediate preview 적용 불가, final proposal apply 후 undo 1회로 원상 복구 | 통과 |
| 구조·보존 fixture | 원문, `elementId`, animation, semantic cue 참조 보존 | 통과 |
| 로그 안전성 | prompt, transcript, speaker notes, credential 및 raw provider 오류 미기록 | 통과 |
| Python worker 전체 | 1,009 passed, 1 skipped, 7 warnings; ruff·mypy 통과 | 통과 |
| Shared 전체 | 589 passed | 통과 |
| API 전체 | 610 passed, 1 skipped | 통과 |
| Worker 전체 | 404 passed, 14 skipped | 통과 |
| Web 전체 | 1,814 passed | 통과 |
| Workspace 정적 검증 | typecheck 17/17, build 10/10, lint 17/17 | 통과 |
| Workspace 전체 테스트 | test 17/17 | 통과 |
| 환경·Compose 계약 | `check-env.mjs`, `docker compose config --quiet` | 통과 |
| Chromium smoke | 격리 Compose에서 `slide redesign` 1/1 | 통과 |

## Release gate 판정

- [x] 구조 검증을 통과하지 않은 proposal 노출 0건
- [x] optional 이미지 실패로 전체 redesign이 실패하는 경로 0건
- [x] 원문·`elementId`·animation·semantic cue 보존 fixture 전부 통과
- [x] intermediate preview 적용 불가
- [x] final apply 후 undo 1회 복구
- [x] `baseVersion` 변경 시 stale 처리
- [x] 로그에 prompt, transcript, speaker notes, credential이 없음
- [ ] 실제 provider 수동 검증 결과와 비용·지연 기록

마지막 항목은 자동 fallback 검증과 별도의 운영 gate다. 검증 환경에는 실제 provider credential을 주입하지 않았고 외부 provider 호출도 수행하지 않았다. 따라서 실제 결과 품질은 미검증, 비용과 지연은 미측정이며 이 항목이 완료되기 전에는 M2를 실제 provider 출시 승인으로 해석하지 않는다.

## 실제 서비스 경계 smoke에서 확인한 수정

격리한 `orbit-pr17` Compose project에서 Web, API, Worker, Python worker, PostgreSQL, Redis를 연결해 palette 선택부터 비동기 Job 완료, 최종 proposal 적용까지 검증했다. 이 과정에서 단위 테스트만으로 드러나지 않은 두 경계 불일치를 발견해 같은 PR에서 회귀 테스트와 함께 수정했다.

1. Python의 `exclude_none` 응답이 optional `alignment`를 생략할 때 shared stage schema가 응답을 거부했다. 생략된 값은 계약상 `null`로 정규화하도록 shared schema와 테스트를 보강했다.
2. Worker의 raw SQL proposal 저장 경로가 `operations`, `interpretedIntent`, ID 배열, warning 배열을 JSONB 문자열로 직렬화하지 않았다. 모든 JSONB parameter를 명시적으로 직렬화하고 저장 경계 회귀 테스트를 추가했다.

초기 Compose project 이름 충돌은 별도 project name과 포트로 격리해 제거했다. 병렬 Docker image build가 제한된 로컬 메모리에서 exit 137로 종료된 경우에는 같은 image를 순차 빌드해 통과했다. 최종 smoke는 격리 환경에서 4.1초에 통과했다.

## 실행 명령

```bash
cd services/python-worker
uv run ruff check .
uv run mypy app
uv run pytest

pnpm --filter @orbit/shared test
pnpm --filter @orbit/api test
pnpm --filter @orbit/worker test
pnpm --filter @orbit/web test
pnpm typecheck
pnpm build
pnpm lint
pnpm test
node infra/scripts/check-env.mjs
docker compose config --quiet

PLAYWRIGHT_BASE_URL=http://127.0.0.1:5273 \
ORBIT_API_URL=http://127.0.0.1:3100 \
  pnpm test:smoke --grep "slide redesign"
```

API와 root 전체 테스트는 `.env.example`을 읽고 기본 비활성 가정이 필요한 rehearsal 관련 feature flag를 `false`로 명시했다. 실제 credential 값은 명령, 문서, 로그에 기록하지 않았다.

## 남은 수동 검증

- 승인된 test credential과 격리된 budget으로 실제 provider 1회 호출
- provider request 수, 성공·fallback 여부, end-to-end 지연, 실제 비용 기록
- 16:9 및 4:3의 overflow, overlap, 대비, 시각적 위계 Before/After 확인
- 생성 이미지의 라이선스·provenance 표시와 editable element 동작 확인
