# Spec: Keyword Occurrence Triggering

## Status

Proposed for implementation.

## User Decisions

- 새 음성 트리거는 발표 메모에서 선택한 keyword occurrence를 항상 기본값으로 사용한다.
- 기존 `kind: "keyword"` trigger는 자동 추정 변환을 지원한다.
- 발표자가 target occurrence 문장을 건너뛴 경우에도, 현재 script progress가 허용 window 안이면 근처 matching으로 trigger할 수 있다.
- occurrence trigger 실행을 위한 초기 script progress confidence threshold는 `0.7`로 둔다.
- occurrence 주변 context는 Deck JSON에 저장하지 않고 런타임에서 계산한다.

## Objective

키워드 기반 애니메이션과 발표 진행 트리거를 `keywordId` 단위가 아니라 발표 메모 안의 특정 출현 위치 단위로 연결한다.

현재 `AI` 같은 짧고 반복되는 단어를 키워드 트리거로 쓰면, 사용자가 마지막 문장의 `AI`에 애니메이션을 연결해도 리허설 또는 발표 중간의 다른 `AI`에서 먼저 반응할 수 있다. 이 기능의 성공 기준은 에디터에서 선택한 바로 그 키워드 출현 지점에 도달했을 때만 트리거가 실행되는 것이다.

## Problem

현재 Deck action trigger는 `keywordId`만 참조한다.

```json
{
  "trigger": {
    "kind": "keyword",
    "keywordId": "kw_ai"
  },
  "effect": {
    "kind": "play-animation",
    "animationId": "anim_1"
  }
}
```

이 구조는 다음을 구분하지 못한다.

- 첫 번째 문장의 `AI`
- 중간 문장의 `AI`
- 마지막 문장의 `AI`

따라서 STT matcher나 발표 진행 tracker가 `kw_ai`를 hit로 판단하는 순간, 이 keyword에 연결된 action이 의도보다 일찍 실행될 수 있다.

## Non-Goals

- 일반 dictation 정확도 개선
- ASR 모델 fine-tuning
- raw audio 또는 transcript 서버 저장
- audience API에 speaker notes, script, raw transcript 노출
- keyword term 자체를 여러 개로 복제해서 위치를 흉내내는 방식

## Definitions

### Keyword

슬라이드 안에서 재사용되는 단어 또는 표현의 정의다.

```ts
type Keyword = {
  keywordId: string;
  text: string;
  synonyms: string[];
  abbreviations: string[];
  required: boolean;
};
```

### Keyword Occurrence

발표 메모 안에서 keyword term이 실제로 등장한 특정 위치다.

```ts
type KeywordOccurrence = {
  occurrenceId: string;
  slideId: string;
  keywordId: string;
  text: string;
  start: number;
  end: number;
  occurrenceIndex: number;
  contextBefore?: string;
  contextAfter?: string;
};
```

### Occurrence Trigger

특정 keyword occurrence에 도달했을 때만 실행되는 slide action trigger다.

```ts
type KeywordOccurrenceSlideActionTrigger = {
  kind: "keyword-occurrence";
  keywordId: string;
  occurrenceId: string;
};
```

## Contract Changes

### Shared Schema

`packages/shared/src/deck/slide-action.schema.ts`에 trigger kind를 추가한다.

```ts
export const keywordOccurrenceSlideActionTriggerSchema = z.object({
  kind: z.literal("keyword-occurrence"),
  keywordId: deckKeywordIdSchema,
  occurrenceId: deckKeywordOccurrenceIdSchema
});
```

`deck.schema.ts`에는 occurrence id schema를 추가한다.

```ts
export const deckKeywordOccurrenceIdSchema = z
  .string()
  .regex(/^kwo_[A-Za-z0-9_-]+$/);
```

권장 occurrence id 형식:

```text
kwo_<slideId>_<keywordId>_<start>_<end>
```

주의: `slideId`와 `keywordId`에 `_`가 포함될 수 있으므로 id를 다시 parsing하는 로직에 의존하지 않는다. `occurrenceId`는 opaque string으로 취급한다.

### Slide Action

기존 keyword trigger는 유지한다.

```ts
type SlideActionTrigger =
  | { kind: "cue"; cue: string }
  | { kind: "keyword"; keywordId: string }
  | {
      kind: "keyword-occurrence";
      keywordId: string;
      occurrenceId: string;
    };
```

기존 `kind: "keyword"`는 backward compatibility 용도로 남긴다. 새 에디터 UI에서 발표 메모의 단어를 클릭해 생성하는 음성 트리거는 항상 `keyword-occurrence`를 사용한다.

### Validation

`slideSchema.superRefine`에서 다음을 검증한다.

- `keyword-occurrence.keywordId`는 같은 slide의 `keywords`에 존재해야 한다.
- `keyword-occurrence.occurrenceId`는 현재 `speakerNotes`와 `keywords`에서 다시 계산한 occurrence 목록에 존재해야 한다.
- occurrence가 존재하지만 저장된 `keywordId`와 계산된 occurrence의 `keywordId`가 다르면 invalid다.

발표 메모가 수정되어 occurrence 위치가 사라진 경우, 해당 action은 dangling trigger가 된다. MVP에서는 schema validation에서 거부하고, 에디터 저장 전에 사용자에게 재연결을 요구한다.

## Occurrence Derivation

공통 helper를 `packages/editor-core`에 둔다.

```ts
export function deriveKeywordOccurrences(
  slide: Pick<Slide, "slideId" | "speakerNotes" | "keywords">
): KeywordOccurrence[];
```

규칙:

- `speakerNotes` 전체 문자열 기준 UTF-16 index로 `start`, `end`를 계산한다.
- `keyword.text`, `synonyms`, `abbreviations`를 모두 후보 term으로 사용한다.
- matching은 기존 keyword highlight와 같은 normalization을 사용한다.
- 겹치는 match는 더 긴 term을 우선한다.
- 같은 길이로 겹치면 `keywords` 배열 순서를 우선한다.
- `occurrenceIndex`는 같은 `keywordId` 안에서 0부터 증가한다.
- `contextBefore`, `contextAfter`는 UI preview나 diagnostics가 필요할 때 occurrence 주변 20자 내외로 런타임에서 계산한다.
- Deck JSON에는 occurrence context를 저장하지 않는다.

예시:

```ts
deriveKeywordOccurrences({
  slideId: "slide_1",
  speakerNotes: "AI 흐름을 설명하고 마지막에 AI를 강조합니다.",
  keywords: [{ keywordId: "kw_ai", text: "AI", synonyms: [], abbreviations: [] }]
});
```

결과:

```json
[
  {
    "occurrenceId": "kwo_slide_1_kw_ai_0_2",
    "slideId": "slide_1",
    "keywordId": "kw_ai",
    "text": "AI",
    "start": 0,
    "end": 2,
    "occurrenceIndex": 0,
    "contextBefore": "",
    "contextAfter": " 흐름을 설명하고 마지막"
  },
  {
    "occurrenceId": "kwo_slide_1_kw_ai_20_22",
    "slideId": "slide_1",
    "keywordId": "kw_ai",
    "text": "AI",
    "start": 20,
    "end": 22,
    "occurrenceIndex": 1,
    "contextBefore": "름을 설명하고 마지막에 ",
    "contextAfter": "를 강조합니다."
  }
]
```

## Editor Behavior

### Selection Model

에디터 선택 상태는 keyword entity와 occurrence selection을 분리한다.

```ts
type SelectedKeyword = {
  keywordId: string;
  occurrenceId: string | null;
};
```

동작:

- 발표 메모 안의 keyword mark 클릭: `{ keywordId, occurrenceId }` 선택
- keyword chip 클릭: `{ keywordId, occurrenceId: null }` 선택
- 텍스트 highlight selected class: `occurrenceId`가 정확히 같은 mark에만 적용
- keyword detail panel: `keywordId` 기준으로 표시
- 새 애니메이션 생성: `occurrenceId`가 있으면 `keyword-occurrence` trigger 생성
- 새 음성 트리거 생성 시 `occurrenceId`가 없으면 저장하지 않고 사용자에게 발표 메모 위치 선택을 요구

### UI Copy

사용자가 keyword chip만 선택하고 음성 트리거 애니메이션을 만들려 할 때는 아래처럼 명확히 안내한다.

```text
반복되는 단어일 수 있습니다. 발표 메모에서 실제로 트리거할 단어 위치를 선택하세요.
```

### Speaker Notes Edit

발표 메모가 수정되면 occurrence id가 바뀔 수 있다.

저장 전 처리:

1. 기존 action의 `keyword-occurrence` trigger를 다시 계산한 occurrence 목록과 비교한다.
2. 사라진 occurrence가 있으면 action을 dangling state로 표시한다.
3. 사용자가 해당 action을 삭제하거나 새 occurrence에 재연결하기 전까지 저장 또는 발표 시작을 막는다.

MVP에서는 자동 재연결을 하지 않는다. 자동 재연결은 context similarity가 필요하고 잘못 연결될 위험이 있다.

## Rehearsal And Presenter Runtime

### Required Runtime State

리허설과 발표자 화면은 slide별 script progress를 추적해야 한다.

```ts
type ScriptProgressState = {
  slideId: string;
  currentCharOffset: number;
  confirmedOccurrenceIds: string[];
};
```

### Matching Policy

STT transcript에서 keyword term이 들렸다는 이유만으로 action을 실행하지 않는다.

`keyword-occurrence` action은 아래 조건을 모두 만족해야 실행된다.

- STT transcript 또는 speech tracker가 해당 keyword term을 감지한다.
- 현재 script progress가 target occurrence 주변 window 안에 있다.
- script progress confidence가 `0.7` 이상이다.
- 같은 occurrence가 이미 trigger되지 않았다.
- target occurrence보다 앞선 required occurrence들이 미해결 상태로 남아 있지 않다.

초기 window 권장값:

```ts
const OCCURRENCE_TRIGGER_WINDOW = {
  beforeChars: 24,
  afterChars: 36
};
```

이 값과 confidence threshold `0.7`은 테스트 fixture와 실제 리허설 로그를 보고 조정한다.

발표자가 target occurrence 문장을 일부 건너뛰거나 축약할 수 있으므로 exact sentence match만 요구하지 않는다. 단, keyword text만으로는 부족하며 script progress가 위 window 안에 들어왔을 때만 근처 matching을 허용한다.

### Script Progress Update

기존 speech matcher가 문장 단위 또는 phrase 단위 진행도를 계산한다면, keyword occurrence 판단은 그 progress 결과를 사용한다.

권장 구현:

1. `speakerNotes`를 sentence 또는 phrase segment로 나눈다.
2. final transcript가 segment와 매칭되면 `currentCharOffset`을 해당 segment 끝으로 이동한다.
3. partial transcript는 progress를 앞당기는 데 쓰지 않고 candidate만 만든다.
4. target occurrence가 `currentCharOffset` 기준 window 안에 들어오고 keyword가 감지되면 trigger한다.

### Repeated Speech Handling

발표자가 같은 문장을 반복할 수 있다.

정책:

- 이미 실행된 occurrence action은 같은 slide session 안에서 다시 실행하지 않는다.
- 사용자가 slide를 되돌리거나 replay를 명시하면 `confirmedOccurrenceIds`를 초기화한다.
- 같은 transcript가 반복되어도 progress가 target occurrence 앞으로 이동하지 않으면 다음 occurrence를 실행하지 않는다.

### Presenter Remote Window

발표자 remote window 또는 audience-facing snapshot에는 `speakerNotes`, raw transcript, occurrence context를 보내지 않는다.

전송 가능한 값:

```ts
type PresenterSnapshot = {
  triggerAnimationIds: string[];
};
```

`triggerAnimationIds`는 이미 실행하기로 결정된 animation id만 포함한다. occurrence id와 script 위치는 presenter controller 내부 상태로만 유지한다.

## Playback API Changes

`packages/editor-core/src/playback/slidePlayback.ts`의 `resolveTriggeredActions` 입력을 확장한다.

```ts
type TriggerInput = {
  cue?: string;
  keywordId?: string;
  occurrenceId?: string;
};
```

Matching:

- `kind: "cue"`: 기존 cue matching 유지
- `kind: "keyword"`: 기존 keyword matching 유지
- `kind: "keyword-occurrence"`: `trigger.keywordId`와 `trigger.occurrenceId`가 모두 일치해야 match

기존 호출부는 `occurrenceId` 없이 계속 동작해야 한다.

## Implementation Plan

### Task 1. Shared Contract 추가

Files:

- `packages/shared/src/deck/id.schema.ts`
- `packages/shared/src/deck/slide-action.schema.ts`
- `packages/shared/src/deck/deck.schema.ts`
- `packages/shared/src/deck/deck.schema.test.ts`
- `docs/contracts.md`

Acceptance:

- `keyword-occurrence` trigger schema가 parse된다.
- missing keyword 또는 missing occurrence를 참조하는 action은 invalid다.
- 기존 `keyword` trigger deck은 계속 valid다.

Verify:

```bash
pnpm --filter @orbit/shared test -- deck.schema.test.ts
pnpm --filter @orbit/shared typecheck
```

### Task 2. Occurrence Derivation Helper

Files:

- `packages/editor-core/src/patches/actionOperations.ts` 또는 새 `packages/editor-core/src/keywords/keywordOccurrences.ts`
- `packages/editor-core/src/index.ts`
- `packages/editor-core/src/**/*.test.ts`

Acceptance:

- 같은 keyword가 여러 번 등장하면 서로 다른 `occurrenceId`를 생성한다.
- synonym, abbreviation match도 원래 `keywordId`로 occurrence를 만든다.
- overlap에서는 더 긴 term이 우선된다.

Verify:

```bash
pnpm --filter @orbit/editor-core test -- keyword
pnpm --filter @orbit/editor-core typecheck
```

### Task 3. Editor Selection And Action Creation

Files:

- `apps/web/src/features/editor/shell/components/KeywordInspector.tsx`
- `apps/web/src/features/editor/shell/EditorShell.tsx`
- `apps/web/src/features/editor/shell/components/animation/**`
- 관련 테스트

Acceptance:

- 발표 메모의 첫 번째 `AI`를 클릭하면 첫 번째 `AI`만 selected 표시된다.
- 마지막 `AI`를 클릭하고 애니메이션을 만들면 action trigger가 `keyword-occurrence`로 저장된다.
- keyword chip만 선택한 상태에서는 occurrence 위치 선택을 요구한다.

Verify:

```bash
pnpm --filter @orbit/web test -- KeywordInspector.test.tsx EditorShell.test.tsx AnimationEditorModal.test.tsx
pnpm --filter @orbit/web typecheck
```

### Task 4. Rehearsal Runtime Matching

Files:

- `apps/web/src/features/rehearsal/speech/*`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
- `apps/web/src/features/rehearsal/presenter/*`
- 관련 tests

Acceptance:

- target occurrence보다 앞의 같은 단어가 transcript에 포함되어도 target animation은 실행되지 않는다.
- script progress가 target occurrence window에 들어온 뒤 같은 단어가 감지되면 animation이 실행된다.
- 이미 실행된 occurrence는 같은 slide session에서 중복 실행되지 않는다.

Verify:

```bash
pnpm --filter @orbit/web test -- RehearsalWorkspace.test.tsx speechTracker.test.ts p3RehearsalSession.test.ts
pnpm --filter @orbit/web typecheck
```

### Task 5. Presenter Playback Integration

Files:

- `packages/editor-core/src/playback/slidePlayback.ts`
- `apps/web/src/features/rehearsal/presenter/*`
- 관련 tests

Acceptance:

- `resolveTriggeredActions({ keywordId, occurrenceId })`가 occurrence action만 resolve한다.
- presenter snapshot에는 실행 결정이 끝난 `triggerAnimationIds`만 전달된다.
- audience-facing surface에는 speaker notes 또는 occurrence context가 노출되지 않는다.

Verify:

```bash
pnpm --filter @orbit/editor-core test -- slidePlayback.test.ts
pnpm --filter @orbit/web test -- PresentWindow.test.tsx SingleScreenPresenter.test.tsx
```

## Migration And Backward Compatibility

기존 deck에는 `kind: "keyword"` trigger만 있다.

마이그레이션 정책:

- 기존 deck은 그대로 재생 가능해야 한다.
- 에디터에서 기존 keyword trigger action을 열면 "전체 키워드 트리거"로 표시한다.
- 기존 keyword trigger action은 자동 추정 변환을 지원한다.
- 변환은 deck load 시 원본을 즉시 변경하지 않고, editor migration preview 또는 저장 시 patch로 적용한다.
- 변환 결과가 낮은 신뢰도이면 사용자에게 확인 UI를 보여준다.

### Legacy Trigger Auto-Mapping

기존 `kind: "keyword"` trigger를 `keyword-occurrence`로 자동 변환할 때는 deterministic heuristic을 사용한다.

입력:

- current slide
- legacy action `{ trigger: { kind: "keyword", keywordId }, effect }`
- derived keyword occurrences
- slide animation order
- existing action order

규칙:

1. 해당 `keywordId`의 occurrence가 0개면 변환하지 않고 dangling legacy trigger로 표시한다.
2. occurrence가 1개면 해당 occurrence로 변환한다.
3. 같은 `keywordId`를 가리키는 legacy action이 여러 개이고 occurrence도 여러 개면, action 배열 순서와 occurrence reading order를 순서대로 매핑한다.
4. legacy action이 1개이고 occurrence가 여러 개면 마지막 occurrence를 기본 추정값으로 선택한다.
5. animation effect가 특정 element의 entry animation이고 slide 안에 같은 keyword action이 여러 개 있으면 animation order가 빠른 action일수록 앞 occurrence에 매핑한다.
6. 자동 추정된 변환에는 `metadata.migrationConfidence` 또는 editor-only diagnostics로 `high`, `medium`, `low`를 기록한다.

신뢰도:

- `high`: occurrence가 1개
- `medium`: action 수와 occurrence 수가 같아 순서 매핑 가능
- `low`: occurrence가 여러 개인데 action이 1개라 마지막 occurrence로 추정

low confidence 변환은 저장 전 사용자 확인이 필요하다. 확인 UI copy:

```text
기존 키워드 트리거를 마지막 "{keyword}" 위치로 연결하려고 합니다. 맞으면 저장하세요.
```

## Testing Strategy

### Unit Tests

- keyword occurrence derivation
- slide action schema validation
- playback action resolve
- script progress window matching

### Component Tests

- `KeywordHighlightedNotes`
- `AnimationEditorModal`
- animation side panel keyword picker

### Integration Tests

- editor에서 특정 occurrence 선택 후 action 생성
- rehearsal에서 같은 단어가 앞에 있어도 target occurrence 전에는 animation 미실행
- target occurrence 도달 후 animation 실행
- legacy keyword trigger가 반복 term을 가리킬 때 자동 추정 변환 결과 표시

### Negative Fixtures

반드시 포함할 fixture:

```text
오늘은 AI 덱 생성 파이프라인을 소개합니다.
중간에도 AI를 언급합니다.
마지막에 AI를 말하면 이미지가 나타납니다.
```

검증:

- 첫 번째 `AI` transcript: target animation 미실행
- 두 번째 `AI` transcript: target animation 미실행
- 마지막 `AI` transcript와 progress window 일치: target animation 실행

## Commands

Focused verification:

```bash
pnpm --filter @orbit/shared test -- deck.schema.test.ts
pnpm --filter @orbit/editor-core test -- slidePlayback.test.ts actionOperations.test.ts
pnpm --filter @orbit/web test -- KeywordInspector.test.tsx EditorShell.test.tsx RehearsalWorkspace.test.tsx PresentWindow.test.tsx
```

Broader verification:

```bash
pnpm --filter @orbit/shared typecheck
pnpm --filter @orbit/editor-core typecheck
pnpm --filter @orbit/web typecheck
pnpm --filter @orbit/web lint
```

## Boundaries

Always:

- Validate all Deck action trigger changes through `packages/shared`.
- Keep `speakerNotes`, raw transcript, and raw audio out of server logs.
- Keep existing `keyword` trigger backward compatible.
- Add regression tests for repeated keyword terms.

Ask first:

- Durable migration of existing decks.
- Public API response changes.
- Audience-facing data shape changes.
- New dependency for fuzzy matching or NLP.

Never:

- Store raw transcript or raw audio in Deck JSON.
- Send speaker notes to audience APIs.
- Persist low-confidence auto-mapping without user confirmation.
- Trigger occurrence actions from keyword text alone without script progress gating.

## Success Criteria

- A user can select the last `AI` in speaker notes and bind an animation to that exact occurrence.
- Earlier `AI` utterances in rehearsal do not trigger the last `AI` animation.
- The target animation triggers only when speech progress reaches the selected occurrence window, including allowed near-match skip behavior.
- Occurrence actions require script progress confidence `>= 0.7`.
- Existing decks with `kind: "keyword"` triggers still load and play.
- Existing decks with repeated keyword terms can be auto-mapped to occurrence triggers with deterministic confidence labels.
- Shared schema rejects dangling `keyword-occurrence` triggers.
- Tests cover both repeated Korean and repeated English keyword terms.

## Closed Decisions

- Initial script progress confidence threshold is `0.7`.
- Occurrence context is derived at runtime only and is not stored in Deck JSON.
