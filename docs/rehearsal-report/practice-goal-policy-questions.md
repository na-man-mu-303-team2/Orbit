# `ac7090d` develop 머지 전 정책 확인 및 결정사항

김동현 담당자님께,

`ac7090d`는 `RehearsalReport`를 `ReportObservation`으로 변환한 뒤
공통 `evaluateCriterion`을 거쳐 `CriterionResult`를 만들고,
실제 `failed`·`partial` 결과만 `PracticeGoal` Top 3로 만드는 흐름입니다.

기존 제품 방향 문서와 현재 구현을 대조했을 때,
`develop` 머지 전에 아래 정책만 확인 부탁드립니다.

## 김동현 확인 결과

결론적으로 `ac7090d`는 그대로 `develop`에 머지하지 않고,
ranking과 반복 집계를 보완한 뒤 머지합니다.

`partial` `PracticeGoalSet` 생성 자체는 현재 정책과 일치합니다.
다만 `partial` 결과는 definitive Top 3, `FocusedPractice`, practice CTA에 사용하지 않고,
terminal 결과가 나오면 새 `final` revision/head를 발행해야 합니다.

### 확정된 정책

1. 첫 기준선과 재리허설의 Top 3 ranking을 분리합니다.
2. 반복 여부는 호환 가능한 full run 기준으로 집계합니다.
3. retryable `partial` `PracticeGoalSet`은 생성·저장할 수 있지만,
   사용자 화면과 CTA에서는 차단합니다.
4. `evaluationStatus`와 `reasonCode`는 `CriterionResult`를 canonical source로 유지합니다.
5. `observationIds`는 Goal 또는 별도 durable 연결에 보존하는 방향으로 검토합니다.
6. `resolved`, `repeated`, `unmeasured`, `incomparable` 네 가지 resolution 상태를 MVP 기준으로 유지합니다.
7. `FocusedPractice` 결과는 공식 `PracticeGoalResolution`에 사용하지 않습니다.

### `ac7090d`의 머지 전 구현 갭

- 첫 기준선과 재리허설 ranking이 분리되어 있지 않습니다.
- `focusPriority`가 모든 ranking 기준보다 먼저 적용됩니다.
- 모든 `brief` Criterion을 core 의미 누락과 동일하게 취급할 수 있지만,
  현재 `EvaluationCriterion`에는 core importance를 구분할 필드가 없습니다.
- compatible full run이 3회 미만인 경우의 직전 회차 비교와,
  3회 이상인 경우의 `occurrenceCount`, `comparableRunCount`, `lastSeenAt` 집계가 필요합니다.
- `persistent`, `improving`, `regressed`는 immutable goal row가 아니라
  `PracticePlanResponse.goals[].history`에서 노출하는 방향입니다.
- 중복 후보 병합 시 `severity` 최댓값, `failed` 우선 상태, 중복 제거된 전체 근거 보존 규칙을
  별도 테스트로 고정해야 합니다.
- `observationIds`를 리포트 근거 및 `CoachingAction`과 연결하려면 Goal field 또는 별도 join이 필요합니다.
- ranking·반복 집계·`patternKey` 정책이 바뀌면 `derivationVersion`을 올리고,
  기존 Goal Set과 Resolution은 재계산하지 않고 보존해야 합니다.

### 추가 계약 확인이 필요한 항목

- 현재 Focus 계약에는 `criterionId`와 revision이 없으므로,
  exact Criterion binding을 요구하려면 별도 shared 계약이 필요합니다.
- run-level filler/pause 같은 aggregate metric은 `targetScope=null`인
  `full-run-only` Goal로 허용합니다.
- 모든 Observation에 time-range evidence를 강제하지 않으며,
  `evidenceRefs=[]`도 정식 계약으로 허용합니다.
- 다만 UI에서는 전체 집계, 슬라이드 집계, time range, semantic cue 근거를 구분하고,
  time range가 없을 때 재생 가능한 근거처럼 표시하지 않아야 합니다.

### 머지 전 최소 수정 범위

- baseline/rerun ranking 분리
- compatible history 집계 구현
- production 호출부의 반복 정보 연결
- ranking·반복·중복 병합 회귀 테스트 추가

Focus exact binding과 Goal의 `observationIds` 저장은 shared 계약 결정 후 별도 작업으로 진행합니다.

아래에는 최초 확인을 요청했던 질문 원문을 보존합니다.

## 기존 질문 원문

## 1. 첫 기준선과 재리허설의 Top 3 ranking

제품 방향 문서에는 첫 기준선과 재리허설의 ranking을 다르게 두도록 되어 있습니다.

- 첫 기준선: 현재 core 의미 누락 → Lens의 필수 오프닝/클로징 → 장표 시간 초과 → 전달 문제
- 재리허설: 반복된 core 의미 누락 → 새 core 의미 누락 → 반복된 시간 초과 → 반복된 전달 문제 → Lens 기준

현재 `compareCandidates`는 `focusPriority` → `brief` → Lens category → `failed` → `severity` → 근거 → 반복 여부 순서로 정렬합니다.

질문:

- 첫 기준선과 재리허설을 실제로 서로 다른 ranking 정책으로 분리해야 할까요?
- 현재 구현처럼 `focusPriority`를 모든 ranking 기준보다 먼저 적용하는 것이 맞을까요?
- `brief` Criterion을 core 의미 누락과 동일한 우선순위로 취급해도 될까요?

## 2. 반복 문제의 판정 기준

제품 방향 문서에는 호환 가능한 full run이 3회 이상이면 최근 최대 5회에서
`occurrenceCount`, `comparableRunCount`, `lastSeenAt`을 계산하고
`persistent`, `improving`, `regressed` 추세를 우선하도록 되어 있습니다.

현재 구현은 최근 5개의 final full run 중 같은 `patternKey`가 한 번이라도 있으면
boolean `repeated`로 표시합니다.

질문:

- 호환 full run이 3회 미만일 때는 직전 회차와 현재 Top 3만 비교하는 정책이 맞을까요?
- 3회 이상일 때는 단순 boolean `repeated` 대신 `occurrenceCount`, `comparableRunCount`, `lastSeenAt`을 계산해야 할까요?
- `persistent`, `improving`, `regressed` 상태를 Top 3와 리포트에 노출해야 할까요?
- 반복 문제는 항상 신규 문제보다 우선하는 것이 맞을까요?

## 3. `partial` 분석 결과와 목표 생성

제품 방향 문서와 실행 ledger에는 semantic retry가 끝나지 않은 `partial` 상태에서는
partial CTA를 막고, retry가 완료된 새 revision/head를 기준으로 처리하도록 되어 있습니다.

현재 `derivePracticeGoalSet`은 `partial` report에서도 측정된 `failed`·`partial` 결과로
목표를 만들고, `PracticeGoalSet.analysisState`만 `partial`로 표시합니다.

질문:

- retryable `partial` report에서도 `PracticeGoal`을 생성해도 될까요?
- 아니면 semantic retry가 terminal 상태가 될 때까지 Top 3 생성을 보류해야 할까요?
- partial 상태에서 timing/delivery처럼 이미 측정된 항목만 임시 목표로 허용할까요?
- partial goal set이 생성된다면 사용자 화면에서 CTA를 제한해야 할까요?

## 4. Focus와 Criterion의 연결 기준

현재 구현은 Focus `kind`와 Criterion의 category/measurement를 기준으로 매칭하고,
Focus에 `targetScope`가 있으면 scope까지 비교합니다.

질문:

- Focus가 `criterionId`·`revision`·scope binding까지 정확히 지정해야 할까요?
- `targetScope`가 없는 Focus는 같은 kind의 모든 Criterion과 연결해도 될까요?
- Criterion revision 또는 scope가 바뀐 경우 기존 Focus를 `incomparable`로 처리할까요?
- `custom` Focus를 특정 Criterion에 연결하는 별도 계약이 필요한가요?

## 5. 근거가 부족한 후보의 허용 범위

현재 run 전체의 filler word/pause count처럼 수치는 있지만
구체적인 시간 구간이 없는 Observation도 Top 3 후보가 될 수 있습니다.

질문:

- aggregate metric도 bounded evidence가 없어도 `PracticeGoal`로 허용할까요?
- 모든 Top 3에 `evidenceRefs`가 필수여야 할까요?
- 근거가 없는 후보는 생성은 하되 ranking만 낮추는 정책으로 충분할까요?
- UI에서는 aggregate metric과 time-range/semantic cue 근거를 구분해 표시할까요?

## 6. 중복 Criterion을 합칠 때의 대표값

현재 같은 `criterionId + revision + scope`의 후보가 여러 개면
근거와 `observationIds`는 합치지만, `severity`·`evaluationStatus`·문구는
정렬된 첫 번째 후보의 값을 유지합니다.

질문:

- 중복 후보의 `severity`는 최댓값을 사용해야 할까요?
- `failed`와 `partial`이 함께 있으면 `failed`를 대표 상태로 사용해야 할까요?
- 병합된 모든 Observation을 최종 goal의 근거로 보존해야 할까요?

## 7. `PracticeGoal`에 보존할 평가 정보

현재 내부 `Candidate`에는 `evaluationStatus`, `observationIds`, `repeated`가 있지만
최종 `PracticeGoal`에는 `criterionRef`, `evidenceRefs`, 문구와 scope 중심의 정보만 저장됩니다.

질문:

- `PracticeGoal`에 `evaluationStatus`와 `reasonCode`를 저장해야 할까요?
- 원본 `observationIds`를 저장해 리포트 근거와 직접 연결해야 할까요?
- `repeated` 또는 추세 상태는 goal row가 아니라 `PracticeGoalResolution`에서만 관리하면 될까요?

## 8. 공식 해결 판정의 범위

현재 `PracticeGoalResolution`은 다음 full run의 `CriterionResult`를 기준으로 만들고,
`FocusedPractice` 결과는 공식 해결 판정에 사용하지 않는 방향입니다.

질문:

- `failed → partial`은 `repeated`로 볼까요, 아니면 별도의 개선 상태로 구분할까요?
- `resolved`, `repeated`, `unmeasured`, `incomparable` 네 상태로 MVP를 고정해도 될까요?
- Criterion/source/scope compatibility가 깨진 경우 해당 goal만 `incomparable`로 처리하는 것이 맞을까요?

## 9. 정책 변경 시 `derivationVersion`

`PracticeGoalSet`은 현재 `derivationVersion: 1`을 사용하고,
goal set과 goal row는 revision별 immutable로 관리합니다.

질문:

- ranking 또는 반복 집계 정책이 바뀌면 `derivationVersion`을 증가시켜야 할까요?
- 정책 변경 후 기존 goal set을 재계산하지 않고 새 revision만 생성하면 될까요?
- 기존 goal의 resolution 결과는 과거 정책 기준으로 보존하는 것이 맞을까요?

## 답변 반영 후 후속 작업 우선순위

김동현 확인 결과를 기준으로, 먼저 아래 작업을 진행합니다.

1. 첫 기준선과 재리허설의 ranking 분리
2. 최근 compatible full run 기반 반복 집계
3. retryable `partial` 상태의 저장/노출 경계 반영
4. 중복 후보 대표값과 Observation 연결 규칙 테스트 추가

정책에 영향을 주는 shared 계약 변경은 별도 합의 후 진행하고,
그 전까지는 `ac7090d`의 worker 내부 ranking·집계·테스트 보완을 우선합니다.
