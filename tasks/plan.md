# Implementation Plan: Web Speech(SODA) 한국어 인식률 개선

**Status:** Implemented - completion tracked in [tasks/todo.md](./todo.md)
**Date:** 2026-07-03
**Design record:** [docs/plans/web-speech-korean-stt-improvement-plan.md](../docs/plans/web-speech-korean-stt-improvement-plan.md)
**Checklist:** [tasks/todo.md](./todo.md)
**Manual browser target:** 최신 Chrome Stable

## Overview

Web Speech(SODA) 온디바이스 한국어 인식률을 네 축으로 개선한다.

1. Web Speech on-device baseline을 기본 엔진으로 확정하고 ko-KR 언어팩 확인·설치를 명시한다.
2. 슬라이드별 bias 구절을 weight와 metadata 포함 구조로 포트에 전달하고 `SpeechRecognition.phrases`에 적용한다.
3. 제약이 적용된 `getUserMedia` stream의 live audio track을 `recognition.start(track)`으로 라우팅한다.
4. Web Speech final alternatives를 bias 기반 자모 유사도로 재순위한다.

`RehearsalWorkspace.tsx`에는 신규 알고리즘을 추가하지 않는다. 필요한 변경은 기존 함수 이동/import 변경, 기존 호출부 수정, 게이트 제거로 제한한다.

## Implementation Result

2026-07-03 기준 T0-T15 구현과 T1 Chrome Stable 스파이크를 완료했다. 진행 상태와 검증 완료 표시는 `tasks/todo.md`를 기준으로 한다.

검증 완료:

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- Chrome Stable headless API surface/fake-audio spike: `docs/spikes/web-speech-ko-biasing.md`

실제 제품 수준의 한국어 인식률 개선 주장은 non-headless Chrome Stable에서 사람 발화 수동 검증 후에만 가능하다. 현재 구현은 Chrome Stable API surface, 포트/계약 테스트, 리허설 회귀 테스트, alternatives no-op 안전 경로로 검증했다.

## Human-Confirmed Decisions

- Phase 0에는 기본 엔진 전환(`web-speech`, `processLocally: true`)과 ko-KR 언어팩 확인 로직을 포함한다.
- Chrome Stable 스파이크는 병렬 가능 태스크다. 구현 전체를 차단하지 않는다.
- `SpeechRecognition.available/install` 옵션의 `quality`는 `"command"`로 명시한다.
- `LiveSttBiasPhrase` 전환은 유니온 2단계로 진행한다.
- 최종 `LiveSttBiasPhrase`에는 `source`, `keywordId`, `canonicalText` optional metadata를 포함한다.
- `source`는 워크스페이스와 P3 source 값을 합친 통합 union으로 정의한다.
- `shouldUseLiveSttHotwordBias` 게이트 제거와 sherpa hotword 항상 전달 동작 변화는 의도된 변경이다.
- 자모 유사도 정규화는 공통 순수 모듈로 추출한다.
- `scoreBiasMatch`는 exact contains fast path 후 자모 sliding window로 비교한다.
- 재순위 교체는 `bestScore > originalScore && bestScore >= 0.75`일 때만 수행한다.

## Architecture Decisions

### Bias phrase contract

Phase 1 중간 상태:

```ts
export type LiveSttBiasPhraseInput = string | LiveSttBiasPhrase;
```

최종 상태:

```ts
export type LiveSttBiasPhraseSource =
  | "control-phrase"
  | "final-trigger"
  | "cue-trigger"
  | "keyword"
  | "synonym"
  | "abbreviation"
  | "representative-phrase"
  | "legacy"
  | "title"
  | "slide-text"
  | "speaker-notes"
  | "nearby-slide-text";

export type LiveSttBiasPhrase = {
  text: string;
  weight: number;
  source?: LiveSttBiasPhraseSource;
  keywordId?: string;
  canonicalText?: string;
};
```

Normalization rules:

- `text`: trim + whitespace collapse.
- `weight`: finite number만 허용하고 `[0, 1]`로 clamp.
- legacy string input: migration 중에만 `{ text, weight: 1 }`로 변환.
- duplicate key: whitespace-normalized display text.
- duplicate winner: higher weight wins. Equal weight keeps first input and metadata.

### Web Speech options

```ts
export const WEB_SPEECH_LANGUAGE = "ko-KR";
export const WEB_SPEECH_QUALITY = "command";
export const WEB_SPEECH_LANGUAGE_PACK_OPTIONS = {
  langs: [WEB_SPEECH_LANGUAGE],
  processLocally: true,
  quality: WEB_SPEECH_QUALITY
} as const;
```

`available()` and `install()` use the same option object unless Chrome Stable spike proves a runtime incompatibility. If incompatibility is found, record it in `docs/spikes/web-speech-ko-biasing.md` and adjust only the affected helper/test.

### Reranking rules

- `WEB_SPEECH_MAX_ALTERNATIVES = 3`.
- Only final results carry `alternatives`.
- `RerankingLiveSttPort` strips `alternatives` before emitting to consumers.
- Rerank only when:
  - result is final,
  - alternatives length is at least 2,
  - phrases length is at least 1,
  - best candidate score is greater than original candidate score,
  - best candidate score is at least `0.75`.
- Tie break order: bias score, confidence, original index.
- Undefined confidence is treated as `0` for tie breaking.

## Dependency Graph

```text
T0 Web Speech SODA baseline
    |
    +-- T1 Chrome Stable spike (parallel verification, not a hard gate)

T2 union contract
    +-- T3 producer conversion
    |     +-- T4 final weighted-only contract
    |     +-- T7 remove biasMode hotword gate
    +-- T5 webSpeechPhrases
          +-- T6 connect phrases to WebSpeechLiveSttPort

T8 webSpeechAudioTrack
    +-- T9 connect audio track routing

T4 final contract
    +-- T10 shared live transcript normalization
          +-- T11 koreanTextSimilarity
                +-- T12 alternativeReranker

T13 LiveSttResult.alternatives + maxAlternatives
T12 + T13
    +-- T14 RerankingLiveSttPort
          +-- T15 registry wrapper
```

## Verification Commands

Task-level commands use package-relative paths because `@orbit/web` runs from `apps/web`.

```bash
pnpm --filter @orbit/web test -- src/features/rehearsal/stt/liveSttPort.test.ts
pnpm --filter @orbit/web test -- src/features/rehearsal/stt/webSpeechLiveSttPort.test.ts
pnpm --filter @orbit/web test -- src/features/rehearsal/RehearsalWorkspace.test.tsx
pnpm --filter @orbit/web typecheck
```

Checkpoint commands:

```bash
pnpm lint
pnpm test
pnpm build
```

## Phase 0: SODA Baseline + Spike

### Task 0: Web Speech on-device baseline 확정

**Description:** 현재 live STT 기본 엔진을 Web Speech on-device로 확정한다. `WebSpeechLiveSttPort`는 기본적으로 `processLocally: true`로 동작하고, ko-KR 언어팩을 `quality: "command"` 옵션으로 확인·설치한다. 이 태스크는 현재 워크트리에 일부 구현되어 있을 수 있으므로 구현자는 기존 변경을 보존하면서 누락된 테스트와 문서만 보완한다.

**Acceptance criteria:**

- [ ] `defaultLiveSttEngineId`가 `"web-speech"`이다.
- [ ] `createLiveSttPort("web-speech")`가 `new WebSpeechLiveSttPort({ processLocally: true })` 경로를 사용한다.
- [ ] `WebSpeechLiveSttPort`가 `SpeechRecognition.available({ langs: ["ko-KR"], processLocally: true, quality: "command" })`를 호출한다.
- [ ] `available()` 결과가 `"downloadable"` 또는 `"downloading"`이면 `install()`을 같은 옵션으로 호출한다.
- [ ] `available()` 결과가 `"unavailable"`이면 `LiveSttError("model_unavailable", ...)`로 실패한다.
- [ ] `processLocally` 프로퍼티가 recognition에 없으면 `LiveSttError("unsupported_runtime", ...)`로 실패한다.
- [ ] 원격 Web Speech 모드(`processLocally: false`)는 `consentGranted` 없이는 `consent_required`를 던진다.

**Verification:**

- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/stt/liveSttEngineRegistry.test.ts`
- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/stt/webSpeechLiveSttPort.test.ts`
- [ ] `pnpm --filter @orbit/web typecheck`

**Dependencies:** None

**Files likely touched:**

- `apps/web/src/features/rehearsal/stt/liveSttEngineRegistry.ts`
- `apps/web/src/features/rehearsal/stt/liveSttEngineRegistry.test.ts`
- `apps/web/src/features/rehearsal/stt/browserSpeechRecognition.ts`
- `apps/web/src/features/rehearsal/stt/webSpeechLiveSttPort.ts`
- `apps/web/src/features/rehearsal/stt/webSpeechLiveSttPort.test.ts`

**Estimated scope:** M

### Task 1: Chrome Stable ko-KR Web Speech 스파이크 기록

**Description:** 최신 Chrome Stable에서 ko-KR on-device Web Speech 기능을 수동으로 실측하고 `docs/spikes/web-speech-ko-biasing.md`에 기록한다. 이 태스크는 구현 병렬 진행을 허용하지만, 결과가 부정적이면 해당 Phase의 기대 효과와 PR 리스크 설명을 갱신해야 한다.

**Acceptance criteria:**

- [ ] Chrome Stable 버전, OS, 실행 origin(`localhost` 등 secure context 여부)을 기록한다.
- [ ] `SpeechRecognition` 또는 `webkitSpeechRecognition` 생성자 존재 여부를 기록한다.
- [ ] recognition instance의 `processLocally` 지원 여부를 기록한다.
- [ ] `available({ langs: ["ko-KR"], processLocally: true, quality: "command" })` 결과를 기록한다.
- [ ] `install({ langs: ["ko-KR"], processLocally: true, quality: "command" })` 호출 가능 여부와 반환값을 기록한다.
- [ ] `'phrases' in recognition`과 `globalThis.SpeechRecognitionPhrase` 존재 여부를 기록한다.
- [ ] `recognition.phrases = [new SpeechRecognitionPhrase("오르빗", 5)]` 설정 성공 여부를 기록한다.
- [ ] `maxAlternatives = 3` final 결과에서 실제 alternatives 개수를 기록한다.
- [ ] `start(audioTrack)` 성공 여부와 실패 시 error name/message를 기록한다.
- [ ] 부정적 결과가 있으면 T5/T6/T9/T13/T14 중 어떤 기대 효과를 조정해야 하는지 기록한다.

**Verification:**

- [ ] `docs/spikes/web-speech-ko-biasing.md` 리뷰

**Dependencies:** None. T0과 병렬 가능.

**Files likely touched:**

- `docs/spikes/web-speech-ko-biasing.md`

**Estimated scope:** S

### Checkpoint 0

- [ ] T0 테스트 통과
- [ ] T1 스파이크 문서가 있거나, 아직 미완료이면 PR 리스크에 "Chrome Stable 실측 미완료"를 명시
- [ ] Phase 1 구현 전에 baseline 변경이 reviewer에게 보이도록 PR 본문에 포함

## Phase 1: Contextual Biasing

### Task 2: LiveSttPort 계약을 유니온 입력으로 확장

**Description:** `LiveSttBiasPhrase`, `LiveSttBiasPhraseSource`, migration-only `LiveSttBiasPhraseInput`을 추가한다. `updateBiasPhrases`와 `LiveSttSessionConfig.biasPhrases`는 임시로 `readonly LiveSttBiasPhraseInput[]`를 받는다. `normalizeLiveSttBiasPhrases`는 항상 `LiveSttBiasPhrase[]`를 반환한다.

**Acceptance criteria:**

- [ ] 기존 `string[]` 호출부가 수정 없이 컴파일된다.
- [ ] weighted phrase 입력이 text/weight/source/keywordId/canonicalText를 보존한다.
- [ ] weight는 `[0, 1]`로 clamp된다.
- [ ] 중복 display text는 높은 weight를 유지하고, 같은 weight는 먼저 들어온 항목을 유지한다.
- [ ] `LiveSttPort` contract test가 string input과 weighted input을 모두 포함한다.
- [ ] sherpa 포트는 `LiveSttBiasPhrase[]`를 기존 `LiveSttBiasContext`로 변환할 때 metadata를 가능한 범위에서 보존한다.
- [ ] moonshine 포트는 weighted phrase를 저장하되 runtime에는 전달하지 않는다.
- [ ] web-speech 포트는 아직 no-op이지만 새 시그니처를 수용한다.

**Verification:**

- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/stt/liveSttPort.test.ts`
- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/stt`
- [ ] `pnpm --filter @orbit/web typecheck`

**Dependencies:** None

**Files likely touched:**

- `apps/web/src/features/rehearsal/stt/liveSttPort.ts`
- `apps/web/src/features/rehearsal/stt/liveSttPort.test.ts`
- `apps/web/src/features/rehearsal/stt/liveSttPortContract.ts`
- `apps/web/src/features/rehearsal/stt/sherpaLiveSttPort.ts`
- `apps/web/src/features/rehearsal/stt/sherpaLiveSttPort.test.ts`
- `apps/web/src/features/rehearsal/stt/moonshineLiveSttPort.ts`
- `apps/web/src/features/rehearsal/stt/moonshineLiveSttPort.test.ts`
- `apps/web/src/features/rehearsal/stt/webSpeechLiveSttPort.ts`

**Estimated scope:** M

### Task 3: Bias phrase 생산자를 weighted 출력으로 전환

**Description:** `buildBiasPhrasesForSlide`, `getBiasPhrasesFromContext`, `liveSttHarness`가 `LiveSttBiasPhrase[]`를 생성하도록 바꾼다. P3의 `SpeechBiasTerm` metadata와 워크스페이스의 `LiveSttBiasTerm` metadata는 통합 `LiveSttBiasPhraseSource`로 매핑한다.

**Acceptance criteria:**

- [ ] `buildBiasPhrasesForSlide`가 `buildSpeechTrackingBiasPhrases()`의 `text`, `weight`, `source`, `keywordId`, `canonicalText`를 보존한다.
- [ ] `getBiasPhrasesFromContext`가 `context.terms`의 `text`, `weight`, `source`, `keywordId`, `canonicalText`를 보존한다.
- [ ] `liveSttHarness`의 `expectedPhrases`와 `expectedKeywords`는 migration 중 `{ text, weight: 1, source: "legacy" }` 또는 명시적 weighted fixture로 변환된다.
- [ ] 이 태스크에서는 `shouldUseLiveSttHotwordBias` 게이트를 아직 제거하지 않는다.
- [ ] `RehearsalWorkspace.tsx`에는 기존 helper 반환값과 호출부 타입 수정 외 신규 알고리즘을 추가하지 않는다.

**Verification:**

- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/speech/p3RehearsalSession.test.ts`
- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/speech/p3SpeechHarness.test.tsx`
- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/stt/liveSttHarness.test.ts`
- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/RehearsalWorkspace.test.tsx`
- [ ] `pnpm --filter @orbit/web typecheck`

**Dependencies:** Task 2

**Files likely touched:**

- `apps/web/src/features/rehearsal/speech/p3RehearsalSession.ts`
- `apps/web/src/features/rehearsal/speech/p3RehearsalSession.test.ts`
- `apps/web/src/features/rehearsal/speech/p3SpeechHarness.test.tsx`
- `apps/web/src/features/rehearsal/stt/liveSttHarness.ts`
- `apps/web/src/features/rehearsal/stt/liveSttHarness.test.ts`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.test.tsx`

**Estimated scope:** M

### Task 4: 계약을 weighted-only로 고정

**Description:** 모든 생산자가 weighted phrase를 생성한 뒤 migration-only `string` 입력을 제거한다. 최종적으로 `LiveSttSessionConfig.biasPhrases?: readonly LiveSttBiasPhrase[]`와 `updateBiasPhrases(phrases: readonly LiveSttBiasPhrase[])`만 허용한다.

**Acceptance criteria:**

- [ ] `LiveSttBiasPhraseInput` 타입이 제거되거나 internal test helper로만 남는다.
- [ ] production 호출부에 `string[]` bias phrase 전달이 남지 않는다.
- [ ] contract test는 weighted-only 입력만 사용한다.
- [ ] `normalizeLiveSttBiasPhrases`는 weighted-only 입력을 받는다.

**Verification:**

- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/stt/liveSttPort.test.ts`
- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/stt`
- [ ] `pnpm --filter @orbit/web typecheck`

**Dependencies:** Task 3

**Files likely touched:**

- `apps/web/src/features/rehearsal/stt/liveSttPort.ts`
- `apps/web/src/features/rehearsal/stt/liveSttPort.test.ts`
- `apps/web/src/features/rehearsal/stt/liveSttPortContract.ts`
- Any remaining compile-error call sites

**Estimated scope:** S

### Task 5: `webSpeechPhrases` 모듈 추가

**Description:** Web Speech contextual biasing 적용을 순수 helper로 분리한다. 이 모듈은 React를 import하지 않고 fake recognition/global 객체로 테스트한다.

**Required exports:**

```ts
export const WEB_SPEECH_MIN_BOOST = 1;
export const WEB_SPEECH_MAX_BOOST = 5;

export function isWebSpeechPhrasesSupported(
  recognition: BrowserSpeechRecognition,
  globalScope: BrowserSpeechRecognitionGlobal
): boolean;

export function toWebSpeechPhrases(
  phrases: readonly LiveSttBiasPhrase[],
  globalScope: BrowserSpeechRecognitionGlobal
): BrowserSpeechRecognitionPhrase[];

export function applyWebSpeechPhrases(
  recognition: BrowserSpeechRecognition,
  phrases: readonly LiveSttBiasPhrase[],
  globalScope?: BrowserSpeechRecognitionGlobal
): boolean;
```

**Acceptance criteria:**

- [ ] `browserSpeechRecognition.ts`에 `phrases?`, `SpeechRecognitionPhrase` constructor, `BrowserSpeechRecognitionGlobal` 타입 심이 추가된다.
- [ ] `isWebSpeechPhrasesSupported`는 `'phrases' in recognition`과 constructor 존재를 모두 확인한다.
- [ ] `toWebSpeechPhrases`는 `boost = 1 + weight * 4`를 적용하고 boost를 `[1, 5]`로 clamp한다.
- [ ] unsupported 환경에서는 `applyWebSpeechPhrases`가 false를 반환하고 recognition을 변경하지 않는다.
- [ ] constructor 또는 assignment가 throw하면 false를 반환한다.
- [ ] 빈 phrase 배열은 지원 환경에서 `recognition.phrases = []`로 반영하고 true를 반환한다.

**Verification:**

- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/stt/webSpeechPhrases.test.ts`
- [ ] `pnpm --filter @orbit/web typecheck`

**Dependencies:** Task 2

**Files likely touched:**

- `apps/web/src/features/rehearsal/stt/browserSpeechRecognition.ts`
- `apps/web/src/features/rehearsal/stt/webSpeechPhrases.ts`
- `apps/web/src/features/rehearsal/stt/webSpeechPhrases.test.ts`

**Estimated scope:** S

### Task 6: WebSpeechLiveSttPort에 phrases 연결

**Description:** `WebSpeechLiveSttPort.start(config)`와 `updateBiasPhrases()`가 `webSpeechPhrases` helper를 사용하도록 연결한다.

**Acceptance criteria:**

- [ ] `start(config)`는 recognition 설정 후 start 전 `config.biasPhrases`를 적용한다.
- [ ] `updateBiasPhrases(phrases)`는 active recognition이 있으면 phrases를 교체한다.
- [ ] active recognition이 없으면 latest phrases를 저장하고 다음 `start()`에 적용한다.
- [ ] phrases 지원 여부에 따라 `capabilities.keywordBiasing`이 갱신된다.
- [ ] unsupported 환경에서 start/update는 throw하지 않고 기존 STT 동작을 유지한다.
- [ ] 기존 no-op 주석은 제거된다.

**Verification:**

- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/stt/webSpeechLiveSttPort.test.ts`
- [ ] 수동: Chrome Stable에서 phrases 지원 시 slide keyword 발화 인식 개선을 확인
- [ ] 수동: phrases 미지원 시 세션 시작·자막 표시가 기존처럼 동작함을 확인

**Dependencies:** Task 2, Task 5

**Files likely touched:**

- `apps/web/src/features/rehearsal/stt/webSpeechLiveSttPort.ts`
- `apps/web/src/features/rehearsal/stt/webSpeechLiveSttPort.test.ts`

**Estimated scope:** S

### Task 7: Bias phrase 항상 전달로 전환

**Description:** `RehearsalWorkspace` 슬라이드 전환 effect에서 `shouldUseLiveSttHotwordBias` 게이트를 제거하고 모든 엔진에 현재 slide bias phrase를 전달한다. `biasMode`는 postprocess append 경로만 제어한다.

**Acceptance criteria:**

- [ ] `biasMode=none`, `postprocess`, `hotword`, `combined` 모두에서 slide 전환 시 `updateBiasPhrases(weightedPhrases)`가 호출된다.
- [ ] `applyLiveTranscriptBias`는 `shouldUseLiveSttPostprocessBias` 조건을 계속 따른다.
- [ ] 미사용이 된 `shouldUseLiveSttHotwordBias` 함수와 해당 테스트 기대값을 삭제 또는 갱신한다.
- [ ] sherpa hotword 항상 전달 동작 변화가 테스트명 또는 PR 설명에 명시된다.

**Verification:**

- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/RehearsalWorkspace.test.tsx`
- [ ] `pnpm --filter @orbit/web typecheck`

**Dependencies:** Task 3

**Files likely touched:**

- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.test.tsx`

**Estimated scope:** S

### Checkpoint 1: Phase 1 완료

- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] 수동 E2E: 리허설 시작, 슬라이드 전환, 키워드 발화, 자막 표시, 키워드 감지 정상
- [ ] PR 본문에 sherpa hotword always-on 동작 변화와 Chrome Stable phrases 실측 상태 명시

## Phase 2: Audio Track Routing

### Task 8: `webSpeechAudioTrack` 모듈 추가

**Description:** Web Speech `start(audioTrack)` 호출을 안전하게 캡슐화한다.

**Required exports:**

```ts
export type WebSpeechStartMode = "track" | "default";

export function resolveWebSpeechAudioTrack(
  stream: MediaStream | null | undefined
): MediaStreamTrack | null;

export function startRecognitionWithAudioTrack(
  recognition: BrowserSpeechRecognition,
  track: MediaStreamTrack | null
): WebSpeechStartMode;
```

**Acceptance criteria:**

- [ ] `resolveWebSpeechAudioTrack`는 `getAudioTracks()`의 첫 live audio track을 우선 선택한다.
- [ ] `getAudioTracks()`가 없는 fake stream에서는 `getTracks()`에서 `kind === "audio" && readyState === "live"`를 찾는다.
- [ ] live audio track이 없으면 null을 반환한다.
- [ ] `startRecognitionWithAudioTrack`는 track이 있으면 `recognition.start(track)`을 먼저 시도한다.
- [ ] `start(track)`이 throw하면 `console.debug` 후 `recognition.start()`로 폴백한다.
- [ ] fallback `start()`가 throw한 오류는 기존 start 실패 처리로 올라가도록 다시 throw한다.
- [ ] track이 null이면 바로 `recognition.start()`를 호출한다.

**Verification:**

- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/stt/webSpeechAudioTrack.test.ts`

**Dependencies:** None

**Files likely touched:**

- `apps/web/src/features/rehearsal/stt/webSpeechAudioTrack.ts`
- `apps/web/src/features/rehearsal/stt/webSpeechAudioTrack.test.ts`
- `apps/web/src/features/rehearsal/stt/browserSpeechRecognition.ts`

**Estimated scope:** S

### Task 9: WebSpeechLiveSttPort에 audio track routing 연결

**Description:** `WebSpeechLiveSttPort.start(config)`가 `config.audioSource`의 live audio track을 Web Speech recognition에 전달하도록 연결한다.

**Acceptance criteria:**

- [ ] `browserSpeechRecognition.ts`의 `start` 타입은 `start(audioTrack?: MediaStreamTrack): void`이다.
- [ ] `start(config)`는 `resolveWebSpeechAudioTrack(config.audioSource)`를 호출한다.
- [ ] helper 반환값이 `"track"`이면 테스트에서 track 전달이 확인된다.
- [ ] helper 반환값이 `"default"`이면 기존 무인자 start 경로와 동일하게 세션이 시작된다.
- [ ] `RehearsalWorkspace.tsx`는 수정하지 않는다.

**Verification:**

- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/stt/webSpeechLiveSttPort.test.ts`
- [ ] 수동: `orbit.liveStt.debugRawMic=1`일 때 raw mic 제약 차이가 Web Speech 경로에도 반영되는지 확인

**Dependencies:** Task 8

**Files likely touched:**

- `apps/web/src/features/rehearsal/stt/browserSpeechRecognition.ts`
- `apps/web/src/features/rehearsal/stt/webSpeechLiveSttPort.ts`
- `apps/web/src/features/rehearsal/stt/webSpeechLiveSttPort.test.ts`

**Estimated scope:** S

### Checkpoint 2: Phase 2 완료

- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] 수동 E2E: 소음 환경에서 리허설 시작, 인식 시작, 자막 정상, fallback debug 로그 여부 확인

## Phase 3: Alternatives Reranking

### Task 10: 공통 live transcript 정규화 모듈 추출

**Description:** `RehearsalWorkspace.tsx`의 `normalizeLiveTranscriptText`를 STT/리허설 공통 순수 모듈로 이동한다. 기존 exported function 사용자는 새 모듈을 import하도록 수정한다.

**Acceptance criteria:**

- [ ] 새 모듈은 React/Konva/browser API를 import하지 않는다.
- [ ] 기존 `normalizeLiveTranscriptText` 테스트 기대값이 그대로 유지된다.
- [ ] `RehearsalWorkspace.tsx`는 정규화 함수를 새 모듈에서 import한다.
- [ ] `koreanTextSimilarity.ts`가 같은 정규화 함수를 사용할 수 있다.

**Verification:**

- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/stt/liveTranscriptText.test.ts`
- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/RehearsalWorkspace.test.tsx`
- [ ] `pnpm --filter @orbit/web typecheck`

**Dependencies:** Task 4

**Files likely touched:**

- `apps/web/src/features/rehearsal/stt/liveTranscriptText.ts`
- `apps/web/src/features/rehearsal/stt/liveTranscriptText.test.ts`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.test.tsx`

**Estimated scope:** S

### Task 11: `koreanTextSimilarity` 모듈 추가

**Description:** 한국어 자모 기반 phrase match score를 순수 함수로 구현한다.

**Required exports:**

```ts
export const KOREAN_BIAS_SIMILARITY_THRESHOLD = 0.75;

export function normalizeKoreanBiasText(value: string): string;

export function jamoEditSimilarity(left: string, right: string): number;

export function scoreBiasMatch(
  candidateText: string,
  phrases: readonly LiveSttBiasPhrase[]
): number;
```

**Acceptance criteria:**

- [ ] `normalizeKoreanBiasText`는 공통 `normalizeLiveTranscriptText` 결과에 NFD 자모 분해를 적용한다.
- [ ] exact contains이면 phrase similarity는 1.0이다.
- [ ] exact contains가 아니면 phrase 자모 길이 기준 sliding window로 최고 similarity를 찾는다.
- [ ] sliding window는 phrase length와 같은 길이를 기본으로 하고, STT 삽입/누락을 고려해 `length - 2`부터 `length + 2`까지 비교한다. 최소 window length는 1이다.
- [ ] similarity가 `0.75` 미만이면 해당 phrase 점수는 0이다.
- [ ] phrase 점수는 `similarity * weight`이며 전체 점수는 phrase 점수 합이다.
- [ ] 빈 candidate, 빈 phrases, weight 0은 0점을 반환한다.
- [ ] "결재"/"결제"처럼 자모 유사쌍은 threshold 이상 fixture로 검증한다.
- [ ] 무관한 단어쌍은 threshold 미만 fixture로 검증한다.

**Verification:**

- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/stt/koreanTextSimilarity.test.ts`

**Dependencies:** Task 10

**Files likely touched:**

- `apps/web/src/features/rehearsal/stt/koreanTextSimilarity.ts`
- `apps/web/src/features/rehearsal/stt/koreanTextSimilarity.test.ts`

**Estimated scope:** M

### Task 12: `alternativeReranker` 모듈 추가

**Description:** Web Speech alternatives 중 bias 개선이 있는 후보만 선택하는 순수 reranker를 구현한다.

**Required exports:**

```ts
export type LiveSttAlternative = {
  text: string;
  confidence?: number;
};

export type RerankDecision = {
  selected: LiveSttAlternative;
  selectedIndex: number;
  originalScore: number;
  selectedScore: number;
  changed: boolean;
};

export function rerankAlternatives(
  alternatives: readonly LiveSttAlternative[],
  phrases: readonly LiveSttBiasPhrase[]
): RerankDecision | null;
```

**Acceptance criteria:**

- [ ] alternatives가 0개이면 null을 반환한다.
- [ ] alternatives가 1개이거나 phrases가 비어 있으면 original 1순위를 `changed: false`로 반환한다.
- [ ] `scoreBiasMatch` 점수가 높은 후보를 선택한다.
- [ ] 점수 동점이면 confidence가 높은 후보를 선택한다.
- [ ] confidence가 undefined이면 0으로 취급한다.
- [ ] confidence도 동점이면 original index가 낮은 후보를 선택한다.
- [ ] `selectedScore > originalScore && selectedScore >= 0.75`일 때만 `changed: true`이다.
- [ ] `changed: false`이면 selected는 original 1순위여야 한다.
- [ ] "결재"와 "결제" fixture에서 bias 구절이 있을 때만 교체된다.

**Verification:**

- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/stt/alternativeReranker.test.ts`

**Dependencies:** Task 11

**Files likely touched:**

- `apps/web/src/features/rehearsal/stt/alternativeReranker.ts`
- `apps/web/src/features/rehearsal/stt/alternativeReranker.test.ts`

**Estimated scope:** S

### Task 13: LiveSttResult alternatives 방출

**Description:** Web Speech final result에서 alternatives를 수집해 optional `LiveSttResult.alternatives`로 방출한다.

**Acceptance criteria:**

- [ ] `LiveSttResult`에 `alternatives?: LiveSttAlternative[]` optional 필드가 추가된다.
- [ ] `webSpeechLiveSttPort`는 `WEB_SPEECH_MAX_ALTERNATIVES = 3`을 사용한다.
- [ ] final result는 `result.length`만큼 alternatives를 수집하되 빈 transcript는 제외한다.
- [ ] final alternatives 순서는 브라우저 제공 순서를 유지한다.
- [ ] final 1순위 `text`와 `confidence`는 기존 필드에 계속 들어간다.
- [ ] interim result에는 `alternatives`를 붙이지 않는다.
- [ ] p3 세션과 워크스페이스는 alternatives를 읽지 않아도 무수정으로 typecheck 통과한다.

**Verification:**

- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/stt/webSpeechLiveSttPort.test.ts`
- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/stt/liveSttPort.test.ts`
- [ ] `pnpm --filter @orbit/web typecheck`

**Dependencies:** Task 4

**Files likely touched:**

- `apps/web/src/features/rehearsal/stt/liveSttPort.ts`
- `apps/web/src/features/rehearsal/stt/liveSttPort.test.ts`
- `apps/web/src/features/rehearsal/stt/webSpeechLiveSttPort.ts`
- `apps/web/src/features/rehearsal/stt/webSpeechLiveSttPort.test.ts`

**Estimated scope:** S

### Task 14: `RerankingLiveSttPort` 데코레이터 추가

**Description:** 임의의 `LiveSttPort`를 래핑해 final alternatives만 재순위하는 데코레이터를 만든다.

**Acceptance criteria:**

- [ ] constructor는 inner `LiveSttPort`를 받는다.
- [ ] `engineId`와 `capabilities`는 inner port 값을 그대로 노출한다.
- [ ] `start(config)`는 `config.biasPhrases`를 최신 phrases로 저장한 뒤 inner start에 위임한다.
- [ ] `updateBiasPhrases(phrases)`는 최신 phrases를 갱신하고 inner update에 위임한다.
- [ ] `onResult`는 final + alternatives 2개 이상 + phrases 있음 조건에서만 `rerankAlternatives`를 호출한다.
- [ ] `changed: true`이면 방출 result의 `text`와 `confidence`를 selected alternative 값으로 교체한다.
- [ ] `changed: false`, interim, alternatives 없음, phrases 없음은 기존 result text를 유지한다.
- [ ] 소비자에게 방출되는 result에는 `alternatives` 필드가 없다.
- [ ] `onError`, `stop`, `dispose`, unsubscribe는 inner port 동작을 보존한다.
- [ ] contract test 대상에 decorator harness를 추가한다.

**Verification:**

- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/stt/rerankingLiveSttPort.test.ts`
- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/stt/webSpeechLiveSttPort.test.ts`
- [ ] `pnpm --filter @orbit/web typecheck`

**Dependencies:** Task 12, Task 13

**Files likely touched:**

- `apps/web/src/features/rehearsal/stt/rerankingLiveSttPort.ts`
- `apps/web/src/features/rehearsal/stt/rerankingLiveSttPort.test.ts`
- `apps/web/src/features/rehearsal/stt/liveSttPortContract.ts`

**Estimated scope:** M

### Task 15: Registry에서 Web Speech 포트를 reranker로 감싸기

**Description:** `createLiveSttPort("web-speech")`가 `RerankingLiveSttPort(WebSpeechLiveSttPort)`를 반환하도록 조립한다. sherpa와 moonshine은 감싸지 않는다.

**Acceptance criteria:**

- [ ] `case "web-speech"`는 `new RerankingLiveSttPort(new WebSpeechLiveSttPort({ processLocally: true }))`를 사용한다.
- [ ] registry test에서 web-speech가 reranking wrapper를 반환함을 확인한다.
- [ ] sherpa/moonshine 생성 경로는 기존과 동일하다.
- [ ] 롤백은 registry wrapper 제거 한 줄로 가능하다.

**Verification:**

- [ ] `pnpm --filter @orbit/web test -- src/features/rehearsal/stt/liveSttEngineRegistry.test.ts`
- [ ] `pnpm --filter @orbit/web typecheck`

**Dependencies:** Task 14

**Files likely touched:**

- `apps/web/src/features/rehearsal/stt/liveSttEngineRegistry.ts`
- `apps/web/src/features/rehearsal/stt/liveSttEngineRegistry.test.ts`

**Estimated scope:** XS

### Checkpoint 3: 최종 완료

- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] 수동 E2E: 리허설 시작, 발화, 키워드 감지, 자동 전환, 종료 정상
- [ ] 수동 E2E: final alternatives가 2개 이상인 케이스에서 재순위 교정 사례 1건 이상 확인
- [ ] 수동 E2E: alternatives가 1개뿐인 Chrome Stable 환경에서는 재순위 no-op과 기존 자막 정상 동작 확인
- [ ] PR 본문에 Chrome Stable 스파이크 결과, phrases 지원 여부, alternatives 개수, `start(track)` 지원 여부를 기록

## Parallelization

- T1은 T0-T15와 병렬 가능하지만, 부정적 결과는 기대 효과 문서와 PR 리스크에 반영해야 한다.
- T8-T9는 T2-T7과 병렬 가능하다.
- T5는 T2 이후 T3-T4와 병렬 가능하다.
- T10-T12는 T4 이후 T13과 병렬 가능하다.
- T14-T15는 순차 필수다.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Chrome Stable이 ko-KR phrases를 미지원 | High | T1에 기록하고 T5/T6은 feature-detect no-op 유지. Phase 3 rerank를 주 개선 경로로 둔다. |
| Chrome Stable이 final alternatives를 1개만 반환 | Medium | T1과 최종 E2E에 기록. T14는 no-op으로 동작하고 PR 기대 효과를 조정한다. |
| `start(audioTrack)` 미지원 또는 track 무시 | Medium | T8 helper에서 예외 폴백. 무시 여부는 수동 검증에 기록한다. |
| sherpa hotword always-on으로 biasMode 의미가 바뀜 | Medium | 의도된 변경으로 PR 본문과 테스트에 명시한다. |
| 자모 sliding window가 과교정 | Medium | `bestScore > originalScore && bestScore >= 0.75` 조건으로 교체를 제한한다. |
| STT 계약 변경 중 호출부 누락 | Medium | T2 유니온, T3 생산자 전환, T4 weighted-only 고정 순서로 typecheck green 상태를 유지한다. |

## Open Questions

없음. 2026-07-03 사용자 확인으로 스파이크 게이트, 계약 전환 방식, Web Speech quality, bias metadata, source 타입, biasMode 동작, 정규화 위치, similarity matching 방식, rerank 교체 임계값을 확정했다.
