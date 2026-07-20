import type { StoragePort } from "@orbit/storage";
import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildPresentationDetailedReport,
  buildPresentationVoiceReport,
  processPresentationAnalysisJob,
} from "./presentation-analysis.processor";

const payload = {
  jobId: "job-presentation",
  projectId: "project-a",
  sessionId: "session-a",
  runId: "presentation-run-a",
  deckId: "deck_1",
  audioFileId: "file-a",
};

describe("processPresentationAnalysisJob", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("stores the detailed report only in presentation_runs", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([presentationInputRow()])
      .mockResolvedValueOnce([jobRow("running", 10)])
      .mockResolvedValueOnce([jobRow("running", 75)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([jobRow("succeeded", 100)]);
    const removeObject = vi.fn(async () => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(audioEvidence()), { status: 200 }),
      ),
    );

    const job = await processPresentationAnalysisJob(
      { query } as unknown as DataSource,
      {
        getSignedReadUrl: vi.fn(
          async () => "https://private.invalid/presentation.webm",
        ),
        removeObject,
      } as unknown as StoragePort,
      "http://python-worker:8000",
      payload,
    );

    expect(job.status).toBe("succeeded");
    expect(job.result).toMatchObject({
      runId: payload.runId,
      sessionId: payload.sessionId,
      voiceReport: {
        fillerWordCount: 2,
        longSilenceCount: 1,
        averagePitchHz: 176,
      },
      detailedReport: {
        reportId: `presentation_report_${payload.runId}`,
        transcriptRetained: true,
      },
    });
    expect(removeObject).toHaveBeenCalledWith("private/presentation.webm");

    const executedSql = query.mock.calls.map(([sql]) => String(sql)).join("\n");
    expect(executedSql).toContain("presentation_runs");
    expect(executedSql).toContain("detailed_report_json");
    expect(executedSql).not.toContain("rehearsal_runs");
    expect(executedSql).not.toContain("practice_goal");
    expect(executedSql).not.toContain("rehearsal_project");
  });

  it("marks only the presentation run failed when audio analysis fails", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([presentationInputRow()])
      .mockResolvedValueOnce([jobRow("running", 10)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([jobRow("failed", 100)]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unavailable", { status: 503 })),
    );

    const job = await processPresentationAnalysisJob(
      { query } as unknown as DataSource,
      {
        getSignedReadUrl: vi.fn(
          async () => "https://private.invalid/presentation.webm",
        ),
        removeObject: vi.fn(),
      } as unknown as StoragePort,
      "http://python-worker:8000",
      payload,
    );

    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe("PRESENTATION_TRANSCRIPTION_FAILED");
    const executedSql = query.mock.calls.map(([sql]) => String(sql)).join("\n");
    expect(executedSql).not.toContain("rehearsal_runs");
    expect(executedSql).not.toContain("storage_deletion_outbox");
  });
});

describe("buildPresentationVoiceReport", () => {
  it("derives presentation metrics and script coverage without retaining transcript", () => {
    const report = buildPresentationVoiceReport(audioEvidence(), [
      "오늘 발표에서는 제품 전략과 고객 가치를 설명합니다.",
    ]);

    expect(report).toMatchObject({
      durationSeconds: 8,
      averageVolumeDbfs: -31.5,
      fillerWordCount: 2,
      longSilenceCount: 1,
      averagePitchHz: 176,
    });
    expect(report.wordsPerMinute).toBeGreaterThan(0);
    expect(report.scriptFeedback).toContain("핵심 흐름");
    expect(JSON.stringify(report)).not.toContain("음 어 오늘 발표에서는");
  });
});

describe("buildPresentationDetailedReport", () => {
  it("projects presentation audio into the full rehearsal report contract", () => {
    const report = buildPresentationDetailedReport(
      audioEvidence(),
      presentationInputRow().deck_snapshot_json,
      {
        deckId: payload.deckId,
        projectId: payload.projectId,
        runId: payload.runId,
      },
      "2026-07-20T00:00:01.000Z",
    );

    expect(report).toMatchObject({
      reportId: "presentation_report_presentation-run-a",
      transcript: "음 어 오늘 발표에서는 제품 전략과 실행 계획을 설명합니다",
      volumeAnalysis: {
        measurementState: "measured",
        averageDbfs: -31.5,
      },
      silenceAnalysis: {
        measurementState: "measured",
        longSilenceCount: 1,
      },
      metrics: {
        longSilenceCount: 1,
        keywordCoverage: 1,
      },
      aiSummary: {
        headline: "실전 발표 분석이 완료되었습니다.",
      },
    });
    expect(report.slideTimings).toHaveLength(1);
    expect(report.missedKeywords).toEqual([]);
  });

  it("uses live presentation transcripts for the rehearsal-format report", () => {
    const report = buildPresentationDetailedReport(
      audioEvidence(),
      presentationInputRow().deck_snapshot_json,
      {
        deckId: payload.deckId,
        projectId: payload.projectId,
        runId: payload.runId,
      },
      "2026-07-20T00:00:01.000Z",
      {
        liveTranscript: "음 제품 전략을 설명하고 다음 계획을 안내합니다",
        slideTranscriptSnapshots: [
          {
            capturedAt: "2026-07-20T00:00:01.000Z",
            reason: "rehearsal-end",
            slideId: "slide_1",
            slideNum: 1,
            transcript: "음 제품 전략을 설명하고 다음 계획을 안내합니다",
            visitedAt: "2026-07-20T00:00:00.000Z",
            visitedVer: 1,
          },
        ],
      },
    );

    expect(report.transcript).toBe(
      "음 제품 전략을 설명하고 다음 계획을 안내합니다",
    );
    expect(report.metrics.fillerWordCount).toBe(1);
    expect(report.missedKeywords).toEqual([]);
    expect(report.slideInsights).toEqual([
      expect.objectContaining({
        fillerWordCount: 1,
        slideId: "slide_1",
      }),
    ]);
  });
});

function presentationInputRow() {
  return {
    run_id: payload.runId,
    project_id: payload.projectId,
    session_id: payload.sessionId,
    deck_id: payload.deckId,
    deck_snapshot_json: {
      slides: [
        {
          estimatedSeconds: 60,
          keywords: [
            {
              keywordId: "keyword_1",
              required: true,
              text: "제품 전략",
            },
          ],
          slideId: "slide_1",
          speakerNotes: "오늘 발표에서는 제품 전략과 고객 가치를 설명합니다.",
          title: "제품 전략",
        },
      ],
    },
    status: "processing",
    audio_file_id: payload.audioFileId,
    storage_key: "private/presentation.webm",
    mime_type: "audio/webm",
    asset_status: "uploaded",
    purpose: "presentation-audio",
  };
}

function audioEvidence() {
  return {
    transcript: "음 어 오늘 발표에서는 제품 전략과 실행 계획을 설명합니다",
    provider: "openai",
    meanRecognitionConfidence: 0.92,
    voice: {
      activeSpeechMs: 3_000,
      pauseRatio: 0.35,
      pitchMedianHz: 176,
      pitchSpanHz: 48,
      pitchValidRatio: 0.8,
      loudnessDb: -31.5,
      loudnessMadDb: 4.2,
      syllablesPerSecond: null,
      signalToNoiseDb: 20,
      breathinessRatio: null,
      clarityRatio: null,
      rhythmRegularity: 0.72,
      clippingRatio: 0,
    },
    loudnessSamples: [{ startMs: 0, endMs: 8_000, loudnessDb: -31.5 }],
    speedSamples: [{ startMs: 0, endMs: 5_000, syllablesPerSecond: 3 }],
    transcriptSegments: [
      {
        text: "음 어 오늘 발표에서는 제품 전략과 실행 계획을 설명합니다",
        startMs: 0,
        endMs: 3_000,
      },
    ],
    pauseSegments: [{ startMs: 3_000, endMs: 8_000, durationMs: 5_000 }],
  };
}

function jobRow(status: "running" | "succeeded" | "failed", progress: number) {
  return {
    job_id: payload.jobId,
    project_id: payload.projectId,
    type: "presentation-analysis",
    status,
    progress,
    message: status,
    result:
      status === "succeeded"
        ? {
            detailedReport: buildPresentationDetailedReport(
              audioEvidence(),
              presentationInputRow().deck_snapshot_json,
              {
                deckId: payload.deckId,
                projectId: payload.projectId,
                runId: payload.runId,
              },
              "2026-07-20T00:00:01.000Z",
            ),
            runId: payload.runId,
            sessionId: payload.sessionId,
            voiceReport: buildPresentationVoiceReport(audioEvidence(), [
              "오늘 발표에서는 제품 전략과 고객 가치를 설명합니다.",
            ]),
          }
        : null,
    error:
      status === "failed"
        ? {
            code: "PRESENTATION_TRANSCRIPTION_FAILED",
            message: "unavailable",
          }
        : null,
    created_at: "2026-07-20T00:00:00.000Z",
    updated_at: "2026-07-20T00:00:01.000Z",
  };
}
