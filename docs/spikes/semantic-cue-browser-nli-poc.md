# Semantic Cue Browser Pairwise NLI PoC

Date: 2026-07-10

## Scope

- Provider: `browser-transformersjs`
- Model: `MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli`
- Runtime path: Vite module worker + Transformers.js `AutoTokenizer` / `AutoModelForSequenceClassification`
- Backends: WebGPU, WASM
- Rollout: rehearsal-only shadow; default off

The model repository exposes one `fp32` ONNX artifact (`onnx/model.onnx`, 428 MB) and no quantized ONNX variant. Its config maps `0=entailment`, `1=neutral`, and `2=contradiction`. The worker now reads that mapping and applies one 3-way softmax to each premise/hypothesis pair. It no longer derives neutral and contradiction from a zero-shot entailment-like score.

Sources:

- [Model ONNX files](https://huggingface.co/MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli/tree/main/onnx)
- [Pinned model config](https://huggingface.co/MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli/blob/0a71e92a985b6e1ad1828cf67ce9c459639c1dca/config.json)
- [Transformers.js model API](https://huggingface.co/docs/transformers.js/en/api/models)

## Harness

Start the Web dev server, then run the browser matrix:

```bash
pnpm --filter @orbit/web dev
pnpm test:nli-browser -- http://127.0.0.1:5173 webgpu
pnpm test:nli-browser -- http://127.0.0.1:5173 wasm
```

The developer-only page is `semantic-cue-nli-benchmark.html`. It prewarms before inference, evaluates four fixed Korean premise/hypothesis fixtures five times, records cold load, warm p50/p95, a confusion matrix, main-thread long tasks, and the page JS heap reading. It never sends fixture text to ORBIT APIs or audience channels.

Gate values come from `semantic-cue-presenter-success-plan.md`:

- warm p95: at most 500 ms
- false `covered`: at most 1%
- main-thread long task: at most 50 ms
- presentation-time cold load: 0

## Device Results

Environment: Playwright Chromium on Apple Silicon macOS, headless, 2026-07-10.

| Backend         | Load budget |           Cold load |  Warm p50 |  Warm p95 | False covered | Confusion matrix       | Main-thread long task | Result           |
| --------------- | ----------: | ------------------: | --------: | --------: | ------------: | ---------------------- | --------------------: | ---------------- |
| WebGPU          |        45 s |   timeout at 45.0 s |   not run |   not run |  not measured | not measured           |          not measured | fail             |
| WASM run 1      |        45 s |            44.261 s | 19.090 ms | 44.705 ms |           0/2 | TP 2, FP 0, TN 2, FN 0 |         0 ms observed | precision sample fail |
| WASM run 2      |        45 s | timeout at 45.007 s |   not run |   not run |  not measured | not measured           |          not measured | fail             |
| WASM diagnostic |        60 s |            48.328 s | 19.520 ms | 44.805 ms |           0/2 | TP 2, FP 0, TN 2, FN 0 |         0 ms observed | warm gates only  |

The page JS heap API reported 10,000,000 bytes before and after the successful diagnostic run. This does not include worker/WASM/native allocations, so it is recorded as an observability limitation rather than evidence that model memory is zero. The 428 MB model artifact remains the reliable lower-bound deployment cost.

Both backends emitted a browser cache `put` warning. WebGPU did not become ready within the fixed load budget. WASM warm inference was fast when loaded, but prewarm crossed the 45-second boundary on a repeat run. A four-item synthetic fixture is also too small to certify a 1% false-covered target; the deterministic gate requires at least 100 negative examples.

## Rollout Decision

The browser NLI rollout remains off by default. No backend is certified by this spike.

To enter shadow mode, all of these explicit build-time flags are required:

```text
VITE_SEMANTIC_CUE_NLI_ENABLED=true
VITE_SEMANTIC_CUE_NLI_PROVIDER=browser-transformersjs
VITE_SEMANTIC_CUE_NLI_BENCHMARK_PASSED=true
VITE_SEMANTIC_CUE_NLI_BENCHMARK_DEVICE=wasm|webgpu
```

`VITE_SEMANTIC_CUE_NLI_BENCHMARK_PASSED` must not be set from the results above. A later device-specific benchmark may certify a backend after a smaller quantized artifact or reliable cache/prewarm path exists and a representative post-run fixture validates the false-covered gate.

Even when explicitly enabled, the browser provider:

- loads during rehearsal preparation and never waits for cold load during presentation inference;
- exposes `model_not_ready`, `model_load_failed`, low-memory `provider_unavailable`, and `timeout` as capability fallback reasons;
- writes pairwise scores only to presenter/debug shadow evidence;
- never evaluates browser NLI in presentation mode;
- leaves lexical/alias/E5 decisions in `measurementMode=basic`;
- cannot mark a cue covered or advance a slide by itself.

## Follow-up Risk

- Publish or select a materially smaller quantized pairwise ONNX artifact and record its exact size.
- Add representative post-run labels before treating the current four fixtures as a precision gate.
- Measure worker/native memory with a browser/process profiler; page JS heap does not cover those allocations.
- Resolve browser cache reliability before considering a backend certified.
