# Design Record: Web Speech(SODA) 한국어 인식률 개선

**Status:** 구현 완료 - 세부 태스크는 [tasks/plan.md](../../tasks/plan.md), 완료 체크리스트는 [tasks/todo.md](../../tasks/todo.md)를 따른다.
**Date:** 2026-07-03
**Scope:** `apps/web/src/features/rehearsal` - Web Speech 라이브 STT 경로
**Manual browser target:** 최신 Chrome Stable

이 문서는 Web Speech(SODA) 한국어 인식률 개선의 설계 결정 기록이다. 구현자는 이 문서에서 결정된 정책을 임의로 바꾸지 않고, 태스크별 파일·수용 기준·검증 명령은 `tasks/plan.md`를 따른다.

## 외부 API 기준

Checked: 2026-07-03

- Web Speech API draft 기준으로 `SpeechRecognition`은 `processLocally`, `phrases`, `start(audioTrack)`, `available(options)`, `install(options)`를 정의한다.
- `SpeechRecognitionOptions`는 `{ langs, processLocally, quality }` 구조이며, `quality` 기본값은 `"command"`이다.
- `SpeechRecognition.phrases`는 `ObservableArray<SpeechRecognitionPhrase>`이며, `SpeechRecognitionPhrase(phrase, boost)` 생성자를 사용한다.
- `SpeechRecognition.start(audioTrack)`는 `MediaStreamTrack.kind !== "audio"` 또는 `readyState !== "live"`이면 `InvalidStateError`가 날 수 있다.
- API는 실험적이므로 Chrome Stable ko-KR 동작은 Phase 0 스파이크로 기록한다. 단, 스파이크는 구현을 전부 차단하지 않고 병렬 진행 가능하다.

References:

- [Web Speech API draft](https://webaudio.github.io/web-speech-api/)
- [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
- [MDN SpeechRecognition.phrases](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/phrases)
- [MDN SpeechRecognition.start()](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/start)
- [MDN SpeechRecognition.available()](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static)

## 최종 목표

한국어 온디바이스 Web Speech 인식률을 네 단계로 개선한다.

1. **Phase 0 - SODA baseline + Chrome Stable 스파이크**
   - 기본 live STT 엔진을 Web Speech on-device로 전환한다.
   - 언어팩 확인·설치 옵션은 `{ langs: ["ko-KR"], processLocally: true, quality: "command" }`로 고정한다.
   - Chrome Stable에서 ko-KR phrases, alternatives, `start(MediaStreamTrack)` 동작을 실측한다.
2. **Phase 1 - Contextual biasing**
   - 슬라이드별 bias 구절을 weight와 optional metadata와 함께 `SpeechRecognition.phrases`에 전달한다.
3. **Phase 2 - 오디오 입력 라우팅**
   - 제약이 적용된 `getUserMedia` 스트림의 live audio track을 `recognition.start(track)`으로 전달한다.
4. **Phase 3 - 대안 후보 재순위**
   - `maxAlternatives=3` final 결과에 대해 bias 기반 자모 유사도 재순위 데코레이터를 적용한다.

각 Phase는 독립 PR로 머지·롤백 가능하게 유지한다.

## 확정된 설계 결정

### Phase 0

- 기본 엔진 전환(`defaultLiveSttEngineId = "web-speech"`, `processLocally: true`)은 이 계획의 Phase 0 범위에 포함한다.
- Web Speech 언어팩 확인·설치에는 `quality: "command"`를 명시한다.
- 원격 Web Speech fallback은 이 계획 범위가 아니다. `processLocally: false`는 명시적 동의가 있는 별도 경로에서만 허용한다.
- Chrome Stable 스파이크는 병렬 가능 태스크다. 부정적 결과가 나오면 구현 태스크를 중단하지 않고 기대 효과·수동 검증 기준·PR 리스크 설명을 갱신한다.

### Bias phrase 계약

- 최종 STT 포트 계약은 `LiveSttBiasPhrase[]`이다.
- 마이그레이션 중에만 `string | LiveSttBiasPhrase` 유니온 입력을 허용하고, 모든 생산자 전환 후 `string` 입력을 제거한다.
- `LiveSttBiasPhrase` 구조:

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

- `normalizeLiveSttBiasPhrases`는 공백 collapse + trim을 수행하고, weight는 `[0, 1]`로 clamp한다.
- 중복 제거 key는 기존 문자열 normalize 동작을 보존해 whitespace-normalized 표시 텍스트로 한다.
- 중복 텍스트는 높은 weight 항목을 유지하고, weight가 같으면 먼저 들어온 항목과 metadata를 유지한다.

### Web Speech phrases

- `weight -> boost` 초기 매핑은 `boost = 1 + clamp(weight, 0, 1) * 4`로 고정한다.
- 따라서 `weight=1.0 -> boost=5.0`, `weight=0.45 -> boost=2.8`이다.
- `SpeechRecognitionPhrase` 생성자 또는 `recognition.phrases`가 없으면 feature-detect no-op으로 처리한다.
- `phrases-not-supported` 등 런타임 오류가 Chrome Stable에서 확인되면 Phase 0 스파이크에 기록하고, phrases 적용은 no-op 안전 경로를 유지한다.
- `capabilities.keywordBiasing`은 phrases feature detection 결과를 반영한다.

### Bias mode

- phrases와 재순위는 `orbit.liveStt.biasMode`와 무관하게 항상 활성화한다.
- `biasMode`는 기존 postprocess append 경로(`applyLiveTranscriptBias`)만 제어한다.
- 워크스페이스는 전 엔진에 bias 구절을 항상 전달한다.
- `shouldUseLiveSttHotwordBias` 게이트 제거로 sherpa hotword가 `biasMode=none/postprocess`에서도 켜지는 동작 변화는 의도된 변화이며, PR 본문과 수동 검증 항목에 명시한다.

### 오디오 입력 라우팅

- Web Speech 시작 시 `config.audioSource`에서 첫 번째 `kind === "audio"` 및 `readyState === "live"` track을 선택한다.
- `getAudioTracks()`가 있으면 우선 사용하고, 테스트 fake stream 호환을 위해 필요 시 `getTracks()` filter를 허용한다.
- `recognition.start(track)` 시도 중 예외가 나면 `console.debug`만 남기고 `recognition.start()`로 폴백한다.
- track이 없거나 live가 아니면 바로 무인자 `start()`를 사용한다.

### 재순위

- `maxAlternatives`는 Web Speech 포트 상수 `WEB_SPEECH_MAX_ALTERNATIVES = 3`으로 고정한다.
- alternatives는 final 결과에만 포함한다. interim 결과는 현재처럼 1순위만 방출한다.
- 재순위는 `RerankingLiveSttPort` 데코레이터로 구현하고 web-speech 포트만 감싼다.
- 소비자(`RehearsalWorkspace`, p3 세션)는 수정하지 않는다.
- 데코레이터는 final 결과이고 alternatives가 2개 이상일 때만 재순위한다.
- 재순위된 `LiveSttResult.text`는 라이브 자막과 키워드 매칭 모두에 반영된다.
- 데코레이터는 소비자에게 결과를 방출하기 전에 `alternatives` 필드를 제거한다.

### 한국어 자모 유사도

- 기존 `normalizeLiveTranscriptText`는 `stt/liveTranscriptText.ts` 같은 순수 공통 모듈로 추출한다.
- `RehearsalWorkspace.tsx`와 `koreanTextSimilarity.ts`는 같은 정규화 함수를 import한다.
- `scoreBiasMatch(candidateText, phrases)`는 다음 순서로 계산한다.
  1. 후보 텍스트와 phrase를 display normalize, lowercase, 공백 제거, NFD 자모 분해한다.
  2. phrase가 후보에 정확히 포함되면 similarity `1.0`.
  3. 정확 포함이 아니면 phrase 자모 길이 기준 sliding window로 후보의 최고 편집거리 유사도를 찾는다.
  4. phrase별 점수는 `similarity * weight`.
  5. similarity가 `KOREAN_BIAS_SIMILARITY_THRESHOLD` 미만이면 해당 phrase 점수는 0.
- 교체 기준은 `bestScore > originalScore && bestScore >= 0.75`이다.
- 동점이면 confidence가 높은 후보를 유지하고, confidence도 같거나 없으면 원본 alternatives 순서를 유지한다.
- 모든 score가 0이거나 bestScore가 0.75 미만이면 1순위 텍스트를 교체하지 않는다.

## 결합도 원칙

- 신규 로직은 가능한 한 새 파일에 둔다.
- `RehearsalWorkspace.tsx`에는 기존 함수 이동/import 변경, 기존 라인 수정·삭제만 허용하고 신규 알고리즘을 추가하지 않는다.
- 브라우저 API 의존은 `browserSpeechRecognition.ts`, `webSpeechPhrases.ts`, `webSpeechAudioTrack.ts`에 격리한다.
- 자모 유사도, boost 매핑, alternative rerank는 순수 함수 모듈로 분리해 React/포트 없이 단독 테스트한다.
- STT 포트 계약 변경은 optional metadata 추가와 alternatives optional 필드로 한정한다.

## 롤백 전략

- Phase 0: registry 기본 엔진과 Web Speech on-device 언어팩 옵션 변경을 원복하면 기존 기본 엔진으로 복귀한다.
- Phase 1: phrases 모듈 연결과 weighted contract 변경을 원복하면 기존 string/no-op bias 경로로 복귀한다.
- Phase 2: `webSpeechAudioTrack` 연결을 원복하면 Web Speech 자체 마이크 캡처로 복귀한다.
- Phase 3: `liveSttEngineRegistry`에서 `RerankingLiveSttPort` wrapper 한 줄을 제거하면 재순위가 비활성화된다.

## 파일 변경 요약

| 구분 | 파일 | 단계 |
|---|---|---|
| 신규 | `apps/web/src/features/rehearsal/stt/liveTranscriptText.ts` (+test) | 3 |
| 신규 | `apps/web/src/features/rehearsal/stt/webSpeechPhrases.ts` (+test) | 1 |
| 신규 | `apps/web/src/features/rehearsal/stt/webSpeechAudioTrack.ts` (+test) | 2 |
| 신규 | `apps/web/src/features/rehearsal/stt/koreanTextSimilarity.ts` (+test) | 3 |
| 신규 | `apps/web/src/features/rehearsal/stt/alternativeReranker.ts` (+test) | 3 |
| 신규 | `apps/web/src/features/rehearsal/stt/rerankingLiveSttPort.ts` (+test) | 3 |
| 수정 | `apps/web/src/features/rehearsal/stt/liveSttPort.ts`, `liveSttPortContract.ts` | 1, 3 |
| 수정 | `apps/web/src/features/rehearsal/stt/browserSpeechRecognition.ts` | 0, 1, 2 |
| 수정 | `apps/web/src/features/rehearsal/stt/webSpeechLiveSttPort.ts` (+test) | 0, 1, 2, 3 |
| 수정 | `apps/web/src/features/rehearsal/stt/sherpaLiveSttPort.ts`, `moonshineLiveSttPort.ts` | 1 |
| 수정 | `apps/web/src/features/rehearsal/stt/liveSttEngineRegistry.ts` (+test) | 0, 3 |
| 수정 | `apps/web/src/features/rehearsal/speech/p3RehearsalSession.ts` (+test) | 1 |
| 수정 | `apps/web/src/features/rehearsal/stt/liveSttHarness.ts` (+test) | 1 |
| 수정 | `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx` (+test) | 1, 3 |
