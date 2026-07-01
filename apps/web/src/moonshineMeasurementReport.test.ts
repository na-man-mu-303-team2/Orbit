import { describe, expect, it } from "vitest";

const measurementReportModuleUrl = new URL(
  "../scripts/moonshine-measurement-report.mjs",
  import.meta.url
).href;

describe("Moonshine browser measurement report", () => {
  it("uses an explicit audio source label for human wav fixtures", async () => {
    const { buildMoonshineMeasurementReport } = await import(measurementReportModuleUrl);

    const report = buildMoonshineMeasurementReport({
      modelId: "onnx-community/moonshine-tiny-ko-ONNX",
      dtype: {
        encoder_model: "fp32",
        decoder_model_merged: "q4"
      },
      fixturePath: "/repo/apps/web/src/features/rehearsal/fixtures/live-stt-ko-evaluation.json",
      audioDir: "/repo/fixtures/live-stt-human-v1",
      audioSource: "human-rehearsal-fixtures-v1",
      voice: "Yuna",
      results: [],
      repoRoot: "/repo"
    });

    expect(report).toMatchObject({
      modelId: "onnx-community/moonshine-tiny-ko-ONNX",
      fixturePath: "apps/web/src/features/rehearsal/fixtures/live-stt-ko-evaluation.json",
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

  it("keeps the synthetic voice label when no human audio directory is provided", async () => {
    const { buildMoonshineMeasurementReport } = await import(measurementReportModuleUrl);

    const report = buildMoonshineMeasurementReport({
      modelId: "onnx-community/moonshine-tiny-ko-ONNX",
      dtype: {
        encoder_model: "fp32",
        decoder_model_merged: "q4"
      },
      fixturePath: "/repo/apps/web/src/features/rehearsal/fixtures/live-stt-ko-evaluation.json",
      audioDir: null,
      audioSource: undefined,
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

  it("rejects an explicit audio source label without a human audio directory", async () => {
    const { buildMoonshineMeasurementReport } = await import(measurementReportModuleUrl);

    expect(() =>
      buildMoonshineMeasurementReport({
        modelId: "onnx-community/moonshine-tiny-ko-ONNX",
        dtype: {
          encoder_model: "fp32",
          decoder_model_merged: "q4"
        },
        fixturePath: "/repo/apps/web/src/features/rehearsal/fixtures/live-stt-ko-evaluation.json",
        audioDir: null,
        audioSource: "human-rehearsal-fixtures-v1",
        voice: "Yuna",
        results: [],
        repoRoot: "/repo"
      })
    ).toThrow("--audio-source requires --audio-dir");
  });
});
