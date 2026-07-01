import { describe, expect, it } from "vitest";

const measurementReportModuleUrl = new URL(
  "../scripts/sherpa-measurement-report.mjs",
  import.meta.url
).href;

describe("Sherpa browser measurement report", () => {
  it("uses the same human audio source label shape as Moonshine reports", async () => {
    const { buildSherpaMeasurementReport } = await import(measurementReportModuleUrl);

    const report = buildSherpaMeasurementReport({
      modelId: "sherpa-onnx-streaming-zipformer-korean-2024-06-16",
      fixturePath: "/repo/apps/web/src/features/rehearsal/fixtures/live-stt-ko-evaluation.json",
      audioDir: "/repo/fixtures/live-stt-human-v1",
      audioSource: "human-rehearsal-fixtures-v1",
      fixtureSet: {
        count: 1,
        ids: ["next-slide-01"],
        sha256: "fixture-set-hash"
      },
      voice: "Yuna",
      results: [],
      repoRoot: "/repo"
    });

    expect(report).toMatchObject({
      engine: "sherpa",
      modelId: "sherpa-onnx-streaming-zipformer-korean-2024-06-16",
      fixturePath: "apps/web/src/features/rehearsal/fixtures/live-stt-ko-evaluation.json",
      fixtureSet: {
        count: 1,
        ids: ["next-slide-01"],
        sha256: "fixture-set-hash"
      },
      audioSource: "human-rehearsal-fixtures-v1",
      audioInput: {
        kind: "human-wav",
        source: "human-rehearsal-fixtures-v1",
        directory: "fixtures/live-stt-human-v1"
      },
      results: []
    });
    expect(report.generatedAt).toEqual(expect.any(String));
  });

  it("keeps synthetic sherpa baselines out of human cutover evidence", async () => {
    const { buildSherpaMeasurementReport } = await import(measurementReportModuleUrl);

    const report = buildSherpaMeasurementReport({
      modelId: "sherpa-onnx-streaming-zipformer-korean-2024-06-16",
      fixturePath: "/repo/apps/web/src/features/rehearsal/fixtures/live-stt-ko-evaluation.json",
      audioDir: null,
      audioSource: undefined,
      fixtureSet: undefined,
      voice: "Yuna",
      results: [],
      repoRoot: "/repo"
    });

    expect(report.audioSource).toBe("macOS say voice Yuna");
    expect(report.audioInput).toEqual({
      kind: "synthetic-tts",
      source: "macOS say voice Yuna",
      voice: "Yuna"
    });
  });

  it("rejects an explicit human audio source without wav fixtures", async () => {
    const { buildSherpaMeasurementReport } = await import(measurementReportModuleUrl);

    expect(() =>
      buildSherpaMeasurementReport({
        modelId: "sherpa-onnx-streaming-zipformer-korean-2024-06-16",
        fixturePath: "/repo/apps/web/src/features/rehearsal/fixtures/live-stt-ko-evaluation.json",
        audioDir: null,
        audioSource: "human-rehearsal-fixtures-v1",
        fixtureSet: undefined,
        voice: "Yuna",
        results: [],
        repoRoot: "/repo"
      })
    ).toThrow("--audio-source requires --audio-dir");
  });
});
