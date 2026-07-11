# Adaptive Rehearsal Coach Milestone 1 실행 원장

## 목적과 운영 규칙

이 문서는 `docs/product/adaptive-rehearsal-coach-direction.md`의 C0~C11을 작은 검증 단위로 추적하는 실행 원장이다. 각 작업은 S(1~2개 파일) 또는 M(3~5개 파일)을 기본으로 하며, 완료 표시는 자동 검증과 필요한 브라우저 증거가 모두 확보된 뒤에만 변경한다.

- aggregate 경계: `RehearsalRun`, `FocusedPracticeSession`, `ChallengeQnaSession`을 분리한다.
- 순차 gate: G0 계약 → G1 core data → G2 privacy → G3 focused → G4 grounding → G5 integration.
- 개인정보: raw audio, transcript, typed answer, speaker notes를 DB·Job·로그·report/client response에 남기지 않는다.
- 권한: owner/editor command, project member bounded read, audience/non-member deny.
- 디자인: 모든 신규 coaching UI는 `apps/web/src/design-system/index.ts`만 import한다.
- Git: `feature/adaptive-rehearsal-coach`에서 `<type>: <한국어 제목>` 단위 커밋을 사용한다.

## 기준선 조사 결과

- 현재 브랜치 기준 디자인 source of truth는 `/design-system`, `docs/orbit-design-system.md`, `apps/web/src/design-system/*`다.
- 목표 문서가 지목한 `/mockup/editor`, `/mockup/microphone-check`, `/mockup/rehearsal`, `/mockup/rehearsal-complete`, `/mockup/reports`, `/mockup/report`, `/mockup/report-project`는 현재 `App.tsx` route에 없고 홈 route로 fallback한다.
- 실제 비교 대상은 `/ai-ppt`, `/rehearsal/project_demo_1`, `/report_mockup`, `/reports`, `/reports/project_demo_1`이며 baseline은 `docs/qa/adaptive-coaching/baseline/`에 저장했다.
- `/project/project_demo_1`은 현재 권한 확인 오류 상태이므로 editor reference는 UI source와 `/design-system`을 함께 사용한다.
- 현행 리허설/리포트는 공식 디자인 시스템보다 blue 중심 legacy surface가 많다. 신규 화면에서 이를 복제하지 않고 공식 token/primitive를 사용한다.

## C0 — 계약과 migration 안전장치

### C0.1 Shared coaching identity·Brief·Lens 계약 (M)

- 결과: Web/API/Worker가 같은 strict runtime schema로 Brief와 Lens를 교환한다.
- 수용: 명세 enum/limit/CAS input을 `.strict()`로 parse하고 public index에서 export한다.
- 선행: 없음.
- 예상 파일: `packages/shared/src/coaching/presentation-brief.schema.ts`, `evaluator-lens.schema.ts`, 각 test, `packages/shared/src/index.ts`.
- 검증: `pnpm --filter @orbit/shared test && pnpm --filter @orbit/shared build`.
- 브라우저: 없음.
- 개인정보/권한: approved reference는 ID/hash만 포함하고 원문을 금지한다.
- 증거: schema negative/compatibility test.

### C0.2 Goal·Focused·Q&A·cleanup 계약 분리 (M)

- 결과: 세 aggregate와 bounded result, cleanup lifecycle을 공통 계약으로 고정한다.
- 수용: 상태 enum, exact checkpoint=1/final=3, immutable revision, bounded observations를 검증한다.
- 선행: C0.1.
- 예상 파일: `practice-goal.schema.ts`, `focused-practice.schema.ts`, `challenge-qna.schema.ts`, `private-audio-cleanup.schema.ts`, tests.
- 검증: shared coaching test 전체.
- 브라우저: 없음.
- 개인정보/권한: typed answer/transcript/audio bytes 필드가 schema에 존재하지 않는다.
- 증거: forbidden key negative tests.

### C0.3 File·Job·run compatibility 계약 (M)

- 결과: private purpose와 internal job을 public create에서 분리하고 full-run snapshot을 확장한다.
- 수용: three private purposes filtered, four coaching job types internal-only, cancelled/analysis revision/evaluation plan parse.
- 선행: C0.2.
- 예상 파일: `file.schema.ts`, `job.schema.ts`, rehearsal schemas, tests.
- 검증: shared test/build.
- 브라우저: 없음.
- 개인정보/권한: public job request가 internal type을 거부한다.
- 증거: enum compatibility 및 public create rejection test.

### C0.4 Migration A와 rollback harness (M)

- 결과: Brief/Goal/Resolution/outbox 및 기존 table 보강을 실제 PostgreSQL에서 안전하게 적용·복구한다.
- 수용: status CHECK cancelled, analysis revision/content hash/dispatcher fields, cascade와 tenant-safe FK, `down()` 구현.
- 선행: C0.3.
- 예상 파일: migration A, `data-source.ts`, migration test script, root script.
- 검증: A up → down → up, constraint fixture, cascade, composite FK.
- 브라우저: 없음.
- 개인정보/권한: raw evidence column 금지; outbox storage key 성공 즉시 null.
- 증거: `pnpm test:coaching:migrations` 로그.

### Gate G0

- [x] shared schema·문서·enum compatibility test 통과 (shared 231 tests)
- [x] migration A up/down/up 통과 (local PostgreSQL)
- [x] public Job/private asset 경계 test 통과 (API 213 tests)

## C1/C1W — Brief·Lens vertical slice

### C1.1 Brief repository/service CAS (M)

- 결과: project당 current Brief를 revision conflict 없이 저장·조회한다.
- 수용: expectedRevision 0/현재 revision만 허용, requirement server identity/revision, reference snapshot hash resolve.
- 선행: G0.
- 예상 파일: presentation-brief entity/repository/service/spec.
- 검증: API service test.
- 브라우저: 없음.
- 개인정보/권한: owner/editor write, viewer read, non-member deny.
- 증거: conflict·reference removed·role matrix tests.

### C1.2 Brief/Lens HTTP contract (S)

- 결과: Brief GET/PUT과 Lens registry GET을 runtime-validated response로 제공한다.
- 수용: safe fixed errors, strict request, registry revision 1 세 개.
- 선행: C1.1.
- 예상 파일: controllers/modules와 specs.
- 검증: API controller/integration test.
- 브라우저: 없음.
- 개인정보/권한: reference 원문과 provider error 미노출.
- 증거: HTTP status/error mapping tests.

### C1W.1 Brief form model/API (M)

- 결과: 입력 보존 가능한 progressive form과 React Query 경계를 제공한다.
- 수용: 기본 5개 field, 상세 기준 disclosure, CAS conflict draft 유지, project cache purge hook.
- 선행: C1.2.
- 예상 파일: brief API/model와 tests.
- 검증: web unit test.
- 브라우저: keyboard/conflict 상태 320/1440.
- 개인정보/권한: raw reference content를 client cache에 넣지 않는다.
- 증거: test와 screenshot.

### C1W.2 Brief UI·generation provenance 연결 (M)

- 결과: 맞춤 Brief 또는 일반 모드 선택 후 기존 generation으로 이어진다.
- 수용: Primary action 하나, 큰 Lilac surface 하나, generic badge, generation request briefRef, 완료 provenance.
- 선행: C1W.1.
- 예상 파일: Brief components, generation form/service schema/spec.
- 검증: web/shared/worker related tests.
- 브라우저: loading/ready/error/conflict/flag-off, 320/768/1024/1440, keyboard/axe.
- 개인정보/권한: form 값 로그·telemetry 금지.
- 증거: E2E-01와 visual comparison.

## C2 — Evaluation Plan·Goal Set·Resolution

### C2.1 Immutable evaluation snapshot (M)

- 결과: 새 full run이 deck hash, Brief/Lens/criteria/goal-set ref를 frozen snapshot으로 가진다.
- 수용: legacy null parse, deck/brief revision compatibility, analysis CAS/finalize.
- 선행: C1.2.
- 예상 파일: rehearsal schema/service/deck service/tests.
- 검증: API/service tests.
- 브라우저: 없음.
- 개인정보/권한: snapshot에서 notes/elements/raw evidence 제외.
- 증거: forbidden-field test.

### C2.2 Deterministic Top 3와 immutable head CAS (M)

- 결과: 같은 facts가 같은 ranking/patternKey와 새 immutable goal-set revision을 만든다.
- 수용: lens→severity→slide→patternKey tie-break, partial CTA 차단, semantic retry 새 revision/head CAS.
- 선행: C2.1.
- 예상 파일: practice-goal derivation/repository/service/spec.
- 검증: determinism/race tests.
- 브라우저: 없음.
- 개인정보/권한: evidence ref만 보존하고 excerpt/transcript 금지.
- 증거: E2E-02/03 backend tests.

### C2.3 Compatible resolution transaction (M)

- 결과: 다음 compatible full run에서만 immutable Resolution을 만든다.
- 수용: resolved/repeated/unmeasured/incomparable, unique goal+run, focused attempt 무영향.
- 선행: C2.2.
- 예상 파일: compatibility/resolution service/spec, rehearsal integration.
- 검증: API integration tests.
- 브라우저: 없음.
- 개인정보/권한: bounded observation만 응답.
- 증거: E2E-05 backend trace.

### Gate G1

- [x] Brief CAS/reference snapshot 통과 (API 222 tests)
- [x] evaluation snapshot immutable parse 통과 (shared 232 tests)
- [x] Goal Set revision race와 Resolution compatibility 통과 (worker 67 tests)

## C3 — Report·Plan·Reminder

### C3.1 Practice plan API와 comparison 상태 분리 (M)

- 결과: current final Top 3, comparison, next action을 한 bounded response로 제공한다.
- 수용: processing/no-goal/stale/error 구분, error를 no-history로 변환하지 않음.
- 선행: G1.
- 예상 파일: practice-plan controller/service/spec, report API client/model.
- 검증: API/web tests.
- 브라우저: 모든 상태.
- 개인정보/권한: viewer bounded read, audience deny.
- 증거: status mapping tests.

### C3.2 Top 3 우선 report·plan 화면 (M)

- 결과: Top 3가 AI 총평보다 먼저 보이고 editorial list에서 목표 하나에 집중한다.
- 수용: equal card grid 금지, selected goal Lilac Soft, semantic status icon+text, primary CTA 하나.
- 선행: C3.1.
- 예상 파일: plan components/view model/styles/tests.
- 검증: web tests/build.
- 브라우저: 4 viewports, loading/ready/no-goal/stale/error/permission/flag-off, axe.
- 개인정보/권한: 원문 evidence 렌더 금지.
- 증거: same-viewport `/design-system` comparison.

### C3.3 Goal reminder pure model (S)

- 결과: slide/goal마다 한 번만 비차단 reminder를 보인다.
- 수용: priority selection, stale/unmeasured 제외, 120자 bound, modal 없음.
- 선행: C2.2.
- 예상 파일: reminder model/test, presenter integration.
- 검증: unit/integration tests.
- 브라우저: full rehearsal focus order와 dismiss.
- 개인정보/권한: nextAction bounded copy만 사용.
- 증거: reminder once E2E.

## C4 — private audio·Job·cleanup 기반

### C4.1 Private asset reservation과 response filtering (M)

- 결과: private audio는 전용 command만 생성하고 generic list/get/content에 나타나지 않는다.
- 수용: purpose validator 일반화, three private purposes reserve, generic endpoints filter.
- 선행: G0.
- 예상 파일: file schema/controller/service/spec.
- 검증: API security tests.
- 브라우저: 없음.
- 개인정보/권한: metadata와 signed URL까지 비노출.
- 증거: actor 5종 security test.

### C4.2 Canonical Bull job ID와 durable dispatcher (M)

- 결과: DB queued Job이 유실 없이 canonical jobId로 전달·재조정된다.
- 수용: queue `jobId`, dispatch retry/reconciler, public create reject, payload IDs only.
- 선행: C0.3.
- 예상 파일: job queue, db queue, dispatcher/reconciler/spec.
- 검증: duplicate/enqueue failure/reconcile tests.
- 브라우저: 없음.
- 개인정보/권한: payload/result redaction.
- 증거: queue integration logs.

### C4.3 Private evidence Redis 분리 (M)

- 결과: transcript/typed answer가 non-persistent private Redis에서 30분 이내만 존재한다.
- 수용: separate URL, no persistence compose config, bounded key/value, logout/terminal cleanup.
- 선행: C4.2.
- 예상 파일: env/config/compose/cache/spec.
- 검증: config/env/cache TTL tests, `docker compose config`.
- 브라우저: logout cache purge later.
- 개인정보/권한: key/log에 원문 금지.
- 증거: G2 cache inspection test.

### C4.4 Idempotent cleanup·outbox (M)

- 결과: 분석 결과를 유지한 채 raw audio 삭제를 최대 5회 재시도하고 exhausted를 관측한다.
- 수용: cleanup generation CAS, success idempotent, failure does not fail analysis, project-delete outbox.
- 선행: C4.1/C4.3.
- 예상 파일: cleanup/reconciler/outbox processor/spec.
- 검증: worker/API integration tests.
- 브라우저: failure copy only.
- 개인정보/권한: storage key는 internal-only, success 후 null.
- 증거: E2E-08 cleanup attempts.

### Gate G2

- [x] generic private asset 비노출
- [x] non-persistent Redis/TTL/redaction 검증
- [x] cleanup 5회·exhausted·result preservation 검증

## C5/C6 — Focused Practice vertical slice

### C5.1 Migration B와 Focused lifecycle API (M)

- 결과: 한 target scope session과 반복 attempt를 canonical DB에 저장한다.
- 수용: state CHECK/partial unique, idempotent create, exact timeline rules, manual complete/cancel.
- 선행: G1/G2.
- 예상 파일: migration B, module/service/controller/spec.
- 검증: migration/API tests.
- 브라우저: 없음.
- 개인정보/권한: owner/editor command, viewer read, cascade.
- 증거: invalid transition/race tests.

### C5.2 Focused worker·Python analysis (M)

- 결과: private STT와 bounded goal outcome이 Queue→Worker→Python→DB를 통과한다.
- 수용: IDs-only Job, transcript cache TTL, aggregate result, cleanup independent, stabilization server-derived.
- 선행: C5.1.
- 예상 파일: processor/spec, Python focused module/tests/main route.
- 검증: worker + Python tests.
- 브라우저: 없음.
- 개인정보/권한: raw evidence 영구 비보존.
- 증거: E2E-04 service trace.

### C6.1 Focused client machine·audio boundary (M)

- 결과: reload-safe 상태 머신과 Blob ref-only capture를 제공한다.
- 수용: invalid transition 차단, terminal polling stop, URL revoke/ref clear, 5분 stop, no auto complete.
- 선행: C5.2.
- 예상 파일: focused API/machine/audio hook/tests.
- 검증: web unit/integration tests.
- 브라우저: reload processing recovery, keyboard record/stop.
- 개인정보/권한: Blob/answer를 Query cache/localStorage/URL에 넣지 않는다.
- 증거: state-machine tests.

### C6.2 Focused workspace UI (M)

- 결과: 현재 장표와 성공 조건 중심의 Lilac 작업 면에서 2회 이상 반복하고 수동 종료한다.
- 수용: 44px controls, passed/failed/unmeasured text+icon, adjacency stabilization, single primary action.
- 선행: C6.1.
- 예상 파일: focused components/styles/tests, App routes.
- 검증: web build/tests.
- 브라우저: 4 viewports, all required states, keyboard, zoom, reduced motion, axe.
- 개인정보/권한: permission revoke 즉시 query/recording purge.
- 증거: E2E-04 screenshot sequence.

### Gate G3

- [ ] Focused가 full-run 통계/trend/resolution을 바꾸지 않음
- [ ] measured pass 2회만 stabilization, manual complete
- [ ] processing reload recovery와 private cleanup 통과

## C7~C10 — Challenge Q&A vertical slice

### C7.1 Migration C·source snapshot·allowlist grounding (M)

- 결과: checkpoint/final session이 exact deck/Brief/goal/reference snapshot을 frozen 상태로 가진다.
- 수용: project composite FK, content/hash limits, approved extracted refs only, retry는 frozen snapshot 사용.
- 선행: G1/G2.
- 예상 파일: migration C, Q&A repository/source service/spec.
- 검증: migration/API grounding tests.
- 브라우저: 없음.
- 개인정보/권한: question/guide만 private canonical table; grounding 원문 client 미노출.
- 증거: unapproved/cross-tenant reference rejection.

### C8.1 Q&A generation provider·worker (M)

- 결과: checkpoint 1/final 3개의 grounded 또는 insufficient 질문 revision을 생성한다.
- 수용: immutable retry revision, provider failure explicit, fixture triple gate, source validation.
- 선행: C7.1.
- 예상 파일: provider port, worker processor/spec, Python generation/tests.
- 검증: worker/Python/API tests.
- 브라우저: preparing/failed later.
- 개인정보/권한: Job/log에 question/guide 원문 금지.
- 증거: E2E-06/07 generation trace.

### C9.1 Voice/text answer analysis·assistance progress (M)

- 결과: voice와 text가 같은 bounded result contract를 사용하고 도움 사용을 단조 저장한다.
- 수용: one-shot text fetch/cache, first-answer guide gate, concept/clarity/audience fit only, cleanup.
- 선행: C8.1.
- 예상 파일: answer service/processor/spec, Python analyzer/tests.
- 검증: API/worker/Python tests.
- 브라우저: 없음.
- 개인정보/권한: typed answer는 private cache TTL 후 삭제, DB/Job/log 금지.
- 증거: redaction/expiry tests.

### C10.1 Q&A client machine·drawer primitives (M)

- 결과: server-owned active question과 accessible guide/reference drawer를 제공한다.
- 수용: voice default/text equivalent, assistance command before reveal, focus trap/Escape/return, 1/3 completion.
- 선행: C9.1.
- 예상 파일: Q&A API/machine/view model/drawer/tests.
- 검증: web tests.
- 브라우저: keyboard/focus/screen reader states.
- 개인정보/권한: raw answer를 result UI에 재표시하지 않는다.
- 증거: focus test.

### C10.2 Challenge Q&A workspace UI (M)

- 결과: 질문 하나에 집중해 반복 답변하고 checkpoint/final을 완료한다.
- 수용: first answer 전 full guide 숨김, insufficient warning+action, Cream/Lilac Soft references, no semantic purple misuse.
- 선행: C10.1.
- 예상 파일: Q&A components/styles/App routes/tests.
- 검증: web build/tests.
- 브라우저: 4 viewports, voice/text, all states, 3-question flow, axe/zoom/reduced-motion.
- 개인정보/권한: revoke/logout purge.
- 증거: E2E-06/07 screenshot sequence.

### Gate G4

- [ ] approved reference allowlist/hash/source validation
- [ ] question revision immutable retry
- [ ] first-answer guide gate와 raw answer non-retention

## C11 — 통합·demo·hardening

### C11.1 Feature flags·runtime config·compose (M)

- 결과: 모든 coaching 기능을 flag/allowlist로 안전하게 rollout·rollback한다.
- 수용: 7개 설정 strict parse, flag off legacy regression 없음, production fixture hard-fail.
- 선행: G3/G4.
- 예상 파일: config schema/index/env docs/examples/compose/tests.
- 검증: env script/config tests/compose config.
- 브라우저: flag-off routes/legacy pages.
- 개인정보/권한: secret 존재만 검증하고 출력 금지.
- 증거: config matrix.

### C11.2 Demo fixture/reset (M)

- 결과: Demo ID 하나만 transaction reset하고 frozen provenance를 표시한다.
- 수용: marker+env allowlist+flag, schema parse, expected counts, production hard-fail, metrics exclusion.
- 선행: C11.1.
- 예상 파일: reset script/fixture/schema/tests/root script.
- 검증: reset tests와 5회 scenario.
- 브라우저: fixture badge와 provider failure non-fallback.
- 개인정보/권한: 일반 project fixture path 거부.
- 증거: 5회 duration table.

### C11.3 CI 4-gate와 통합 scripts (M)

- 결과: migration/integration/e2e/python을 독립 실패 gate로 실행한다.
- 수용: root 필수 script 4개, workflow, artifact에 raw evidence 없음.
- 선행: 모든 slice.
- 예상 파일: root package, infra scripts, workflow.
- 검증: 각 script 로컬 실행.
- 브라우저: E2E script가 담당.
- 개인정보/권한: logs/screenshots masking.
- 증거: CI-equivalent logs.

### C11.4 Security·accessibility·visual E2E (M)

- 결과: actor 5종, cleanup, responsive, keyboard, axe, reload, feature-off를 실제 브라우저/API로 검증한다.
- 수용: E2E-01~08와 추가 디자인 E2E 전부 통과.
- 선행: C11.1~3.
- 예상 파일: four E2E specs와 QA evidence.
- 검증: `pnpm test:coaching:e2e`.
- 브라우저: 320/768/1024/1440, loading/ready/empty/error/stale/permission/processing/flag-off.
- 개인정보/권한: role revoke/logout 즉시 query/recording purge.
- 증거: screenshot comparison, axe, VoiceOver notes.

### Gate G5

- [ ] E2E-01~08 통과
- [ ] build/lint/test/migration/integration/e2e/python/env/compose 전부 통과
- [ ] 4 viewport와 keyboard/axe/screen-reader 검증
- [ ] demo reset 후 6분 scenario 5회 연속 성공
- [ ] secret/raw evidence/build artifact 없음

## 검증 체크포인트

- Checkpoint A (C0 2~3개 작업): shared build/test, contracts diff, migration smoke.
- Checkpoint B (C1/C2): API build/test, Brief CAS, Top 3 determinism/race.
- Checkpoint C (C3/C4): report/plan browser states, private boundary/security test.
- Checkpoint D (C5/C6): Focused integration, reload, browser/axe 4 viewport.
- Checkpoint E (C7~C10): Q&A grounding/analysis, first-answer guide, browser/axe.
- Checkpoint F (C11): full mandatory command matrix, demo 5회, migration rollback, final diff/secret scan.

## 완료 증거 원장

| 항목 | 상태 | 증거 |
| --- | --- | --- |
| 기준 문서 조사 | 완료 | source headings/contract/design/code inspection |
| 브랜치 안전성 | 완료 | `feature/adaptive-rehearsal-coach`, 기존 untracked product direction 보존 |
| 디자인 baseline | 완료 | `docs/qa/adaptive-coaching/baseline/` |
| G0 | 완료 | shared 231 tests, API 213 tests, migration A up/down/up |
| G1 | 대기 | - |
| G2 | 대기 | - |
| G3 | 대기 | - |
| G4 | 대기 | - |
| G5 | 대기 | - |
