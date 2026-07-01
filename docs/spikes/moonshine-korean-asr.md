# Moonshine Korean ASR Spike

**Status:** Technical integration ready for local/staging validation; production rollout blocked by license clearance and measured quality gates.

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

Production exposure: **No-go until M0 license clearance is documented.** The plan treats the Korean Moonshine model license as a hard gate for commercial rollout and model asset redistribution.

Default engine cutover: **No-go until fixed fixture results record keyword recall, false-trigger rate, CER, and WebGPU/WASM latency against the current sherpa path or an agreed absolute target.**

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

- M0: document Moonshine Korean model license and redistribution decision before any production rollout.
- M1/M5: run real Korean wav fixtures through Moonshine on WebGPU and WASM, then store measured CER, recall, false-trigger rate, model load time, and segment latency.
- M6: run staging canary with debug metric collection.
- M7: decide whether sherpa remains a fallback and only then change the default engine.
