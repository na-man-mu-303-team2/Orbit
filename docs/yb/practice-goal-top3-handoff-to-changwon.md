# Practice Goal Top 3 → 집중 연습 데이터 인계

## 문서 목적

이 문서는 최영빈 담당의 공통 평가·Top 3 도출 결과를 이창원 담당의 집중 연습 기능에 전달하는 기준을 정리한다.

다음 문서를 최신 합의 기준으로 반영했다.

- `ORBIT_집중연습_데이터_전달계약.md`
- 작성일: 2026-07-14
- 상태: P0 구현 기준

이 문서는 현재 구현을 설명하는 동시에, 계약과 아직 맞지 않는 부분을 명시한다. 공통 Schema와 DB Migration은 이 문서만으로 변경하지 않는다.

## 결론

현재 두 구현은 다음 identity와 wire shape에서는 연결 가능하다.

```text
sourceFullRunId
sourceGoalSetId
goalId
criterionRef
targetScope
```

하지만 현재 상태를 완전 호환으로 보기는 어렵다.

- 최영빈 구현은 문제 평가·Top 3 정렬과 새 `scopeId` 생성식, 성공 조건 문구, 다섯 Target Fixture까지 반영했다. sentence identity의 생성·stale 검증 정책은 별도 합의가 남아 있다.
- 이창원 구현은 세션 생성 계약과 연속 두 번 통과 계산은 맞지만, 집중 연습 판정이 아직 공통 평가기가 아닌 임시 Python 규칙을 사용한다.
- 자료 변경 시 Target stale 판정과 `sentence`, `slide-range`, `opening`, `closing` 실행 경로가 충분히 검증되지 않았다.
- `CoachingAction/topActions`의 보고서 Projector 연결은 별도 통합 단계가 필요하다.

따라서 현재 상태는 **구조적 연결 가능, 평가 의미와 전체 Target 동작은 보완 필요**로 판정한다.

## 책임 경계

```text
측정 계층
  → 검증된 ReportObservation

최영빈 공통 평가 계층
  → CriterionResult
  → failed·partial 문제 후보
  → 결정적인 Top 3 PracticeGoal
  → CoachingAction·topActions

이창원 집중 연습 계층
  → 전달받은 Target으로 세션 생성
  → 같은 Criterion 단위의 Observation 생성
  → 공통 평가 결과로 시도 판정
  → 인접한 두 measured pass 안정화

임재환 Projector
  → 저장 결과를 재계산하지 않고 CoachingReportView 조립
```

최영빈은 무엇을 다시 연습할지 결정한다. 이창원은 전달받은 문제의 종류, 순위, 성공 기준을 다시 만들지 않고 해당 범위를 연습·측정한다.

## 데이터 흐름

```text
발표 시작
  → Deck·Brief·Lens·Focus·Criterion Snapshot 고정
  → 측정 계층이 ReportObservation 생성
  → 공통 평가기가 CriterionResult 생성
  → measured + failed/partial만 후보로 선택
  → Top 3 PracticeGoal 생성
  → CoachingAction 생성
  → focused-practice CTA가 PracticeGoal.goalId를 참조
  → 이창원 세션이 같은 Goal·Criterion·Target을 보존
```

반드시 유지해야 하는 identity는 다음과 같다.

```text
CoachingAction.criterionRef
  = PracticeGoal.criterionRef
  = CriterionResult.criterionRef

CoachingAction.target.goalId
  = PracticeGoal.goalId

PracticeGoal.originFullRunId
  = CoachingAction.target.sourceFullRunId

PracticeGoal.nextAction
  = CoachingAction.instruction

PracticeGoal.successCondition
  = CoachingAction.successCondition
```

`CoachingAction`에는 `category`가 없다. `EvaluationCriterion`, `CriterionResult`, `PracticeGoal`에서 같은 `category`를 유지한다.

## Top 3 생성 방식

Top 3는 생성형 AI가 직접 작성하는 목록이 아니다.

```text
EvaluationCriterion
  + AI·STT·시간·습관어·멈춤 분석으로 만든 ReportObservation
  → CriterionResult
  → 규칙 기반 후보 추출
  → 반복 이력과 ranking tier 적용
  → 최대 3개 PracticeGoal
```

AI는 semantic cue 추출과 의미 전달 상태 측정에 관여할 수 있다. 최종 문제 여부와 Top 3 순서는 고정된 평가·정렬 규칙으로 결정한다.

### 후보 조건

다음을 모두 만족해야 한다.

```text
measurementState = measured
evaluationStatus = failed 또는 partial
observationId 존재
Observation.criterionRef = CriterionResult.criterionRef
```

`passed`, `not-evaluated`, 측정 불가, 비교 불가, Observation 없는 결과는 후보가 아니다. 실제 후보가 없으면 빈 Goal Set과 `topActions=[]`를 사용한다. `fallbackCandidates()`로 가짜 문제를 채우지 않는다.

### ranking

baseline:

```text
core semantic
→ opening/closing
→ timing
→ delivery
→ 기타 문제
```

rerun:

```text
반복 core semantic
→ 신규 core semantic
→ 반복 timing
→ 반복 delivery
→ opening/closing
→ 기타 반복 문제
→ 기타 신규 문제
```

`focusPriority`는 같은 tier 안에서만 순서를 올린다. 이후에는 Lens 순서, `failed` 우선, severity, bounded evidence, Target 존재 여부, 슬라이드 순서, stable key를 사용한다.

## Target 전달 규칙

Target은 문제 종류인 `category`와 다르다. Target은 사용자가 실제로 다시 연습할 범위다.

P0 Target은 다음 다섯 종류다.

| Target        | 연습 범위                        |
| ------------- | -------------------------------- |
| `sentence`    | 지정된 슬라이드의 특정 대본 문장 |
| `slide`       | 특정 슬라이드 한 장              |
| `slide-range` | 연속된 여러 슬라이드             |
| `opening`     | 발표의 도입 역할                 |
| `closing`     | 발표의 마무리 역할               |

### 선택 순서

1. 발표 시작 Snapshot의 `RehearsalFocusProfile`에 Criterion과 일치하는 확정 Target이 있으면 Target과 `scopeId`를 그대로 재사용한다.
2. 확정 Target이 없으면 Criterion scope를 Target으로 변환한다.
3. `run` scope이고 위치를 안전하게 확정하지 못하면 `targetScope=null`, `recommendedPracticeMode=full-run-only`로 둔다.

```text
Criterion slide             → Target slide
Criterion slide-range       → Target slide-range
Criterion time-window/open  → Target opening
Criterion time-window/close → Target closing
Criterion run               → 원칙적으로 null
```

`run` Observation의 모든 근거가 한 슬라이드만 가리키는 경우에만 별도 정책에 따라 `slide`로 좁힐 수 있다. 위치가 불명확하면 추측하지 않는다.

### sentence

`sentence`는 다음 값이 이미 확정된 경우에만 사용한다.

```text
slideId
sentenceIndex // 0부터 시작
textSnapshotHash // SHA-256, 소문자 64자리
scopeId
```

Transcript에서 비슷한 문장을 찾아 Target을 새로 만들지 않는다. 문장 분리와 정규화는 계약에서 정한 공통 함수를 사용해야 한다.

```text
splitFocusedPracticeSentences()
normalizeFocusedPracticeSentenceText()
```

현재 저장소에는 위 이름의 공통 함수가 없고 `RehearsalEvaluationSnapshot.slides`에도 발표자 대본이 포함되지 않는다. 따라서 sentence hash 생성·검증 위치는 별도 합의가 필요하다. 이 합의 전에는 Snapshot에 이미 고정된 sentence Target만 재사용하고 새 sentence Target을 추측 생성하지 않는다.

### slide-range

- 시작과 끝은 서로 다른 슬라이드여야 한다.
- Snapshot 순서에서 시작이 끝보다 앞서야 한다.
- 중간 슬라이드를 건너뛰지 않는 연속 범위여야 한다.

### opening·closing

- `opening`은 Snapshot의 첫 슬라이드에서 도입 역할을 연습한다.
- `closing`은 Snapshot의 마지막 슬라이드에서 마무리 역할을 연습한다.
- 현재 Deck의 첫 장 또는 마지막 장이 원본 Snapshot과 달라졌다면 기존 Target을 자동 실행하지 않는다.

### scopeId

기존 Focus Target을 재사용하면 기존 `scopeId`도 그대로 사용한다.

새 Target은 다음 입력의 결정적 Hash로 만든다.

```text
scopeId = "scope_" + SHA-256({
  sourceFullRunId,
  criterionRef,
  target의 type과 위치 정보
}) 앞 24자리
```

문장 위치 정보에는 `slideId`, `sentenceIndex`, `textSnapshotHash`를 모두 포함한다.

## 성공 기준 전달 규칙

집중 연습 판정은 화면 문구에서 숫자나 조건을 다시 추출하지 않는다.

```text
실제 판정 기준 = Snapshot의 EvaluationCriterion.measurement
화면 문구 = PracticeGoal.successCondition
          = CoachingAction.successCondition
```

| Criterion              | 실제 통과 조건   | 표시 문구                                           |
| ---------------------- | ---------------- | --------------------------------------------------- |
| `max-duration-seconds` | actual ≤ maximum | `{maximum}초 이내로 핵심 내용을 전달합니다.`        |
| filler `max-count`     | actual ≤ maximum | `반복 말버릇을 {maximum}회 이하로 유지합니다.`      |
| pause `max-count`      | actual ≤ maximum | `긴 멈춤을 {maximum}회 이하로 유지합니다.`          |
| semantic               | `covered`        | `{Criterion.label}의 필수 내용을 모두 전달합니다.`  |
| opening                | `covered`        | `도입부에서 {Criterion.label}을 명확히 전달합니다.` |
| closing                | `covered`        | `마무리에서 {Criterion.label}을 명확히 전달합니다.` |

semantic `partial`은 성공이 아니다. 집중 연습 화면의 권장 연습 시간은 성공 기준과 별개이며 Criterion threshold를 바꾸지 않는다.

## 집중 연습 세션 요청

현재 shared 요청 형태와 최영빈 출력은 구조적으로 맞는다.

```ts
{
  clientRequestId,
  sourceFullRunId,
  sourceGoalSetId,
  goalIds: [goalId],
  targetScope,
}
```

집중 연습 담당은 다음을 유지한다.

- Goal이 요청한 `sourceGoalSetId`에 실제로 속하는지 확인한다.
- Goal Set은 `final` 분석 결과여야 한다.
- Goal은 `measured`이고 `targetScope`가 있어야 한다.
- 요청 `targetScope`와 저장된 `PracticeGoal.targetScope`가 정확히 같아야 한다.
- 여러 Goal을 한 세션에 넣으면 같은 Target을 공유해야 한다.
- 원본 Criterion ID·Revision을 세션 Snapshot에 고정한다.

## 집중 연습 시도 판정

집중 연습에서도 최종 판정 규칙을 새로 만들지 않는다.

```text
집중 연습 측정
  → 원본 Criterion과 같은 단위의 ReportObservation
  → 공통 criterion-evaluator
  → CriterionResult
  → FocusedPracticeGoalOutcome
```

다음 임시 판정은 사용하지 않는다.

- Transcript 길이로 semantic 성공 판정
- 모든 `max-count`를 `transcript.count("음")`으로 계산
- 사용자 문구에서 threshold 추출
- 측정 불가를 실패로 변환

안정화는 같은 Goal의 인접한 두 terminal 시도가 모두 `succeeded + measured + passed`일 때만 인정한다.

```text
pass → pass             = 안정화
pass → unmeasured → pass = 안정화 아님
pass → cancelled → pass  = 안정화 아님
pass → failed job → pass  = 안정화 아님
```

집중 연습의 안정화는 공식 해결이 아니다. 다음 전체 발표에서 같은 Criterion을 다시 평가해 해결·반복·측정 불가·비교 불가를 확정한다. 집중 연습 시도는 전체 발표 최근 5회 반복 이력에 넣지 않는다.

## 현재 구현 호환성 점검

| 계약 항목                                           | 현재 상태                                                                 | 판정                              |
| --------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------- |
| `sourceFullRunId`, `sourceGoalSetId`, `goalId` 전달 | Web 요청과 API 세션에서 유지                                              | 호환                              |
| `criterionRef` Revision 고정                        | PracticeGoal과 focused session Snapshot에 유지                            | 호환                              |
| Target shared Schema                                | 다섯 union 타입이 존재                                                    | 호환                              |
| 저장 Goal과 요청 Target 동일성 검사                 | API가 canonical JSON으로 비교                                             | 호환                              |
| final Goal Set만 세션 생성                          | `analysis_state === final` 검사                                           | 호환                              |
| 인접한 두 pass 안정화                               | failed·cancelled·unmeasured를 사이에 두면 안정화하지 않음                 | 호환                              |
| Top 3 후보 규칙                                     | measured failed·partial만 선택                                            | 호환                              |
| 반복 이력 분리                                      | focused 시도는 full-run history에 포함되지 않음                           | 호환                              |
| 새 `scopeId` 생성식                                 | `sourceFullRunId`, `criterionRef`, Target 위치를 Hash 입력으로 사용       | 호환                              |
| 성공 문구 템플릿                                    | semantic·timing·filler·pause·opening·closing 문구를 계약에 맞춤           | 호환                              |
| 5종 Target Fixture                                  | 다섯 Target, full-run-only, 빈 topActions Fixture가 shared Schema를 통과  | 호환                              |
| sentence hash 검증                                  | 공통 분리·정규화 함수와 대본 Snapshot이 없음                              | 공동 계약 확인 필요               |
| slide-range 연속성                                  | Worker는 Snapshot 순서상 유효하지 않은 범위를 full-run-only로 강등        | 부분 호환 — 이창원 실행 검증 남음 |
| 자료 변경 stale 판정                                | 세션 생성 시 현재 Deck과 원본 Snapshot을 비교하지 않음                    | 수정 필요 — 이창원                |
| focused 공통 평가기 사용                            | Python이 Transcript 길이와 `"음"` 개수로 직접 outcome 생성                | 수정 필요 — 이창원                |
| pause와 filler 분리 측정                            | Python이 두 metric 모두 `"음"` 개수로 계산                                | 수정 필요 — 이창원                |
| 비-slide Target 화면·timeline                       | Web은 slide만 표시하고 나머지는 `slide-unknown` timeline 사용             | 수정 필요 — 이창원                |
| 현재 Goal Set 여부                                  | 에러 문구는 current/final을 요구하지만 SQL은 `is_current`를 확인하지 않음 | 정책 확인 후 이창원 수정          |
| `CoachingAction/topActions` production 연결         | 순수 도출기는 있으나 production 호출·Projector 조립이 없음                | 임재환 통합 필요                  |

## 최영빈 적용 결과

1. 새 Target의 `scopeId` 입력에 `sourceFullRunId`, `criterionRef`, Target 위치를 포함했다.
2. 기존 Focus Target은 `scopeId`를 포함해 그대로 재사용한다.
3. semantic·opening·closing·filler·pause 성공 조건 문구를 계약과 맞췄다.
4. `PracticeGoal.nextAction === CoachingAction.instruction`을 테스트한다.
5. `PracticeGoal.successCondition === CoachingAction.successCondition`을 테스트한다.
6. focused Action의 `goalId`, `sourceFullRunId`, `criterionRef`, 실제 `observationIds` 연결을 Fixture로 검증한다.
7. `sentence`, `slide`, `slide-range`, `opening`, `closing`, `full-run-only`, 빈 `topActions` Fixture를 제공한다.
8. `slide-range`가 Snapshot 순서에서 유효하지 않으면 문제를 유지하고 full-run-only로 강등한다.
9. Brief Observation 계약이 오기 전에는 must-cover·opening·closing을 가짜 실패로 만들지 않는다.

## 이창원 수정 목록

1. Python endpoint가 최종 통과 여부를 임시 규칙으로 결정하지 않도록 한다.
2. focused 측정값을 검증된 Observation으로 변환하고 Node Worker의 공통 Criterion 평가기를 사용한다.
3. filler와 pause를 각각 원본 metric 단위로 측정한다.
4. semantic은 Transcript 길이가 아니라 검증된 semantic 상태를 사용한다.
5. 현재 Deck과 원본 run Snapshot을 비교해 stale Target을 차단한다.
6. `sentence`, `slide-range`, `opening`, `closing`의 실제 화면 범위와 slide timeline을 구현한다.
7. non-slide Target에 `slide-unknown`을 전송하지 않는다.
8. 요청 Goal Set의 `is_current` 요구 여부를 확정하고 SQL과 오류 문구를 일치시킨다.
9. Target과 Criterion이 없거나 맞지 않으면 `unmeasured` 또는 `SOURCE_INCOMPATIBLE`로 처리한다.
10. 집중 연습 통과를 Goal의 공식 해결로 직접 저장하지 않는다.

## 공동 확인이 필요한 사항

### sentence Target 원천

계약은 공통 문장 분리·정규화 함수를 요구하지만 현재 해당 함수가 없다. 또한 원본 발표 Snapshot에 `speakerNotes`가 없어 `textSnapshotHash`를 나중에 재검증할 수 없다.

다음 중 하나를 계약 담당자와 정해야 한다.

1. Focus Profile 생성 시 Deck 대본을 검증하고 확정 Target만 저장한 뒤, 집중 연습 시작 시 현재 Deck 대본 Hash와 비교한다.
2. 민감한 원문 없이 검증 가능한 sentence identity를 Snapshot에 추가하는 별도 공통 계약을 만든다.

공통 Schema 변경이 필요하면 이 브랜치에서 임의로 추가하지 않고 별도 계약 PR로 처리한다.

### CoachingAction Projector

`deriveCoachingActions()`는 순수 도출기다. 실제 `CoachingReportView.topActions` 저장·조립 위치와 호출 시점은 임재환 Projector와 합의해야 한다.

### Brief Criterion Observation

현재 full-run report에는 Brief must-cover·opening·closing Criterion에 대응하는 검증된 Observation이 없다. 측정 담당 계약이 추가될 때까지 `NO_MEASUREMENT`를 유지한다.

## 전달 완료 체크리스트

### 최영빈

- [x] Criterion과 Observation을 공통 평가기로 판정한다.
- [x] measured failed·partial만 Top 3 후보로 만든다.
- [x] 가짜 fallback 문제를 만들지 않는다.
- [x] Top 3 순서가 결정적이다.
- [x] compatible full run만 반복 이력에 사용한다.
- [x] 새 `scopeId` 생성식을 적용한다.
- [x] 계약의 성공 조건 문구를 적용한다.
- [x] 다섯 Target과 full-run-only Action Fixture를 제공한다.
- [ ] sentence identity 검증 정책을 확정한다.
- [x] Goal 도출 시 slide-range 순서를 검증하고 안전하게 강등한다.

### 이창원

- [x] 세션이 source run·Goal Set·Goal ID를 보존한다.
- [x] 저장 Goal과 요청 Target이 같은지 확인한다.
- [x] 인접한 두 pass만 안정화로 인정한다.
- [x] 집중 연습을 full-run 반복 이력과 분리한다.
- [ ] 임시 Python 판정을 제거하고 공통 평가기를 사용한다.
- [ ] 자료 변경 stale 판정을 구현한다.
- [ ] 다섯 Target의 표시·녹음 timeline을 지원한다.
- [ ] sentence identity 검증 정책을 적용한다.
- [ ] Goal Set current/final 정책과 SQL을 일치시킨다.

### 통합

- [ ] `CriterionResult + ReportObservation + PracticeGoal + CoachingAction + topActions` Fixture가 shared Schema를 통과한다.
- [ ] focused CTA가 실제 PracticeGoal을 가리킨다.
- [ ] 같은 Criterion으로 full run과 focused attempt를 평가했을 때 결과가 일치한다.
- [ ] Deck 변경 후 오래된 Target이 자동 실행되지 않는다.
- [ ] transcript 원문, raw audio, signed URL이 공통 결과와 로그에 남지 않는다.

## 관련 파일

최영빈:

- `apps/worker/src/coaching/criterion-evaluator.ts`
- `apps/worker/src/coaching/coaching-action-derivation.ts`
- `apps/worker/src/coaching/criterion-comparability.ts`
- `apps/worker/src/practice-goal-derivation.ts`
- `apps/api/src/practice-goals/evaluation-plan.ts`
- `apps/api/src/practice-goals/practice-goals.service.ts`

이창원:

- `apps/api/src/focused-practice/focused-practice.service.ts`
- `apps/worker/src/focused-practice-analysis.processor.ts`
- `services/python-worker/app/focused_practice.py`
- `apps/web/src/features/coaching/FocusedPracticePage.tsx`
- `apps/web/src/features/coaching/focusedPracticeApi.ts`
