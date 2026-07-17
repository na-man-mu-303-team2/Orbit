# H4 참여 장표 200명 동시 응답 검증

- 검증일: 2026-07-17
- 환경: macOS Docker Desktop, Docker Compose Postgres 18/Redis 7/Socket.IO API
- 대상: public PresentationSession, satisfaction Activity Run, 200개 고유 signed audience cookie
- 기준: HTTP 응답 p95 2,000ms 이하, 실패·유실·중복 0, 최종 count 200, 낮은 revision 무시

## 재현 명령

기존 `orbit` volume과 섞이지 않도록 전용 Compose project를 사용한다.

```bash
docker compose -p orbit-activity-h4 up -d --build api

ACTIVITY_LOAD_TEST_BASE_URL=http://127.0.0.1:3000 \
ACTIVITY_LOAD_TEST_DATABASE_URL=postgres://orbit:orbit@127.0.0.1:5432/orbit \
pnpm --filter @orbit/api test:activity-load

pnpm --filter @orbit/web exec vitest run \
  src/features/activity-slides/model/activityRevision.test.ts \
  src/features/activity-slides/model/activityRealtimeClient.test.ts

docker compose -p orbit-activity-h4 down -v
```

통합 테스트는 fixture project/deck/session/run을 직접 만들고 `afterAll`에서 삭제한다. 환경변수가 없을 때는 일반 단위 테스트에서 외부 DB/API를 요구하지 않도록 suite를 skip한다.

## 측정 결과

| 항목 | 결과 | 판정 |
| --- | ---: | --- |
| 동시 audience 수 | 200 | 통과 |
| HTTP 성공 | 200/200 | 통과 |
| p50 | 191ms | 참고 |
| p95 | 325ms | 통과 |
| 최종 `activity_runs.response_count` | 200 | 통과 |
| `activity_responses` row / 고유 audience | 200 / 200 | 통과 |
| 최종 run revision | 201 | 통과 |
| 최종 Socket.IO revision | 201 | 통과 |
| 최종 event 수신 → 권위 HTTP snapshot | 6ms | 통과 |
| 관측된 최대 run-row lock 대기자 | 9 | 직렬 counter 갱신 확인 |

`ActivityResponseRepository.lockTarget()`의 `FOR UPDATE OF runs` 때문에 동일 run의 count/revision 갱신은 직렬화된다. 200명 burst에서 최대 9개 lock waiter가 관측됐지만 p95는 325ms로 예산의 16.3%였다. DB row count, 고유 audience count, denormalized response count가 모두 200으로 일치했다.

## Revision과 화면 갱신 경계

- API는 transaction commit 뒤 `activity-results-updated`를 발행한다.
- Web consumer는 event schema와 session/run을 검증한 뒤 현재보다 높은 revision만 HTTP refetch한다.
- reconnect 때도 Socket.IO payload를 source of truth로 쓰지 않고 HTTP snapshot을 다시 읽는다.
- 동일 run의 낮거나 중복 revision은 무시한다.
- 새 active run은 revision이 낮게 다시 시작해도 run ID가 달라 수용한다.

이번 harness의 6ms는 최종 event 수신부터 Web이 렌더링 입력으로 사용하는 권위 HTTP snapshot을 받은 시점까지다. 실제 DOM 렌더와 mobile/desktop 시각 확인은 H5 전체 Playwright story에서 별도로 검증한다.
