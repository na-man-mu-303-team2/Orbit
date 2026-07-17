# 최영빈 P0 공통 평가기 구현·커밋 계획

## 문서 기준

이 계획은 다음 세 문서만 기준으로 작성한다.

1. `AGENTS.md`
2. `docs/Orbit-업무분담.md`
3. `docs/yb/rehearsal-speech-evidence-dto-contract.md`

위 세 문서 외 PM 자료나 별도 계획 문서는 이 문서의 구현 범위와 커밋 단위를 결정하는 근거로 사용하지 않는다.

### 김동현 음성 측정 계약 적용 범위

- 김동현 문서는 `ReportObservation`에 전달될 음성 측정 원천값, 측정 불가 상태, TypeScript와 Python 사이의 DTO, Evidence 경계를 정의하는 참고 계약으로 사용한다.
- 최영빈 구현은 해당 측정 결과를 다시 계산하지 않고 공통 평가기의 입력으로 소비한다.
- DTO, CPM/WPM, STT Quality Gate, filler/pause, Evidence Clip의 계산과 보관·삭제·권한 구현은 김동현 및 연관 담당 영역으로 유지한다.
- 문서 간 규칙이 충돌하면 `AGENTS.md`를 우선하고, 담당 범위는 `docs/Orbit-업무분담.md`를 따른다.

## 구현 원칙

`AGENTS.md`에 따라 다음 원칙을 지킨다.

- 공통 계약을 기능 구현보다 먼저 확인한다.
- Worker 작업은 `apps/worker`, API 작업은 `apps/api` 경계를 지킨다.
- 요청 범위를 벗어난 리팩터링, 파일 이동, 대량 포맷팅을 하지 않는다.
- 공통 Schema와 데이터베이스 Migration은 이 브랜치에서 수정하지 않는다.
- 외부 입력과 저장 전 결과는 공통 Schema의 런타임 검증을 거친다.
- transcript 원문, raw audio, 발표자 script, 파일 base64, 비밀값을 결과나 로그에 남기지 않는다.
- 기능 브랜치에서 작업하고 PR을 통해 병합한다.
- 이미 공유된 브랜치에 rebase나 force push를 하지 않는다.
- 테스트를 실행하지 못하면 이유와 남은 검증 범위를 작업 결과에 기록한다.

## 현재 구현 범위

현재 브랜치에서는 `docs/Orbit-업무분담.md`에 정의된 최영빈의 P0 작업만 구현한다.

```text
PresentationBrief와 RehearsalFocusProfile Snapshot
  → EvaluationCriterion
  → ReportObservation
  → CriterionResult
  → 실패·부분 전달 후보
  → 결정적 Top 3 PracticeGoal
  → CoachingAction
  → 비교 가능한 전체 발표 이력
```

### 담당 산출물

- `CriterionResult`: Criterion 하나의 측정 여부, 평가 상태, 이유
- `PracticeGoal`: 실제 실패 또는 부분 전달 문제와 다음 행동
- `CoachingAction`: 관측, 청중 영향, 행동, 연습 범위, 성공 조건, CTA Target
- `topActions`: 결정적인 순서로 정렬된 최대 세 개의 행동
- 비교 가능한 전체 발표만 사용한 반복 기록

### 담당 경계

```text
김동현 → ReportObservation
최영빈 → CriterionResult·PracticeGoal·CoachingAction·비교 판정
이창원 → Focused Practice·Q&A에 공통 평가기 연결
임재환 → CoachingReportView 조립·Schema 검증·화면 통합
```

### 수정하지 않는 영역

- 공통 Schema
- 데이터베이스 Migration
- 집중 연습 API
- 질문·답변 API
- 결과 보고서 화면
- Python 음성 분석 코드

## 구현 순서 재구성

업무분담 문서의 1~14번은 요구사항 순서다. 실제 커밋은 코드 의존성에 맞게 다음 순서로 진행한다.

| 실행 단계 | 구현 내용 | 대응 구현 순서 |
| --- | --- | --- |
| 1 | Brief 평가계획과 실행 Snapshot 검증 | 1, 2, 3 |
| 2 | 공통 Criterion 평가기 | 4, 5, 6 |
| 3 | 회차 간 Criterion 비교 가능성 | 2, 14 |
| 4 | 실제 문제 Top 3 후보·정렬·중복 제거 | 7, 8, 9, 10, 11 |
| 5 | Top 3의 CoachingAction 도출 | 12 |
| 6 | immutable 분석 Revision 저장 통합 | 13 |
| 7 | 비교 가능한 전체 발표 반복 기록 | 14 |

비교 가능성을 Top 3보다 먼저 구현하는 이유는 반복 여부가 Top 3 정렬 기준에 포함되기 때문이다. 저장 통합과 API 이력 계산은 계산 로직과 분리해, 앞선 순수 함수가 검증된 뒤 연결한다.

## 단계별 구현 내용

### 1. Brief 평가계획과 실행 Snapshot

- `briefRef`와 `evaluationSnapshot.evaluationPlan`을 읽는 경계를 명확히 한다.
- Brief ID·Revision, 평가계획, RehearsalFocusProfile Revision이 실행 당시 Snapshot 값으로 고정되는지 검증한다.
- 승인된 필수 내용·시작·마무리만 Criterion으로 만든다.
- 청중·목적·원하는 결과는 Lens·우선순위·설명 문맥에 사용한다.
- 예상 질문은 Criterion에 섞지 않고 질문·답변 입력 경계로 분리한다.

### 2. 공통 Criterion 평가기

- 입력은 `EvaluationCriterion`, 검증된 `ReportObservation | null`, 측정 불가 이유, `evaluatedAt`이다.
- 출력은 `CriterionResult` 하나다.
- 전체 발표·집중 연습·질문 답변은 같은 입력이면 같은 결과를 얻는다.
- 평가기는 Top 3 정렬, 문구 생성, 화면 조립을 하지 않는다.
- 측정 자료가 없거나 분석할 수 없으면 실패가 아니라 측정 불가로 처리한다.

의미 전달 상태는 다음 표를 그대로 적용한다.

| 의미 상태 | CriterionResult | PracticeGoal evidence | 목표 생성 |
| --- | --- | --- | --- |
| `covered` | `passed` / `PASSED` | 없음 | 아니요 |
| `partial` | `partial` / `PARTIAL` | `not_covered` | 예 |
| `missed` | `failed` / `CONCEPT_MISSED` | `missed` | 예 |
| `contradicted` | `failed` / `CONCEPT_MISSED` | `contradicted` | 예 |

### 3. 비교 가능성

- 단일 실행의 평가 상태와 회차 간 비교 가능성을 분리한다.
- 비교 키는 `deckContentHash`, `briefRef`, Lens ID·Revision, Criterion ID·Revision, Target Scope, 지표 버전이다.
- 하나라도 호환되지 않으면 해당 Criterion의 회차는 `incomparable`로 처리한다.
- 비교 불가 회차는 반복·재발·개선 이력과 추세 분모에 넣지 않는다.

### 4. 실제 문제 Top 3

- measured 상태의 실패 또는 부분 전달만 후보로 만든다.
- 통과, 측정 불가, 비교 불가 결과는 문제 후보에서 제외한다.
- 실제 후보가 없으면 `topActions=[]`로 둔다.
- 유지 연습과 질문·답변은 문제 Top 3와 분리된 Next Practice Action으로 취급한다.
- 같은 Criterion과 범위의 중복 문제는 하나로 합친다.
- `fallbackCandidates()`는 문제 Top 3에서 제거하거나 유지 연습 전용 경계로 분리한다.
- 사용자 목표와 연결된 실패·부분 전달 후보를 먼저 고려한다.
- 사용자 목표가 통과한 Criterion을 실패 문제로 바꾸지는 않는다.

첫 기준선과 재리허설은 같은 정렬표를 사용하지 않는다. `PracticeGoalRankingContext.mode`에 따라 다음 tier를 먼저 적용한다.

| mode | tier 순서 |
| --- | --- |
| `baseline` | core semantic → opening/closing → timing → delivery → 기타 문제 |
| `rerun` | 반복 core semantic → 신규 core semantic → 반복 timing → 반복 delivery → opening/closing → 기타 반복 문제 → 기타 신규 문제 |

core semantic은 Brief의 semantic must-cover Criterion과 실행 Snapshot에서 `importance="core"`로 고정된 deck cue Criterion이다. `focusPriority`는 이 tier를 바꾸지 않고 같은 tier 안에서만 우선순위를 높인다. 따라서 Focus delivery가 baseline의 core semantic을 추월하지 않는다.

같은 tier 안에서는 다음 tie-break를 순서대로 적용한다.

1. `focusPriority` 오름차순. 연결된 Focus Item이 없으면 `99`로 취급한다.
2. evaluator Lens의 category 순서.
3. `failed` 우선, 그다음 `partial`.
4. severity 내림차순.
5. bounded evidence가 있는 후보 우선.
6. `targetScope`가 있어 집중 연습 가능한 후보 우선.
7. 슬라이드 순서. `opening=0`, `closing=998`, 알 수 없는 범위와 run scope는 `999`다.
8. `criterionId`, revision, scope, `observationIds`를 canonical JSON으로 만든 stable key.

Lens별 category 순서는 다음과 같다.

| evaluator Lens | category 우선순위 |
| --- | --- |
| `decision-maker` | `semantic` → `structure` → `timing` → `delivery` |
| `strict-reviewer` | `semantic` → `delivery` → `structure` → `timing` |
| `general-novice` | `structure` → `semantic` → `timing` → `delivery` |

severity는 `partial=1`, semantic `contradicted=3`, 그 외 semantic 실패 `=2`로 둔다. 시간은 `관측 시간 / 허용 시간`, 횟수는 `1 + (관측 횟수 - 허용 횟수) / (허용 횟수 + 1)`로 계산한다. 근거 신뢰도는 가중치를 추정하지 않고 `observation.evidenceRefs`에 bounded evidence가 있는지만 사용한다.

반복 정보는 `PracticeGoalRankingContext.patternHistory`로 전달한다. pattern별로 다음 값을 보관한다.

- `previousCompatibleRunCount`: 이전 compatible measured full run 수
- `previousIssueCount`: 해당 run들에서 실제 문제가 발생한 횟수
- `issueInLatestCompatibleRun`: 직전 compatible run의 문제 여부
- `lastOccurredAt`: 가장 최근 문제 발생 시각

현재 run을 포함한 compatible measured run이 3회 미만이면 직전 compatible run에서도 같은 문제가 발생한 경우만 반복으로 본다. 3회 이상이면 이전 compatible run 중 한 번 이상 같은 문제가 발생한 현재 문제를 반복으로 본다. 이전 compatible measured run이 하나라도 있으면 `rerun`, 없으면 `baseline`이다.

후보는 같은 `criterionId`, revision, scope를 가진 문제를 하나로 병합한다. 대표 후보는 같은 comparator로 명시적으로 선택하고, 병합 결과는 `failed` 상태와 최대 severity를 보존한다. `evidenceRefs`와 `observationIds`는 중복 제거 후 안정적으로 정렬하고 각각 최대 20개로 제한한다. 병합이 끝난 후보를 다시 정렬해 최대 3개를 선택하며, 최종 `PracticeGoal.priority`는 배열 index에 `1`을 더해 부여한다.

### 5. CoachingAction

각 Top 3에서 다음 항목을 만든다.

- 관측 사실
- 청중 영향
- 바꿀 행동
- 연습 범위
- 성공 조건
- 실제 Observation 참조
- 공통 계약의 CTA Target

화면 주소, 음성 주소, 전체 transcript는 넣지 않는다. 임재환의 Projector는 이 값을 다시 계산하지 않고 조립·검증만 한다.

`deriveCoachingActions()`는 최영빈 담당의 순수 도출 산출물로 유지한다. 실제 `CoachingReportView.topActions` 조립·저장은 임재환의 Projector 통합 단계에서 연결한다.

### 6. 분석 Revision 저장

- 기존 결과를 수정하지 않는다.
- 새 분석 결과는 새 Revision의 목표 묶음으로 저장한다.
- 같은 분석 Revision의 재실행은 중복 결과를 만들지 않게 한다.
- current pointer 전환과 새 목표 묶음 저장의 경계를 유지한다.
- 부분 전달은 해결로 처리하지 않는다.

### 7. 반복 기록

- 전체 발표만 반복 기록에 사용한다.
- 실제로 비교 가능한 회차만 집계한다.
- 집중 연습과 질문·답변 결과를 전체 발표 추세에 섞지 않는다.
- `recent-twice`는 비교 가능한 최근 전체 발표 두 번에서 같은 문제가 이어진 경우만 사용한다.
- 문제 → 정상 → 문제는 연속 두 번 문제로 표시하지 않는다.
- 현재를 포함한 compatible measured run이 3회 이상이고 이전에 한 번 이상 같은 문제가 있었다면 `persistent`로 표시한다.
- 과거 `practice_goals.pattern_key` 존재 여부가 아니라 각 run의 report를 공식 Criterion 규칙으로 재평가해 occurrence를 계산한다.
- semantic cue, timing, filler, pause만 현재 report 계약에서 측정 가능한 범위로 집계하고 Brief 결과가 없으면 `unmeasured`로 제외한다.

### 후속 계약 경계

- Brief must-cover/opening/closing의 실제 측정은 김동현 담당 semantic endpoint가 run/time-window Criterion에 대응하는 검증된 `ReportObservation`을 제공한 뒤 연결한다. 그 전까지 Worker는 이 항목을 `NO_MEASUREMENT`로 유지하며 transcript나 deck cue로 결과를 추정하지 않는다.
- `CoachingReportView.topActions`의 실제 조립·저장은 임재환 Projector 통합 단계의 후속 작업이다.
- 위 두 작업은 shared Schema, Python DTO, DB Migration 합의가 필요한 별도 계약 작업이며 현재 브랜치에서는 변경하지 않는다.

## 커밋 단위와 commit body

14개 번호마다 커밋을 만들지 않는다. 하나의 동작을 독립적으로 검증할 수 있는 기능군 단위로 7개 커밋을 만든다.

각 commit body에는 반드시 다음 세 구역을 둔다.

```text
구현 순서 대응:
- 번호. 반영한 요구사항

주요 구현:
- 실제 변경한 동작

검증:
- 실행한 테스트 명령과 결과
```

### Commit 1. Brief 평가계획과 Snapshot

```text
feat: Brief 평가계획과 실행 Snapshot 검증을 보강

구현 순서 대응:
- 1. briefRef와 evaluationSnapshot.evaluationPlan에서 평가 조건을 읽는다.
- 2. Brief·평가계획·RehearsalFocusProfile Revision의 Snapshot 고정을 검증한다.
- 3. 승인된 필수 내용·시작·마무리만 Criterion으로 만들고 예상 질문 입력을 분리한다.

주요 구현:
- Brief 기반 Criterion 생성과 Snapshot 경계 테스트를 추가한다.
- 실행 후 변경된 Brief나 Focus Profile을 과거 평가에 다시 사용하지 않도록 검증한다.

검증:
- evaluation-plan 관련 단위 테스트
- Snapshot Revision 경계 테스트
```

### Commit 2. 공통 Criterion 평가기

```text
feat: 공통 criterion 평가기를 추가

구현 순서 대응:
- 4. ReportObservation과 Criterion을 같은 공통 평가기로 처리한다.
- 5. 측정 자료가 없는 결과를 실패가 아닌 측정 불가로 처리한다.
- 6. semantic 상태를 고정표대로 CriterionResult로 변환한다.

주요 구현:
- criterion-evaluator 순수 함수와 런타임 검증을 추가한다.
- 전체 발표·집중 연습·질문 답변의 입력 출처가 결과에 영향을 주지 않게 한다.

검증:
- semantic 네 상태 테스트
- timing·filler·pause 경계 테스트
- 측정 불가·입력 불일치 테스트
```

### Commit 3. Criterion 비교 가능성

```text
feat: criterion 비교 가능성 판정을 추가

구현 순서 대응:
- 2. 실행 당시 Snapshot identity와 Revision을 비교 기준으로 사용한다.
- 14. 실제로 비교 가능한 전체 발표를 고르는 판정 기반을 만든다.

주요 구현:
- deck·Brief·Lens·Criterion·Target Scope·지표 버전 비교를 순수 함수로 분리한다.
- 비교 불가를 측정 실패와 별도 상태로 유지한다.

검증:
- 비교 키별 일치·불일치 테스트
- 비교 불가 회차 제외 테스트
```

### Commit 4. 실제 문제 Top 3

```text
refactor: 실제 평가 결과와 사용자 목표로 Top 3를 도출

구현 순서 대응:
- 7. 실패·부분 전달만 후보로 만들고 후보가 없으면 빈 결과를 반환한다.
- 8. baseline/rerun tier와 결정적 tie-break로 정렬한다.
- 9. 사용자 목표와 연결된 실패·부분 전달 후보를 먼저 고려한다.
- 10. 같은 Criterion과 범위의 중복을 합치고 fallbackCandidates를 문제 후보에서 제거한다.
- 11. 마지막 tie-break까지 고정해 같은 입력에 같은 결과를 만든다.

주요 구현:
- 공통 평가 결과 기반 후보 생성과 중복 제거를 추가한다.
- 비교 가능한 반복 정보를 `PracticeGoalRankingContext`로 받는다.
- Focus는 같은 tier 안에서만 boost하고 중복 병합 시 `failed`와 최대 severity를 보존한다.
- 가짜 문제 Top 3 생성을 제거한다.

검증:
- baseline/rerun tier와 Focus tier 경계 테스트
- 중복 제거·정렬·tie-break 테스트
- 통과 항목만 있을 때 빈 Top 3 테스트
```

### Commit 5. CoachingAction

```text
feat: Top 3 CoachingAction 도출기를 추가

구현 순서 대응:
- 12. 각 Top 3에서 관측·영향·행동·연습 범위·성공 조건·Observation·CTA Target을 만든다.

주요 구현:
- coaching-action-derivation 순수 함수를 추가한다.
- 실제 Criterion과 Observation을 참조하는 typed action을 생성한다.
- 화면 주소와 민감정보를 action에서 제외한다.

검증:
- Observation 참조 무결성 테스트
- CTA Target과 availability 테스트
- transcript·음성 주소 비노출 테스트
```

### Commit 6. 분석 Revision 저장

```text
feat: goal set 분석 Revision 저장 흐름을 통합

구현 순서 대응:
- 13. 과거 결과를 수정하지 않고 새 분석 Revision의 목표 묶음으로 저장한다.

주요 구현:
- 평가 결과와 PracticeGoalSet 저장 흐름을 연결한다.
- 같은 Revision 재실행의 idempotency와 current pointer 전환을 유지한다.
- partial semantic 결과를 해결로 저장하지 않는다.

검증:
- immutable Revision 테스트
- 동일 Revision 재실행 테스트
- partial 결과 resolution 테스트
```

### Commit 7. 비교 가능한 전체 발표 이력

```text
fix: 호환 가능한 전체 발표만 반복 기록에 반영

구현 순서 대응:
- 14. 실제로 비교 가능한 전체 발표만 사용해 반복 기록을 계산한다.

주요 구현:
- 집중 연습·질문 답변·측정 불가·비교 불가 회차를 집계에서 제외한다.
- recent-twice와 persistent를 비교 가능한 전체 발표 기준으로 계산한다.
- 문제 → 정상 → 문제를 연속 두 번 문제로 표시하지 않는다.

검증:
- 최근 두 번 연속 문제 테스트
- 문제 → 정상 → 문제 테스트
- 비호환·측정 불가 회차 제외 테스트
```

## 커밋 전 체크리스트

각 커밋 전에 다음을 확인한다.

- 커밋이 하나의 독립적인 동작을 완성하는가?
- 해당 구현 순서 번호가 commit body에 모두 기록됐는가?
- 아직 구현하지 않은 요구사항 번호를 body에 넣지 않았는가?
- 테스트와 구현이 같은 커밋에 포함됐는가?
- 공통 Schema, Migration, 다른 담당자의 API·UI·Python 코드를 건드리지 않았는가?
- transcript, raw audio, script, 비밀값이 코드·Fixture·로그에 들어가지 않았는가?
- 테스트 명령과 결과가 `검증` 구역에 기록됐는가?

## 최종 검증

변경 범위에 맞춰 다음을 실행한다.

```bash
pnpm --filter @orbit/shared test
pnpm --filter @orbit/worker test
pnpm --filter @orbit/worker typecheck
pnpm --filter @orbit/api test
pnpm --filter @orbit/api typecheck
git diff --check
```

테스트를 실행하지 못한 항목은 이유와 남은 검증 범위를 PR 본문에 기록한다.

## P1 경계

현재 브랜치에서는 P0만 구현한다.

최영빈의 P1 후보는 다음과 같다.

- Lens별 Rubric으로 평가 항목과 성공 조건까지 변경
- Criterion 개선 이력을 신규·개선 중·해결·반복·재발·측정 불가·비교 불가로 확장

P1은 Phase 4의 계약 승인 후 별도 작업으로 진행한다. P1 계약 PR이 병합되기 전에는 공통 Schema나 Migration을 이 브랜치에서 수정하지 않는다.
