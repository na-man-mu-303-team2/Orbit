# Moonshine Korean ASR Spike

**Status:** Technical integration ready for local/staging validation; default-engine cutover blocked by measured quality gates.

## Scope

This spike validates the browser integration shape for replacing the sherpa-onnx Live STT path with Moonshine Korean while preserving the existing `LiveSttAdapter` and `partial-transcript` contract.

Implemented web pieces:

- `MoonshineLiveSttAdapter`: reuses the existing microphone `AudioWorklet`, resampling, audio level, and debug PCM capture path.
- `MoonshineRmsVadSegmenter`: RMS fallback VAD that buffers speech segments and flushes final segments after trailing silence.
- `moonshineWorker.ts`: loads `@huggingface/transformers` ASR pipeline for `onnx-community/moonshine-tiny-ko-ONNX`, tries WebGPU first, falls back to WASM, and passes `max_length` per segment.
- `orbit.liveStt.engine`: localStorage engine flag for `sherpa` and `moonshine`.
- `stt:evaluate`: fixed Korean fixture evaluator for CER, keyword recall, false-trigger rate, and segment latency.

## Current Go / No-Go

Technical integration: **Go for local and staging validation behind `orbit.liveStt.engine=moonshine`.**

License gate: **User-confirmed as approved on 2026-07-01.** Keep the underlying license record outside this repository and do not remove this gate from release review unless the commercial use and self-hosting/redistribution terms are still current.

Default engine cutover: **No-go until fixed fixture results record keyword recall, false-trigger rate, CER, and WebGPU/WASM latency against the current sherpa path or an agreed absolute target.** Until then, Moonshine stays behind `orbit.liveStt.engine=moonshine`.

## How To Try Locally

```js
localStorage.setItem("orbit.liveStt.engine", "moonshine");
```

Reload the rehearsal page and start Live STT. The worker loads:

```text
onnx-community/moonshine-tiny-ko-ONNX
```

The initial dtype is:

```json
{
  "encoder": "fp32",
  "decoder_model_merged": "q4"
}
```

The worker first requests `device: "webgpu"` and retries with `device: "wasm"` if WebGPU model loading fails.

To force self-hosted model files and block remote Hub access during offline validation:

```js
localStorage.setItem(
  "orbit.liveStt.moonshine.localModelPath",
  "/models/live-stt/moonshine-tiny-ko/"
);
localStorage.setItem("orbit.liveStt.moonshine.allowRemoteModels", "0");
```

The worker applies these values to Transformers.js before pipeline load:

```ts
env.localModelPath = "/models/live-stt/moonshine-tiny-ko/";
env.allowLocalModels = true;
env.allowRemoteModels = false;
```

## Evaluation Harness

Fixture:

```text
apps/web/src/features/rehearsal/fixtures/live-stt-ko-evaluation.json
```

Run:

```bash
pnpm --filter @orbit/web stt:evaluate -- --predictions <predictions.json>
```

Prediction format:

```json
[
  {
    "id": "control-next-slide",
    "transcript": "다음 슬라이드로 넘어가 주세요",
    "detectedKeywords": ["다음 슬라이드"],
    "triggeredControl": true,
    "segmentEndedAtMs": 1000,
    "transcriptAtMs": 1320
  }
]
```

`detectedKeywords` should come from the same product keyword detection path used during rehearsal when measuring end-to-end control quality. For raw ASR-only comparisons, omit `detectedKeywords` and the evaluator will fall back to normalized substring matching.

## Remaining Work

- M1/M5: run real Korean wav fixtures through Moonshine on WebGPU and WASM, then store measured CER, recall, false-trigger rate, model load time, and segment latency.
- M6: run staging canary with debug metric collection.
- M7: keep sherpa as a fallback. Change the default engine only after the measured quality gate passes.
