import { describe, expect, it } from "vitest";

import { findSlidePracticeCoachingIssues } from "./slide-practice-analysis";
import {
  createSlidePracticeAnalysisRequestSchema,
  createSlidePracticeReportRequestSchema,
  slidePracticeAnalysisResultResponseSchema,
  slidePracticeReportListResponseSchema,
  slidePracticeReportRecordSchema,
  slidePracticeReportSchema,
  slidePracticeServerAudioResponseSchema,
} from "./slide-practice.schema";

const report = {
  reportVersion: 1,
  metricDefinitionVersion: 1,
  classifierVersion: 1,
  practiceSessionId: "practice-1",
  projectId: "project-1",
  deckId: "deck-1",
  deckVersion: 2,
  slideId: "slide-1",
  slideOrder: 0,
  startedAt: "2026-07-17T00:00:00.000Z",
  durationMs: 30_000,
  syllableCount: 90,
  meanRecognitionConfidence: 0.91,
  fillers: {
    policyVersion: 1,
    totalCount: 2,
    details: [{ word: "음", count: 2 }],
  },
  voice: {
    activeSpeechMs: 25_000,
    pauseRatio: 0.16,
    pitchMedianHz: 180,
    pitchSpanHz: 90,
    pitchValidRatio: 0.8,
    loudnessDb: -24,
    loudnessMadDb: 3,
    syllablesPerSecond: 3.6,
    signalToNoiseDb: 21,
    breathinessRatio: 0.2,
    clarityRatio: 0.8,
    rhythmRegularity: 0.7,
    clippingRatio: 0,
  },
  style: {
    mode: "neutral",
    confidence: 0.74,
    evidenceLabels: ["속도가 안정적이에요"],
    message: "현재 속도와 억양이 안정적이에요.",
  },
  quality: { state: "measured", reasons: [] },
  source: {
    kind: "browser",
    sttEngine: "web-speech",
    deviceIdHash: "device-hash",
    baselineVersion: 1,
  },
} as const;

describe("slidePracticeReportSchema", () => {
  it("accepts derived metrics without transcript or audio", () => {
    expect(slidePracticeReportSchema.parse(report)).toEqual(report);
  });

  it("reads legacy classifier reports and accepts classifier v4 reports", () => {
    expect(slidePracticeReportSchema.safeParse(report).success).toBe(true);
    expect(slidePracticeReportSchema.safeParse({
      ...report,
      classifierVersion: 2,
    }).success).toBe(true);
    expect(slidePracticeReportSchema.safeParse({
      ...report,
      classifierVersion: 3,
    }).success).toBe(true);
    expect(slidePracticeReportSchema.safeParse({
      ...report,
      classifierVersion: 4,
    }).success).toBe(true);
    expect(slidePracticeReportSchema.safeParse({
      ...report,
      classifierVersion: 5,
    }).success).toBe(false);
  });

  it("rejects transcript persistence", () => {
    expect(slidePracticeReportSchema.safeParse({ ...report, transcript: "민감한 원문" }).success).toBe(false);
  });

  it("requires filler totals to match details", () => {
    expect(slidePracticeReportSchema.safeParse({
      ...report,
      fillers: { ...report.fillers, totalCount: 3 },
    }).success).toBe(false);
  });

  it("wraps reports in an idempotent create request", () => {
    expect(createSlidePracticeReportRequestSchema.safeParse({
      clientRequestId: "request-1",
      report,
    }).success).toBe(true);
  });

  it("accepts creator-private record metadata without weakening report strictness", () => {
    expect(slidePracticeReportRecordSchema.safeParse({
      ...report,
      reportId: "report-1",
      createdBy: "user-1",
      createdAt: "2026-07-17T00:00:31.000Z",
      expiresAt: "2026-10-15T00:00:31.000Z",
    }).success).toBe(true);
    expect(slidePracticeReportRecordSchema.safeParse({
      ...report,
      reportId: "report-1",
      createdBy: "user-1",
      createdAt: "2026-07-17T00:00:31.000Z",
      expiresAt: "2026-10-15T00:00:31.000Z",
      transcript: "저장되면 안 되는 원문",
    }).success).toBe(false);
  });

  it("accepts a report list containing classifier v1 through v4 records", () => {
    const recordMetadata = {
      createdBy: "user-1",
      createdAt: "2026-07-17T00:00:31.000Z",
      expiresAt: "2026-10-15T00:00:31.000Z",
    } as const;

    expect(slidePracticeReportListResponseSchema.safeParse({
      reports: [
        { ...report, ...recordMetadata, reportId: "report-v1" },
        { ...report, ...recordMetadata, classifierVersion: 2, reportId: "report-v2" },
        { ...report, ...recordMetadata, classifierVersion: 3, reportId: "report-v3" },
        { ...report, ...recordMetadata, classifierVersion: 4, reportId: "report-v4" },
      ],
      nextCursor: null,
    }).success).toBe(true);
  });

  it("accepts server-derived metric v2 reports without transcript persistence", () => {
    expect(slidePracticeReportSchema.safeParse({
      ...report,
      metricDefinitionVersion: 2,
      classifierVersion: 4,
      source: {
        kind: "server",
        sttEngine: "report-stt",
        deviceIdHash: "device-hash",
        baselineVersion: 1,
      },
    }).success).toBe(true);
  });

  it("accepts graph samples and bounded AI coaching in report v2", () => {
    expect(slidePracticeReportSchema.safeParse({
      ...report,
      reportVersion: 2,
      loudnessSamples: [{ startMs: 0, endMs: 1_000, loudnessDb: -35.4 }],
      speedSamples: [{ startMs: 0, endMs: 5_000, syllablesPerSecond: 4.3 }],
      coaching: {
        status: "succeeded",
        summary: "습관어를 줄이면 핵심이 더 분명해집니다.",
        issueCodes: ["filler-use"],
        items: [{
          category: "filler",
          title: "습관어 줄이기",
          reason: "연결 표현이 반복됩니다.",
          action: "문장을 바로 시작해 보세요.",
          practiceTip: "추천 문장을 세 번 읽어 보세요.",
          scriptEdit: {
            originalText: "그러니까 기능을 설명합니다.",
            suggestedText: "기능을 설명합니다.",
            reason: "핵심이 더 분명해집니다.",
          },
        }],
        practicePlan: {
          title: "30초 연습",
          steps: ["추천 대본을 세 번 읽어 보세요."],
        },
        model: "gpt-test",
        policyVersion: 1,
        promptVersion: 1,
        generatedAt: "2026-07-17T00:00:31.000Z",
      },
    }).success).toBe(true);
  });

  it("requires the approved no-improvement message", () => {
    expect(slidePracticeReportSchema.safeParse({
      ...report,
      reportVersion: 2,
      coaching: {
        status: "not-needed",
        summary: "개선점이 없습니다.",
        issueCodes: [],
        items: [],
        practicePlan: null,
        model: null,
        policyVersion: 1,
        promptVersion: 1,
        generatedAt: null,
      },
    }).success).toBe(false);
  });
});

describe("slide practice server analysis contract", () => {
  it("accepts upload metadata but rejects transcript input", () => {
    const request = {
      clientRequestId: "request-1",
      practiceSessionId: "practice-1",
      deckId: "deck-1",
      deckVersion: 2,
      slideId: "slide-1",
      slideOrder: 0,
      startedAt: "2026-07-17T00:00:00.000Z",
      mimeType: "audio/webm",
      size: 1_024,
      deviceIdHash: "device-hash",
    } as const;
    expect(createSlidePracticeAnalysisRequestSchema.safeParse(request).success).toBe(true);
    expect(createSlidePracticeAnalysisRequestSchema.safeParse({
      ...request,
      transcript: "저장하면 안 되는 원문",
    }).success).toBe(false);
  });

  it("returns only bounded state and a derived report", () => {
    expect(slidePracticeAnalysisResultResponseSchema.safeParse({
      analysis: {
        analysisId: "analysis-1",
        projectId: "project-1",
        practiceSessionId: "practice-1",
        status: "processing",
        analysisJobId: "job-1",
        reportId: null,
        errorCode: null,
        createdAt: "2026-07-17T00:00:00.000Z",
        completedAt: null,
      },
      report: null,
    }).success).toBe(true);
    expect(slidePracticeAnalysisResultResponseSchema.safeParse({
      analysis: {
        analysisId: "analysis-1",
        projectId: "project-1",
        practiceSessionId: "practice-1",
        status: "processing",
        analysisJobId: "job-1",
        reportId: null,
        errorCode: null,
        createdAt: "2026-07-17T00:00:00.000Z",
        completedAt: null,
        audioFileId: "private-file",
      },
      report: null,
    }).success).toBe(false);
  });

  it("returns only transcript-memory evidence and derived graph samples", () => {
    expect(slidePracticeServerAudioResponseSchema.safeParse({
      transcript: "발표를 시작합니다",
      provider: "openai",
      meanRecognitionConfidence: null,
      voice: report.voice,
      loudnessSamples: [{ startMs: 0, endMs: 1_000, loudnessDb: -35 }],
      speedSamples: [{ startMs: 0, endMs: 5_000, syllablesPerSecond: 4 }],
    }).success).toBe(true);
  });
});

describe("findSlidePracticeCoachingIssues", () => {
  it("finds the five coaching dimensions using versioned thresholds", () => {
    expect(findSlidePracticeCoachingIssues({
      fillers: {
        ...report.fillers,
        details: [...report.fillers.details],
      },
      voice: {
        ...report.voice,
        syllablesPerSecond: 5.2,
        pauseRatio: 0.08,
        pitchSpanHz: 30,
        loudnessDb: -48,
      },
    })).toEqual([
      "filler-use",
      "pace-fast",
      "pause-low",
      "pitch-flat",
      "loudness-low",
    ]);
  });
});
