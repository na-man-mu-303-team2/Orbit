import { describe, expect, it } from "vitest";

import {
  rehearsalAudioProcessingResponseSchema,
  rehearsalVolumeAnalysisSchema
} from "./rehearsal-audio-analysis.schema";
import { rehearsalReportSchema } from "./rehearsal.schema";

const measuredVolumeAnalysis = {
  metricDefinitionVersion: 1,
  measurementState: "measured",
  reasonCode: null,
  averageDbfs: -22.4,
  baselineDbfs: -21.8,
  variationDb: 8.3,
  activeRatio: 0.76,
  issueSegments: [
    {
      kind: "quiet",
      startSeconds: 8.1,
      endSeconds: 10.2,
      durationSeconds: 2.1,
      meanDeviationDb: -7.4
    }
  ]
} as const;

describe("rehearsal volume analysis contract", () => {
  it("accepts a measured audio processing response", () => {
    const response = rehearsalAudioProcessingResponseSchema.parse({
      runId: "run_1",
      projectId: "project_1",
      fileId: "file_1",
      transcript: "발표 전사 결과",
      language: "ko-KR",
      provider: "whisperx",
      model: "large-v3",
      durationSeconds: 30.2,
      segments: [],
      volumeAnalysis: measuredVolumeAnalysis
    });

    expect(response.volumeAnalysis.measurementState).toBe("measured");
  });

  it("rejects inconsistent measured and unmeasured states", () => {
    expect(
      rehearsalVolumeAnalysisSchema.safeParse({
        ...measuredVolumeAnalysis,
        measurementState: "unmeasured",
        reasonCode: "ANALYSIS_FAILED"
      }).success
    ).toBe(false);
    expect(
      rehearsalVolumeAnalysisSchema.safeParse({
        ...measuredVolumeAnalysis,
        averageDbfs: Number.NaN
      }).success
    ).toBe(false);
  });

  it("rejects invalid issue segment ranges", () => {
    expect(
      rehearsalVolumeAnalysisSchema.safeParse({
        ...measuredVolumeAnalysis,
        issueSegments: [
          {
            kind: "loud",
            startSeconds: 5,
            endSeconds: 4,
            durationSeconds: 1,
            meanDeviationDb: 8
          }
        ]
      }).success
    ).toBe(false);
  });

  it("defaults legacy reports to an unmeasured volume analysis", () => {
    const report = rehearsalReportSchema.parse({
      reportId: "report_1",
      runId: "run_1",
      projectId: "project_1",
      deckId: "deck_1",
      transcriptRetained: false,
      transcript: null,
      metrics: {
        durationSeconds: 30,
        wordsPerMinute: 100,
        fillerWordCount: 0,
        pauseCount: 0,
        keywordCoverage: 1
      },
      coaching: null,
      generatedAt: "2026-07-16T00:00:00.000Z"
    });

    expect(report.volumeAnalysis).toMatchObject({
      measurementState: "unmeasured",
      reasonCode: "LEGACY_REPORT"
    });
  });
});
