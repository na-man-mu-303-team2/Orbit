# ORBIT Live STT 모델 연동 계약

이 문서는 브라우저 리허설 모드에서 사용하는 Live STT 경로를 설명합니다. 현재 구현은 마이크 입력을 브라우저에서 캡처하고, 기본값으로 sherpa-onnx WASM recognizer를 브라우저 안의 Web Worker에서 실행합니다. Moonshine 한국어 경로는 `orbit.liveStt.engine` 플래그 뒤에 추가되어 있습니다. 리포트용 녹음 업로드/STT 경로와는 별개입니다.

## 1. 공개 Adapter 계약

파일: [liveStt.ts](../../../src/features/rehearsal/liveStt.ts)

```ts
type LiveSttAdapter = {
  start(stream: MediaStream, callbacks: LiveSttCallbacks): Promise<void>;
  stop(): void;
  dispose(): void;
};

type LiveSttCallbacks = {
  onPartialTranscript(event: LiveSttPartialTranscriptEvent): void;
  onError(error: LiveSttAdapterError): void;
};
```

사용자는 마이크 `MediaStream`만 넘깁니다. Adapter는 ASR 결과 텍스트 이벤트까지만 반환합니다.

```ts
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const adapter = new SherpaOnnxLiveSttAdapter();

await adapter.start(stream, {
  onPartialTranscript: (event) => {
    console.log(event.transcript, event.isFinal, event.confidence);
  },
  onError: (error) => {
    console.error(error.code, error.message);
  }
});
```

에러 코드는 두 가지입니다.

```ts
"LIVE_STT_MODEL_UNAVAILABLE" // 모델/manifest/WASM/브라우저 지원 문제
"LIVE_STT_START_FAILED"      // 시작/worker/AudioWorklet 캡처 실패
```

## 2. Transcript 이벤트 계약

파일: [live-stt.schema.ts](../../../../../packages/shared/src/rehearsals/live-stt.schema.ts)

```ts
{
  type: "partial-transcript",
  transcript: string,
  isFinal: boolean,
  confidence: number | null
}
```

중요한 제품 원칙: ASR adapter는 transcript 이벤트까지만 책임집니다. 키워드 감지, animation cue, slide advance는 리허설 제품 로직에서 처리합니다.

## 3. 기본 구현체와 엔진 플래그

파일: [sherpaOnnxLiveSttAdapter.ts](../../../src/features/rehearsal/sherpaOnnxLiveSttAdapter.ts)

```ts
new SherpaOnnxLiveSttAdapter({
  manifestUrl?: string,
  fetcher?: typeof fetch,
  createWorker?: () => Worker,
  createAudioContext?: (manifest) => AudioContext,
  createAudioWorkletNode?: (context, name, options) => AudioWorkletNode,
  bufferSize?: number
});
```

일반 사용자는 옵션 없이 씁니다.

```ts
const adapter = new SherpaOnnxLiveSttAdapter();
```

옵션은 테스트나 특수 runtime 주입용입니다. `bufferSize`는 AudioWorklet이 main thread로 전달하는 PCM frame size이며 기본값은 `4096` source samples입니다.

기본 manifest 경로:

```text
/models/live-stt/sherpa-onnx-streaming-zipformer-korean-2024-06-16/manifest.json
```

`SherpaLiveSttAdapter`는 현재 `SherpaOnnxLiveSttAdapter`를 그대로 상속하는 alias입니다. `RehearsalWorkspace`의 기본 adapter도 엔진 플래그가 없으면 이 구현체를 사용합니다.

Moonshine 한국어 경로:

```ts
localStorage.setItem("orbit.liveStt.engine", "moonshine");
```

자가호스팅 모델 자산을 강제하려면 다음 값을 함께 설정합니다.

```ts
localStorage.setItem(
  "orbit.liveStt.moonshine.localModelPath",
  "/models/live-stt/"
);
localStorage.setItem("orbit.liveStt.moonshine.allowRemoteModels", "0");
```

파일:

- [moonshineLiveSttAdapter.ts](../../../src/features/rehearsal/moonshineLiveSttAdapter.ts)
- [moonshineWorker.ts](../../../src/features/rehearsal/moonshineWorker.ts)
- [moonshineVadSegmenter.ts](../../../src/features/rehearsal/moonshineVadSegmenter.ts)

Moonshine 경로는 `transformers.js` + `onnxruntime-web`의 `automatic-speech-recognition` pipeline을 Web Worker에서 lazy-load합니다. `device: "webgpu"` 로드를 먼저 시도하고 실패하면 `device: "wasm"`으로 재시도합니다. `localModelPath`가 설정되면 worker가 `env.localModelPath`, `env.allowLocalModels=true`, `env.allowRemoteModels`를 설정한 뒤 pipeline을 로드합니다. Transformers.js는 `localModelPath + modelId + filename` 형태로 파일을 찾으므로, `onnx-community/moonshine-tiny-ko-ONNX`를 포함하지 않은 루트 경로(`/models/live-stt/`)를 설정해야 합니다. seq2seq 모델 특성상 프레임별 streaming partial 대신 RMS VAD 세그먼트 종료 시 `isFinal: true` transcript를 방출합니다.

Moonshine에는 sherpa hotword decoder API가 없으므로 `RehearsalWorkspace`는 이 엔진에서 `combined`/`hotword` bias 요청을 `postprocess`로 낮춥니다.

Canary 지연·RTF 지표를 브라우저 콘솔에서 확인하려면 다음 값을 켭니다.

```ts
localStorage.setItem("orbit.liveStt.debugLatency", "1");
```

Moonshine worker는 이 플래그가 켜진 세션에서 세그먼트별 `segmentDurationMs`, `transcribeMs`, `realtimeFactor`, `resultLength`, `audioMaxAbs`, `audioRms`를 `[orbit-live-stt-worker]` 로그로 남깁니다. raw audio는 로그에 남기지 않습니다.

## 4. 브라우저 내부 처리 흐름

현재 Live STT 처리 흐름:

```text
MediaStream microphone
 -> AudioContext
 -> AudioWorkletNode
 -> liveSttPcmCapture.worklet.js
 -> Float32Array PCM frame
 -> SherpaOnnxLiveSttAdapter
 -> sherpaOnnxWorker.ts
 -> sherpa-onnx WASM recognizer
 -> partial-transcript event
 -> RehearsalWorkspace live transcript logic
```

AudioWorklet 파일: [liveSttPcmCapture.worklet.js](../../../src/features/rehearsal/liveSttPcmCapture.worklet.js)

- processor 이름은 `orbit-live-stt-pcm-capture`입니다.
- mono input인 `inputs[0][0]`을 읽어 `Float32Array` frame으로 묶습니다.
- Worklet이 보내는 메시지는 `{ type: "audio-frame", sampleRate, samples }`입니다.
- Adapter가 필요하면 모델 sample rate로 resampling한 뒤 sherpa worker에 전달합니다.
- `stop()`/`dispose()` 시 adapter가 Worklet port에 `{ type: "dispose" }`를 보냅니다.

Worklet module은 Vite에서 `?url&no-inline`으로 로드합니다. production build에서는 별도 JS asset으로 출력되고, `AudioContext.audioWorklet.addModule(..., { credentials: "same-origin" })`로 등록됩니다.

## 5. 전역 override 계약

파일: [liveStt.ts](../../../src/features/rehearsal/liveStt.ts)

테스트나 다른 runtime에서 기본 adapter를 갈아끼울 수 있습니다.

```ts
window.__orbitCreateLiveSttAdapter = () => new MyLiveSttAdapter();
```

`RehearsalWorkspace`는 이 값이 있으면 그것을 쓰고, 없으면 `SherpaLiveSttAdapter`를 씁니다.

## 6. 모델 manifest 계약

파일: [sherpaOnnxManifest.ts](../../../src/features/rehearsal/sherpaOnnxManifest.ts)

manifest 예시:

```json
{
  "provider": "sherpa-onnx",
  "modelId": "sherpa-onnx-streaming-zipformer-korean-2024-06-16",
  "version": "2024-06-16",
  "baseUrl": ".",
  "sampleRate": 16000,
  "numThreads": 1,
  "decodingMethod": "greedy_search",
  "runtime": {
    "script": "sherpa-onnx-wasm-main-asr.js",
    "wasm": "sherpa-onnx-wasm-main-asr.wasm",
    "data": "sherpa-onnx-wasm-main-asr.data"
  },
  "model": {
    "encoder": "encoder.onnx",
    "decoder": "decoder.onnx",
    "joiner": "joiner.onnx",
    "tokens": "tokens.txt"
  },
  "files": {
    "encoder.onnx": {
      "bytes": 123456,
      "sha256": "..."
    }
  }
}
```

지원하는 optional field:

- `runtime.helpers`: runtime script 이후 추가로 `importScripts()`할 helper JS 목록
- `runtime.wasm`, `runtime.data`: 없으면 `null`로 resolve됨
- `model.bpeVocab`: BPE 모델의 hotword bias에 필요한 **텍스트** vocab 파일(`bpe.vocab`).
  - sherpa `ssentencepiece`는 `piece<TAB>score` 라인 텍스트를 기대한다. 바이너리 `bpe.model`(sentencepiece protobuf)을 그대로 넣으면 `modified_beam_search`에서 파싱 실패해 recognizer 생성이 죽는다(`darts.h: failed to insert key: zero-length key`).
  - `bpe.model` → `bpe.vocab` 변환:
    ```bash
    python3 -c "import sentencepiece as spm; sp=spm.SentencePieceProcessor(model_file='bpe.model'); open('bpe.vocab','w',encoding='utf-8').writelines(f'{sp.id_to_piece(i)}\t{sp.get_score(i)}\n' for i in range(sp.get_piece_size()))"
    ```
  - hotword bias(컨트롤 문구/슬라이드 키워드)는 `bpe.vocab`이 있어야만 동작한다. 없으면 worker가 자동으로 greedy_search로 degrade되고 bias는 꺼진다.
- `files`: 파일별 `bytes`, `sha256` 메타데이터
- `decodingMethod`: `"greedy_search"` 또는 `"modified_beam_search"`

예시 파일: [sherpa-onnx-streaming-zipformer-korean-2024-06-16.example.json](./sherpa-onnx-streaming-zipformer-korean-2024-06-16.example.json)

## 7. 모델 파일 배치 계약

기본 배치 위치:

```text
apps/web/public/models/live-stt/
  sherpa-onnx-streaming-zipformer-korean-2024-06-16/
    manifest.json
    sherpa-onnx-wasm-main-asr.js
    sherpa-onnx-wasm-main-asr.wasm
    sherpa-onnx-wasm-main-asr.data
    encoder.onnx
    decoder.onnx
    joiner.onnx
    tokens.txt
    bpe.vocab                 # hotword bias용 텍스트 vocab (bpe.model에서 생성)
```

준비 명령:

```bash
pnpm --filter @orbit/web stt:model:prepare -- --source <model-dir> --runtime <wasm-runtime-dir>
```

현재 준비 스크립트는 필수 runtime 파일 3개와 필수 모델 파일 4개를 복사하고, `manifest.json`에 `files` 메타데이터를 생성합니다.

Moonshine 자가호스팅 기본 배치:

```text
apps/web/public/models/live-stt/
  onnx-community/
    moonshine-tiny-ko-ONNX/
      config.json
      generation_config.json
      preprocessor_config.json
      special_tokens_map.json
      tokenizer.json
      tokenizer_config.json
      orbit-local-model-manifest.json
      onnx/
        encoder_model.onnx
        decoder_model_merged_q4.onnx
```

준비 명령:

```bash
pnpm --filter @orbit/web stt:model:prepare:moonshine -- --source <moonshine-snapshot-dir>
```

기본값은 `encoder_model=fp32`, `decoder_model_merged=q4`이며 Transformers.js가 찾는 파일명은 각각 `onnx/encoder_model.onnx`, `onnx/decoder_model_merged_q4.onnx`입니다. 다른 dtype 조합을 검증할 때는 `--encoder-dtype` 또는 `--decoder-dtype`을 넘깁니다.

## 8. 리허설 제품 로직 계약

현재 위치: [RehearsalWorkspace.tsx](../../../src/features/rehearsal/RehearsalWorkspace.tsx)

```ts
normalizeLiveTranscriptText(text): string
evaluateLiveTranscript(slide, transcript): LiveTranscriptAnalysis
shouldAutoAdvanceLiveSlide(options): boolean
```

이 계층이 하는 일:

- transcript에서 keyword/synonym/abbreviation 감지
- coverage 계산
- 새 keyword 감지 시 `animation-cue` 생성
- coverage 80% 이상이면 slide advance 후보 판단

즉 제품 로직 관점의 구조는 다음과 같습니다.

```text
마이크
 -> SherpaOnnxLiveSttAdapter
 -> partial-transcript
 -> evaluateLiveTranscript
 -> keyword / cue / slide advance
 -> React UI state
```

Moonshine 플래그 사용 시 adapter만 바뀌고 `partial-transcript` 이후 제품 로직은 동일합니다.

```text
마이크
 -> MoonshineLiveSttAdapter
 -> MoonshineRmsVadSegmenter
 -> moonshineWorker.ts
 -> partial-transcript(isFinal: true)
 -> evaluateLiveTranscript
 -> keyword / cue / slide advance
 -> React UI state
```

## 9. 내부 sherpa worker 메시지 계약

파일: [sherpaOnnxWorker.ts](../../../src/features/rehearsal/sherpaOnnxWorker.ts)

외부 사용자가 직접 호출할 계약은 아니고, 유지보수용입니다.

Inbound:

```ts
{ type: "load", manifest }
{ type: "start", sessionId }
{ type: "audio-frame", sessionId, sampleRate, samples: Float32Array }
{ type: "stop", sessionId }
{ type: "dispose" }
```

Outbound:

```ts
{ type: "loaded", modelId, version }
{ type: "started", sessionId }
{ type: "partial", sessionId, transcript, isFinal: false, confidence }
{ type: "final", sessionId, transcript, isFinal: true, confidence }
{ type: "stopped", sessionId }
{ type: "error", code, message, sessionId? }
```

## 10. Moonshine 평가 하네스

고정 한국어 fixture:

```text
apps/web/src/features/rehearsal/fixtures/live-stt-ko-evaluation.json
```

prediction JSON을 준비한 뒤 다음 명령으로 CER, keyword recall, false-trigger율, segment latency를 계산합니다.

```bash
pnpm --filter @orbit/web stt:evaluate -- --predictions <predictions.json>
```

Moonshine 모델을 실제 브라우저(WebGPU/WASM)에서 실행해 prediction과 metric JSON을 생성하려면 다음 명령을 사용합니다.

```bash
pnpm --filter @orbit/web stt:measure:moonshine -- --out docs/spikes/moonshine-korean-asr-measurements.json
pnpm --filter @orbit/web stt:measure:moonshine -- --devices wasm --decoder-dtype q8 --out docs/spikes/moonshine-korean-asr-measurements-wasm-q8.json
```

기본 입력 음성은 macOS `Yuna` synthetic TTS입니다. 실제 리허설 wav를 쓰려면 `<fixture-id>.wav` 파일을 둔 디렉터리를 `--audio-dir <dir>`로 넘깁니다.

prediction 항목 예시:

```json
{
  "id": "control-next-slide",
  "transcript": "다음 슬라이드로 넘어가 주세요",
  "detectedKeywords": ["다음 슬라이드"],
  "triggeredControl": true,
  "transcriptAtMs": 1320
}
```

정리하면, 다른 사람이 가져다 쓸 때는 `LiveSttAdapter`만 맞추면 됩니다. ASR 제공자가 sherpa든 다른 엔진이든 `partial-transcript` 이벤트만 똑같이 내보내면 ORBIT의 리허설 제어 로직이 그대로 동작합니다.
