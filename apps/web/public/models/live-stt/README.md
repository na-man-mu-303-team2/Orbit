# 1. Live STT Adapter 계약

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

사용자는 마이크 스트림만 넘기면 됩니다. ASR은 텍스트까지만 반환합니다.

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

에러 코드는 2개입니다.

```ts
"LIVE_STT_MODEL_UNAVAILABLE" // 모델/manifest/WASM/브라우저 지원 문제
"LIVE_STT_START_FAILED"      // 시작/worker/audio capture 실패
```

# 2. Transcript 이벤트 계약

파일: [live-stt.schema.ts](../../../../../packages/shared/src/rehearsals/live-stt.schema.ts)

```ts
{
  type: "partial-transcript",
  transcript: string,
  isFinal: boolean,
  confidence: number | null
}
```

중요한 제품 원칙: ASR adapter는 여기까지만 합니다. 키워드 감지, animation cue, slide advance는 리허설 제품 로직에서 처리합니다.

# 3. 기본 구현체

파일: [sherpaOnnxLiveSttAdapter.ts](../../../src/features/rehearsal/sherpaOnnxLiveSttAdapter.ts)

```ts
new SherpaOnnxLiveSttAdapter({
  manifestUrl?: string,
  fetcher?: typeof fetch,
  createWorker?: () => Worker,
  createAudioContext?: (...) => AudioContext,
  bufferSize?: number
})
```

일반 사용자는 옵션 없이 쓰면 됩니다.

```ts
const adapter = new SherpaOnnxLiveSttAdapter();
```

기본 manifest 경로:

```text
/models/live-stt/sherpa-onnx-streaming-zipformer-korean-2024-06-16/manifest.json
```

# 4. 전역 override 계약

파일: [liveStt.ts](../../../src/features/rehearsal/liveStt.ts)

테스트나 다른 runtime에서 기본 adapter를 갈아끼울 수 있습니다.

```ts
window.__orbitCreateLiveSttAdapter = () => new MyLiveSttAdapter();
```

`RehearsalWorkspace`는 이 값이 있으면 그것을 쓰고, 없으면 `SherpaLiveSttAdapter`를 씁니다.

# 5. 모델 manifest 계약

파일: [sherpaOnnxManifest.ts](../../../src/features/rehearsal/sherpaOnnxManifest.ts)

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
  }
}
```

예시 파일: [sherpa-onnx-streaming-zipformer-korean-2024-06-16.example.json](./sherpa-onnx-streaming-zipformer-korean-2024-06-16.example.json)

# 6. 모델 파일 배치 계약

파일: [README.md](./README.md)

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
```

준비 명령:

```bash
pnpm --filter @orbit/web stt:model:prepare -- --source <model-dir> --runtime <wasm-runtime-dir>
```

# 7. 리허설 제품 로직 계약

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

즉 현재 구조는:

```text
마이크
 -> SherpaOnnxLiveSttAdapter
 -> partial-transcript
 -> evaluateLiveTranscript
 -> keyword / cue / slide advance
 -> React UI state
```

# 8. 내부 worker 메시지 계약

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

정리하면, 다른 사람이 가져다 쓸 때는 `LiveSttAdapter`만 맞추면 됩니다. ASR 제공자가 sherpa든 다른 엔진이든 `partial-transcript` 이벤트만 똑같이 내보내면 ORBIT의 리허설 제어 로직이 그대로 동작합니다.
