# 현재 발표 Step 기반 키워드 Occurrence Resolver

**상태:** 구현 완료 (로컬 단위·통합 테스트 및 web build 검증)

## 배경

현재 `fix/animation-runtime-baseline`에서 한 장표의 첫 번째 키워드 애니메이션은
재생되지만, 뒤의 키워드는 STT 인식과 자동 스크롤이 정상이어도 재생되지 않을 수 있다.

현재 흐름은 다음과 같다.

```text
STT 결과
  → matchKeywordOccurrenceTriggers
  → resolveQueuedKeywordOccurrencePlayback
  → animation 실행
```

문제는 첫 단계다. `matchKeywordOccurrenceTriggers`는 누적 전사에서 계산한 대본 offset과
`±24` 문자 창을 사용한다. 자동 스크롤은 별도 `SpeechTracker` 상태를 사용하므로 스크롤이
정상이어도 occurrence matcher가 같은 위치라고 보장하지 않는다. STT가 문장 전체를 final로
반환하면 offset이 키워드보다 앞서가거나 뒤로 점프해 두 번째·세 번째 occurrence가 탈락한다.

단순히 위치 창을 넓히거나 가장 가까운 미소비 occurrence를 고르는 방식은 사용하지 않는다.
반복 단어와 미래 키워드를 잘못 실행하는 회귀가 생긴다.

## 목표

- 키워드 애니메이션 판정에서 자동 스크롤 위치를 제거한다.
- 현재 발표 순서가 기대하는 `keyword-occurrence`만 STT 새 전사 구간과 비교한다.
- 한 장표의 A → B → C 키워드 효과가 각각의 발화에서 한 번씩, 순서대로 재생된다.
- 동일 occurrence의 여러 effect는 같은 step으로 함께 재생한다.
- 미래 키워드 선발화는 실행하지 않고 pending으로 보관하며, 클릭 대체 진행을 유지한다.
- 실전 발표, 전체 리허설, 부분 리허설이 같은 resolver와 재생 규칙을 사용한다.

## 비목표

- Deck JSON, API, WebSocket, DB, STT 엔진 계약을 변경하지 않는다.
- 자동 스크롤 또는 `SpeechTracker`의 UX를 재설계하지 않는다.
- generic `keyword` action을 `keyword-occurrence`의 fallback으로 사용하지 않는다.
- confidence `0.70` 기준, exactly-once 소비, 수동 클릭 fallback을 완화하지 않는다.

## 설계

### 1. 발표 순서를 단일 진실 공급원으로 사용

`buildSlidePresentationSequence(slide)`와 `createSlideshowAnimationPlan`으로 현재
`presenterStepIndex`의 step을 구한다.

- 현재 step이 수동 효과면 STT는 어떤 animation도 재생하지 않는다.
- 현재 step이 `keyword-occurrence`면 그 step에 연결된 occurrence ID만 자동 재생 후보가 된다.
- 같은 occurrence에 여러 `play-animation` action이 있으면 하나의 step으로 실행한다.
- 서로 다른 occurrence는 상대 시작 방식(`with-previous`, `after-previous`)이 있어도 별도
  step이어야 한다. 기존 `inferActionTriggerBoundaryModes`의 trigger boundary 보정은 유지한다.

새 순수 모델:

```ts
type ExpectedKeywordOccurrenceStep = {
  animationIds: string[];
  occurrenceIds: string[];
  stepIndex: number;
};
```

`getExpectedKeywordOccurrenceStep`은 current step의 occurrence action과 animation ID를
교차 검증한다. action 없는 effect, legacy `keyword`, activity slide는 `null`을 반환한다.

### 2. STT revision에서 새 전사 구간을 결정적으로 추출

`speech/transcriptRevisionState.ts` 순수 helper를 추가한다.

- `utteranceId`와 `resultRevision`이 있으면 같은 utterance의 최신 partial/final만 유지한다.
- final은 해당 utterance의 partial을 대체하고 committed transcript에 한 번만 합친다.
- 두 값이 없는 엔진은 prefix/suffix overlap 기반의 보수적 중복 제거 fallback을 사용한다.
- 결과는 `previousTranscript`, `currentTranscript`, `newSegment`, `isStale`를 제공한다.
- `newSegment`은 같은 revision을 두 번 재생시키지 않는 용도이며, 자동 스크롤 상태와 독립이다.

### 3. 현재 step occurrence만 새 전사 구간에 매칭

`matchExpectedKeywordOccurrenceStep` 순수 helper를 추가한다.

입력:

```ts
{
  expectedStep,
  slide,
  newSegment,
  confidence,
  consumedOccurrenceIds
}
```

판정 순서:

1. confidence가 `0.70` 미만이거나 revision이 stale이면 차단한다.
2. expected step의 occurrence가 이미 소비됐으면 차단한다.
3. expected occurrence의 canonical text·동의어·약어가 `newSegment`에 실제 hit했는지 검사한다.
4. hit가 하나면 해당 occurrence만 match한다.
5. 같은 step 안에서 여러 occurrence가 허용되는 구조가 생기거나, 동의어 hit가 둘 이상으로
   모호하면 자동 실행하지 않고 `ambiguous` 진단을 반환한다.

대본 offset은 matcher의 입력이 아니다. 디버그와 자동 스크롤 표시용으로만 유지한다.

### 4. 미래 occurrence는 별도 pending 상태로 보관

새 전사 구간에서 현재 step 이외의 keyword를 발견하더라도 자동 실행하지 않는다.

- `detectFutureKeywordOccurrences`는 발표 sequence의 현재 step 이후 occurrence만 탐색한다.
- 탐색 결과는 `pendingOccurrenceIds`에 추가하되 소비하지 않는다.
- pending 상태는 occurrence ID와 action을 분리해서 보관하지 않는다. 클릭 또는 step 전진 시
  `resolveKeywordOccurrenceTriggeredActions(slide, keywordId, occurrenceId)`로 action을
  항상 다시 해석한다.
- 클릭은 현재 step만 진행한다. 현재 step이 pending occurrence의 step이면 그 step을 실행하고
  해당 occurrence를 소비한다.

이 규칙으로 A 이전에 B가 발화된 경우에도 A를 건너뛰지 않으며, B action mapping이 사라지는
문제를 막는다.

### 5. 공통 재생 적용 함수로 통합

`triggeredActionPlayback.ts`에 아래 경계를 둔다.

```ts
resolveCurrentStepKeywordPlayback(...)
resolveManualStepPlayback(...)
resolvePendingOccurrenceForCurrentStep(...)
```

각 함수는 동일한 결과를 반환한다.

```ts
{
  playbackState,
  presenterStepIndex,
  pendingOccurrenceIds,
  consumedOccurrenceIds,
  shouldAdvanceSlide
}
```

`PresentationWorkspace`, `RehearsalWorkspace`, `EditorShell`은 이 결과만 적용한다. 각 화면이
독자적으로 action map, pending 소비, step 증가를 구현하지 않는다.

### 6. 진단과 승인 UX

`?animationDebug=1`에서만 공통 진단을 표시한다.

- STT 원문, final 여부, utterance ID/revision, confidence
- 새 전사 구간
- 현재 step과 기대 occurrence
- matched/pending/consumed occurrence
- 실행 animation ID와 blocker

낮은 confidence 또는 모호한 hit는 자동 실행하지 않는다. 현재 step과 일치하는 후보가 있는
경우에만 발표자 인라인 카드의 `실행` 버튼을 제공한다. 거절·닫기는 occurrence를 소비하지 않으며
클릭 대체 진행은 계속 가능하다. 진단 원문은 브라우저 메모리에서만 표시하고 서버 로그나 저장
데이터에 추가하지 않는다.

## 구현 순서

1. `packages/editor-core` 또는 `apps/web` 공용 순수 helper의 소유 경계를 결정하고,
   current step의 expected occurrence 모델 테스트를 작성한다.
2. `transcriptRevisionState`와 revision/fallback 단위 테스트를 작성한다.
3. `keywordOccurrenceRuntime`의 기존 offset matcher는 자동 스크롤·legacy 호환 전용으로
   유지하고, animation runtime은 새 expected-step matcher로 전환한다.
4. `triggeredActionPlayback`에서 pending action 재해석과 수동/음성 공통 결과를 구현한다.
5. 실전 발표 → 전체 리허설 → 부분 리허설 순으로 같은 runtime adapter를 연결한다.
6. 공통 debug panel 및 인라인 승인 카드를 연결한다.
7. 단위·통합·브라우저 검증을 통과한 뒤 기존 분산 상태 갱신 코드를 제거한다.

## 테스트 계획

### 순수 테스트

- A → B → C keyword occurrence: 각 새 STT event에서 현재 step만 match한다.
- A/B/C가 한 final에 함께 있어도 첫 event에서는 A만 실행하고 B/C는 pending 처리한다.
- 수동 A → keyword B: B가 먼저 발화되면 pending, 첫 클릭 A, 다음 클릭 B를 실행한다.
- 동일 keyword가 대본에 반복돼도 현재 step occurrence만 실행한다.
- 같은 occurrence의 여러 animation은 한 step으로 함께 실행한다.
- `with-previous`/`after-previous` 관계지만 trigger가 다른 두 effect는 별도 step이다.
- partial revision 교체, duplicate final, stale revision, revision 없는 fallback을 검증한다.
- confidence 미달·모호 hit는 자동 실행하지 않고 approval candidate만 반환한다.

### 모드 통합 테스트

- 실전 발표·전체 리허설·부분 리허설이 같은 fixture에서 같은
  `playedAnimationIds`, `presenterStepIndex`, consumed/pending occurrence를 만든다.
- 클릭, 다음 버튼, 키보드, 무대 클릭이 같은 현재-step resolver를 사용한다.
- timeline 복구 뒤에는 복원된 step 이전 occurrence가 소비되고 이후 occurrence만 재생된다.
- activity 및 activity-results 장표가 운영 세션 상태를 바꾸지 않는다.

### 브라우저 검증

- 실제 한 장표에 키워드 효과 3개를 연결하고 A → B → C를 발화한다.
- 자동 스크롤이 앞서가거나 문장 단위 final이 와도 각 효과가 한 번씩 재생되는지 확인한다.
- `animationDebug=1`에서 expected step, new segment, pending/consumed 상태를 확인한다.
- 테스트 데이터와 animation을 삭제하고 원래 deck 상태를 복원한다.

## 완료 기준

- 자동 스크롤 위치와 관계없이 현재 step의 keyword occurrence가 STT 새 전사 구간에서
  감지되면 정확히 한 번 재생된다.
- 뒤의 키워드 효과가 첫 효과 이후에도 정상 실행된다.
- 미래 키워드는 순서를 건너뛰지 않고 pending/클릭 대체 진행을 따른다.
- 실전 발표·전체 리허설·부분 리허설의 재생 상태 전이가 동일하다.
- API, shared schema, DB, WebSocket 계약 변경 없이 검증 명령과 브라우저 시나리오를 통과한다.
