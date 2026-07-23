# Implementation Plan: STT 결과 구간 기반 키워드 Occurrence 트리거

**상태:** 구현 전 검토

**작성일:** 2026-07-22

**대상:** `apps/web`의 리허설·발표자 모드 Live STT 애니메이션 트리거

## 1. 문제와 확인 근거

현재 `keyword-occurrence` 트리거는 다음 두 조건을 함께 사용한다.

1. 가장 최근 STT 결과에 키워드(동의어·약어 포함)가 있어야 한다.
2. 누적 대본에서 계산한 **현재 진행 위치 한 점**이 선택 occurrence의 위치 창 안에 있어야 한다.

두 번째 조건은 반복 단어 오작동을 막기 위한 의도된 안전장치다. 그러나 긴 한 문장이 한 번의 STT 결과로 들어오면 진행 위치는 문장 끝으로 계산된다. 이때 문장 첫 단어에 연결된 occurrence는 실제로 발화됐어도 이미 허용 창을 지나 매칭되지 않는다.

실제 디버그 재현에서 다음을 확인했다.

- action 연결: `kwo_slide_1_kw_1_0_3 → anim_1`
- STT 상태: `listening`, confidence `1.00`
- 선택 occurrence 위치: 대본 시작 `0~3`
- 계산된 진행 위치: `197`
- 매칭·소비·실행 animation: 모두 없음

따라서 이 변경은 confidence 완화나 action 저장 수정이 아니라, **이번 STT 결과가 대본에서 차지하는 구간**으로 occurrence를 판정하는 수정이다.

## 2. 목표와 비목표

### 목표

- 긴 interim/final STT 결과에 포함된 문장 첫·중간·끝 키워드 occurrence가 정확히 트리거된다.
- 동일 키워드가 반복돼도 사용자가 선택한 대본 위치의 occurrence만 실행된다.
- 리허설과 발표자 모드가 같은 matcher와 같은 판정 규칙을 사용한다.
- 현재의 confidence, exactly-once 소비, 클릭 대체 진행 정책을 유지한다.

### 비목표

- 키워드, animation, action의 Deck JSON schema를 변경하지 않는다.
- `confidence >= 0.7` 안전장치를 낮추거나 제거하지 않는다.
- 일반 `keyword` action을 occurrence action의 fallback으로 되살리지 않는다.
- STT 원문이나 발표 메모를 서버에 저장·로그하지 않는다.
- 발표 애니메이션의 순서·렌더러·수동 클릭 UX를 재설계하지 않는다.

## 3. 확정 설계

### 3.1 진행 위치 한 점 대신 STT 결과 구간을 전달한다

`matchKeywordOccurrenceTriggers`의 입력을 확장한다.

```ts
type ScriptProgressSpan = {
  beforeOffset: number;
  afterOffset: number;
};
```

- `beforeOffset`: 이번 STT revision을 반영하기 전 대본 진행 위치
- `afterOffset`: 이번 STT revision을 반영한 뒤 대본 진행 위치
- matcher는 단일 `currentCharOffset` 대신 span과 가장 최근 STT 결과의 키워드 hit를 함께 사용한다.

단순히 `afterChars`를 크게 늘리는 방식은 사용하지 않는다. 반복 키워드가 있을 때 앞 occurrence를 잘못 실행하는 회귀가 발생하기 때문이다.

### 3.2 최신 결과의 키워드 위치를 대본 구간에 정렬한다

새 순수 helper는 다음을 수행한다.

1. `beforeOffset`부터 `afterOffset`까지의 speaker note 영역을 후보로 만든다.
2. `latestTranscript`에서 키워드·동의어·약어의 실제 hit 위치를 찾는다.
3. 후보 영역의 문맥과 최신 결과를 정렬해 hit를 절대 speaker-note 위치로 변환한다.
4. 선택된 occurrence와 hit가 같은 위치 창에 있을 때만 match를 반환한다.

정렬이 모호하면 매칭하지 않는다. false positive가 missed trigger보다 위험하다는 기존 정책을 유지한다.

### 3.3 같은 결과에 여러 occurrence가 들어온 경우의 정책을 명시한다

하나의 STT final에 여러 선택 occurrence가 포함될 수 있다. matcher는 대본 순서대로 후보를 반환하되, 소비자별 실행 정책은 다음을 지킨다.

- 이미 소비된 occurrence는 항상 제외한다.
- 발표자 모드는 현재 animation step보다 앞선 animation을 되돌려 실행하지 않는다.
- 현재 step 이후의 여러 occurrence가 같은 final에 포함되면, 해당 결과에서 실제로 정렬된 occurrence만 순서대로 실행한다. renderer는 기존 step 순서를 유지한다.
- 순서를 확정할 수 없는 후보는 실행하지 않고 클릭 대체 진행을 계속 제공한다.

이 정책은 현재 `resolveTriggeredActionPlaybackUpdate`의 step 전진 방식과 호환돼야 한다. 필요한 경우 matcher와 playback helper 사이에 정렬·필터 전용 순수 helper를 둔다.

### 3.4 STT revision 경계를 보존한다

partial은 같은 발화의 이전 결과를 대체할 수 있으므로, 단순 문자열 append로 span을 만들면 안 된다.

- `utteranceId`와 `resultRevision`을 기준으로 최신 revision을 추적한다.
- final로 확정된 텍스트와 진행 중 utterance의 최신 revision을 분리한다.
- 새 revision이 들어올 때만 이전 revision의 진행 위치를 `beforeOffset`으로 사용한다.
- stale revision과 이미 소비한 occurrence는 무시한다.

## 4. 변경 범위

| 영역 | 변경 | 영향 |
| --- | --- | --- |
| `keywordOccurrenceRuntime.ts` | span 정렬·후보 선택 순수 로직 추가 | 리허설·발표자 공용, 핵심 변경 |
| `keywordOccurrenceRuntime.test.ts` | 긴 결과·반복 단어·revision 회귀 fixture 추가 | 핵심 회귀 방지 |
| `RehearsalWorkspace.tsx` | Live STT event의 before/after span 전달, 실행 순서 적용 | 리허설 자동 cue |
| `usePresentationSpeech.ts` | final/interim revision별 대본 스냅샷과 span 제공 | 발표자 Live STT |
| `PresentationWorkspace.tsx` | span 기반 matcher 호출·진단 정보 표시 | 발표자 자동 재생 |
| `triggeredActionPlayback.ts` | 필요 시 step 순서 필터 helper 추가 | action 재생 정합성 |
| 관련 테스트 | E2E/단위/컴포넌트 검증 | 리그레션 방지 |

변경하지 않는 영역:

- `packages/shared` schema와 `docs/contracts.md`
- API, Worker, DB, WebSocket 계약
- animation editor와 Deck patch 생성
- Slide renderer 및 수동 클릭 control

## 5. 작업 순서

### Task 1. 현재 matcher를 span-aware 순수 API로 분리

`keywordOccurrenceRuntime.ts`에 현재 위치 계산과 hit 위치 정렬을 분리한다.

완료 조건:

- 기존 `estimateScriptProgressOffset`은 대본 진행 계산 용도로 유지한다.
- 새 helper는 before/after offset, 최신 STT 결과, target occurrence를 받고 결정적 결과를 반환한다.
- confidence 미달, target 없음, 소비됨, 정렬 모호함은 모두 빈 결과를 반환한다.
- 반환 값에는 진단용 `matchedScriptOffset`과 기존 호환용 `currentCharOffset`을 포함한다.

### Task 2. revision-aware transcript span 상태를 만든다

리허설과 발표자에 동일한 작은 상태 helper를 둔다. 가능하면 `speech` 하위의 순수 모듈로 추출해 두 화면이 다른 방식으로 transcript를 누적하지 않게 한다.

완료 조건:

- partial revision 갱신은 같은 utterance의 이전 텍스트를 대체한다.
- final 확정 시에만 committed transcript에 합쳐진다.
- matcher 호출마다 before/after progress span을 얻을 수 있다.
- stale result와 duplicate revision은 span·트리거를 바꾸지 않는다.

### Task 3. 리허설 경로에 적용

`RehearsalWorkspace`에서 event 단위 span을 만들어 matcher에 전달한다.

완료 조건:

- 긴 final에 문장 첫 단어 occurrence가 있으면 cue/action이 실행된다.
- 반복 단어의 앞·중간·뒤 occurrence가 각각 선택 위치에 맞게 구분된다.
- 기존 `liveKeywordOccurrenceStateRef` exactly-once 소비가 유지된다.

### Task 4. 발표자 경로에 적용

`usePresentationSpeech`가 latest result와 revision span을 노출하고, `PresentationWorkspace`가 이를 사용한다.

완료 조건:

- 발표자 모드에서 긴 interim과 final 모두 동일 occurrence를 정확히 판정한다.
- 클릭 대체 진행으로 소비한 occurrence는 이후 발화에서 재생되지 않는다.
- Live STT와 수동 클릭이 같은 `SlidePlaybackState`/`presenterStepIndex` 체인을 갱신한다.

### Task 5. 다중 후보와 step 순서를 정합화

같은 STT result에 여러 target occurrence가 들어온 경우를 `triggeredActionPlayback` 순수 helper로 검증한다.

완료 조건:

- action은 대본·animation step 순서로만 실행된다.
- 이미 재생된 animation은 다시 실행하지 않는다.
- action-free 일반 클릭 animation의 기존 순서는 변하지 않는다.
- 일괄 실행이 순서를 건너뛰거나 마지막 step 이후에 부당하게 다음 슬라이드로 이동하지 않는다.

### Task 6. 임시 디버그 패널로 브라우저 검증 후 제거 또는 개발 전용화

현재 `?animationDebug=1` 패널은 이 수정의 로컬 재현 검증에만 사용한다.

완료 조건:

- 다음 필드를 확인할 수 있다: STT text/confidence, before/after offset, 정렬된 hit 위치, match, 소비 occurrence, 실행 animation, step.
- 실제 사용자 발표 메모와 transcript를 지속 저장하거나 서버 로그로 전송하지 않는다.
- 수정 검증 뒤 패널은 제거하거나 개발 전용 feature gate로 축소한다.

## 6. 테스트 계획

### 순수 matcher

- 문장 시작 occurrence: 긴 final 결과가 문장 전체를 포함해도 trigger된다.
- 문장 중간/끝 occurrence: 각 위치에서 trigger된다.
- 같은 키워드가 세 번 있어도 지정한 occurrence만 trigger된다.
- 같은 final에 여러 target occurrence가 있을 때 대본 순서대로 결정된다.
- confidence `0.69`는 trigger되지 않고 `0.70`은 이후의 모든 조건을 만족할 때만 trigger된다.
- 동의어·약어 hit와 원문 occurrence의 문맥 정렬이 모호하면 trigger되지 않는다.
- 이미 소비한 occurrence와 stale/duplicate revision은 trigger되지 않는다.

### playback

- occurrence 발화 → animation 1회 재생 → step 전진.
- 클릭 대체 진행 → occurrence 소비 → 같은 발화 무시.
- 발화 후 클릭 → 다음 미재생 step 진행.
- 한 STT 결과의 다중 후보가 animation step을 역행·중복 실행하지 않는다.

### 통합 및 브라우저

- 리허설과 발표자 모드에서 같은 fixture sequence가 같은 action/step 결과를 만든다.
- 실제 브라우저에서 대본 첫 단어에 연결한 fade-in이 긴 문장 발화 후 나타난다.
- 같은 키워드가 반복된 대본에서 각 위치를 한 번씩 발화해 선택한 animation만 나타난다.
- 마이크 없이 클릭 진행, 마이크 사용 중 occurrence 진행, 전환 후 다음 슬라이드 이동을 함께 확인한다.

권장 명령:

```bash
pnpm --filter @orbit/web exec vitest run \
  src/features/rehearsal/speech/keywordOccurrenceRuntime.test.ts \
  src/features/rehearsal/playback/triggeredActionPlayback.test.ts \
  src/features/rehearsal/RehearsalWorkspace.test.tsx \
  src/features/presentation/PresentationWorkspace.test.tsx
pnpm --filter @orbit/web typecheck
pnpm --filter @orbit/web build
```

## 7. 위험과 완화책

| 위험 | 원인 | 완화책 |
| --- | --- | --- |
| 반복 단어 오작동 | 넓은 위치 창 또는 전체 결과 단순 포함 검사 | hit 위치 정렬, 모호하면 미실행, exact-once 유지 |
| partial/final 중복 재생 | 같은 utterance의 revision이 반복 전달됨 | `utteranceId`/`resultRevision`, consumed occurrence 검증 |
| 다중 animation 순서 점프 | 한 final에서 여러 action을 무정렬 실행 | 대본·step 순서 필터와 playback 순수 테스트 |
| 리허설/발표자 동작 차이 | 두 화면의 transcript 누적 방식이 다름 | 공용 span helper, 같은 fixture를 두 경로에 적용 |
| 개인정보 노출 | debug 패널 또는 로그에 speaker note/STT 원문 노출 | URL gate, 브라우저 로컬 한정, 서버/지속 로그 금지 |

## 8. 완료 기준

- 긴 STT 결과의 첫 단어 occurrence 재현이 자동 재생으로 통과한다.
- confidence, 정확한 위치, 1회 소비, animation step 순서라는 네 안전 불변식이 테스트로 증명된다.
- 리허설과 발표자 모드가 동일 matcher를 사용하고, 같은 fixture에서 같은 occurrence/action 결과를 낸다.
- Deck/API/shared contract 변경 없이 web 범위에서 완료된다.
- 디버그 패널로 실제 브라우저 재현을 확인한 뒤, 일반 사용자 화면에 남지 않도록 정리한다.
