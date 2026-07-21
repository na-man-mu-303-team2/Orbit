import { describe, expect, it } from "vitest";
import {
  RealtimeSttDiagnosticRingBuffer,
  summarizeRealtimeSttMetrics
} from "./realtimeSttDiagnostics";

describe("realtimeSttDiagnostics", () => {
  it("first delta, commit-final, onset-final latency를 집계한다", () => {
    expect(
      summarizeRealtimeSttMetrics([
        {
          sequence: 1,
          speechStartedAtMs: 100,
          firstDeltaAtMs: 300,
          committedAtMs: 600,
          completedAtMs: 800
        },
        {
          sequence: 2,
          speechStartedAtMs: 1000,
          firstDeltaAtMs: 1400,
          committedAtMs: 1700,
          completedAtMs: 2100
        }
      ])
    ).toEqual({
      completedTurns: 2,
      firstDeltaLatencyMedianMs: 200,
      firstDeltaLatencyP95Ms: 400,
      commitToFinalMedianMs: 200,
      commitToFinalP95Ms: 400,
      onsetToFinalMedianMs: 700,
      onsetToFinalP95Ms: 1100
    });
  });

  it("console diagnostics를 bounded ring buffer로 유지한다", () => {
    const buffer = new RealtimeSttDiagnosticRingBuffer(2);
    buffer.push({ type: "one", atMs: 1 });
    buffer.push({ type: "two", atMs: 2 });
    buffer.push({ type: "three", atMs: 3 });

    expect(buffer.read().map((event) => event.type)).toEqual(["two", "three"]);
    buffer.clear();
    expect(buffer.read()).toEqual([]);
  });
});
