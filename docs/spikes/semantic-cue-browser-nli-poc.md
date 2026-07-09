# Semantic Cue Browser NLI PoC

Date: 2026-07-09

## Scope

- Provider: `browser-transformersjs`
- Model: `MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli`
- Runtime path: Vite module worker + Transformers.js `zero-shot-classification`
- Browser: Playwright Chromium against local Vite dev server

## Result

- Browser capability check returned `enabled: true`, `device: "webgpu"`.
- First model load timed out at 45,003 ms.
- Cached load attempt also timed out at 45,001 ms.
- Inference did not run because the provider returned `status: "failed"`.
- The worker timeout path returned a bounded provider failure instead of blocking rehearsal.

## Interpretation

Transformers.js integration is code-path feasible and unit-tested, but the upstream ONNX artifact is too heavy for the current 45 second rehearsal runtime load budget. The upstream ONNX file was verified as roughly 428 MB, so first-run browser download and initialization should not be treated as ready for live presenter default use.

## Follow-up Risk

- A smaller quantized artifact or custom ONNX provider path is still needed before enabling this for non-debug rehearsal use.
- A successful cached-load and inference latency measurement remains open until a smaller artifact is available or the upstream model is pre-cached outside the live rehearsal path.
- The current implementation keeps this provider behind `VITE_SEMANTIC_CUE_NLI_ENABLED=true` and `VITE_SEMANTIC_CUE_NLI_PROVIDER=browser-transformersjs`.
