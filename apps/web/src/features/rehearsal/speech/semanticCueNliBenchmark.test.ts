import { describe, expect, it } from "vitest";

import {
  buildSemanticCueNliBenchmarkResult,
  evaluateSemanticCueNliBenchmarkGate,
} from "./semanticCueNliBenchmark";

describe("Semantic Cue NLI benchmark gate", () => {
  it("warm p95, false covered, cold load, UI responsiveness gate를 모두 통과해야 한다", () => {
    const expectedCovered = [
      true,
      true,
      ...Array.from({ length: 100 }, () => false),
    ];
    const result = buildSemanticCueNliBenchmarkResult({
      device: "webgpu",
      modelId: "pairwise-model",
      dtype: "fp32",
      modelBytes: 428_000_000,
      memoryBeforeBytes: 10_000_000,
      memoryAfterBytes: 210_000_000,
      coldLoadMs: 40_000,
      warmLatenciesMs: [240, 260, 280, 300, 320],
      mainThreadLongTasksMs: [8, 12],
      expectedCovered,
      predictedCovered: expectedCovered,
      coldLoadsDuringPresentation: 0,
    });

    expect(result.confusionMatrix).toEqual({ tp: 2, fp: 0, tn: 100, fn: 0 });
    expect(result.memoryDeltaBytes).toBe(200_000_000);
    expect(evaluateSemanticCueNliBenchmarkGate(result)).toEqual({
      passed: true,
      reasons: [],
    });
  });

  it("warm p95 또는 false covered gate가 실패하면 rollout을 비활성화한다", () => {
    const result = buildSemanticCueNliBenchmarkResult({
      device: "wasm",
      modelId: "pairwise-model",
      dtype: "fp32",
      modelBytes: 428_000_000,
      memoryBeforeBytes: null,
      memoryAfterBytes: null,
      coldLoadMs: 50_000,
      warmLatenciesMs: [420, 480, 620],
      mainThreadLongTasksMs: [55],
      expectedCovered: [false, false, true],
      predictedCovered: [true, false, true],
      coldLoadsDuringPresentation: 1,
    });

    expect(evaluateSemanticCueNliBenchmarkGate(result)).toEqual({
      passed: false,
      reasons: [
        "warm-p95-over-500ms",
        "false-covered-over-1pct",
        "insufficient-negative-samples",
        "main-thread-task-over-50ms",
        "presentation-cold-load",
      ],
    });
  });
});
