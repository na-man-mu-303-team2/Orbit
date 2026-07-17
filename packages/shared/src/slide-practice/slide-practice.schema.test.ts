import { describe, expect, it } from "vitest";

import {
  createSlidePracticeAnalysisRequestSchema,
  createSlidePracticeReportRequestSchema,
  slidePracticeAnalysisResultResponseSchema,
  slidePracticeReportListResponseSchema,
  slidePracticeReportRecordSchema,
  slidePracticeReportSchema,
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
});
