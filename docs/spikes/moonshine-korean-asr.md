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

Default engine cutover: **No-go.** The 2026-07-01 synthetic Korean fixture baseline recorded below does not meet the quality gate. Moonshine stays behind `orbit.liveStt.engine=moonshine`; sherpa remains the default and fallback.

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
  "encoder_model": "fp32",
  "decoder_model_merged": "q4"
}
```

The worker first requests `device: "webgpu"` and retries with `device: "wasm"` if WebGPU model loading fails.

To force self-hosted model files and block remote Hub access during offline validation:

```js
localStorage.setItem(
  "orbit.liveStt.moonshine.localModelPath",
  "/models/live-stt/"
);
localStorage.setItem("orbit.liveStt.moonshine.allowRemoteModels", "0");
```

The worker applies these values to Transformers.js before pipeline load:

```ts
env.localModelPath = "/models/live-stt/";
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

Browser measurement runner:

```bash
pnpm --filter @orbit/web stt:measure:moonshine -- --out docs/spikes/moonshine-korean-asr-measurements.json
pnpm --filter @orbit/web stt:measure:moonshine -- --devices wasm --decoder-dtype q8 --out docs/spikes/moonshine-korean-asr-measurements-wasm-q8.json
```

The runner starts Vite with COOP/COEP headers, synthesizes Korean fixture audio with the macOS `Yuna` voice unless `--audio-dir` is provided, loads Moonshine in Playwright Chromium, and writes prediction + metric JSON.

## 2026-07-01 Measurements

Source files:

- `docs/spikes/moonshine-korean-asr-measurements.json`
- `docs/spikes/moonshine-korean-asr-measurements-wasm-q8.json`

Audio source: synthetic macOS `say -v Yuna` Korean speech generated from `apps/web/src/features/rehearsal/fixtures/live-stt-ko-evaluation.json`. This is useful for regression and pipeline validation, but it is not a replacement for human rehearsal wav fixtures.
Model load times are directional only: the q4 WASM row ran after WebGPU in the same browser session, while the q8 WASM row ran in a separate measurement.

| Device | dtype | Status | Model load | Avg CER | Keyword recall | False trigger | Avg segment latency | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| WebGPU | `encoder_model=fp32`, `decoder_model_merged=q4` | no-go | 32154 ms | 1.173 | 0.000 | 0.000 | 6739 ms | Chromium emitted repeated WGSL `computeSliceOffsets` validation errors and transcripts were corrupted. |
| WASM | `encoder_model=fp32`, `decoder_model_merged=q4` | no-go | 615 ms | 0.650 | 0.333 | 0.000 | 73.5 ms | Control phrases partially recognized, slide keywords missed. |
| WASM | `encoder_model=fp32`, `decoder_model_merged=q8` | no-go | 13417 ms | 0.643 | 0.333 | 0.000 | 75.2 ms | Slight CER improvement over q4, recall unchanged. |

Conclusion: the integration path works and the tokenizer compatibility issue is fixed, but the measured quality does **not** justify default-engine cutover. Keep the feature flag, collect real human wav fixtures, and revisit VAD/dtype/postprocessing after a representative baseline exists. Canary sessions can enable `orbit.liveStt.debugLatency=1` to capture Moonshine segment `transcribeMs`, `realtimeFactor`, and audio amplitude stats in browser debug logs.

## Remaining Work

- M1/M5: replace the synthetic TTS baseline with real Korean rehearsal wav fixtures and repeat WebGPU/WASM measurements.
- M6: run staging canary using `orbit.liveStt.debugLatency=1` for RTF/latency stats and the A2 harness for recall.
- M7: keep sherpa as a fallback. Change the default engine only after the measured quality gate passes.
