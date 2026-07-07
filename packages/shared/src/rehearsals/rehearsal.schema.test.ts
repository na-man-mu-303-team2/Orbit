import { describe, expect, it } from "vitest";
import { maxRehearsalAudioUploadSizeBytes } from "../files/file.schema";
import {
  beginRehearsalAudioUploadRequestSchema,
  completeRehearsalAudioChunkUploadRequestSchema,
  completeRehearsalAudioUploadRequestSchema,
  createRehearsalAudioUploadUrlRequestSchema,
  getRehearsalReportResponseSchema,
  getRehearsalSummaryResponseSchema,
  rehearsalRunMetaSchema,
  rehearsalReportSchema,
  rehearsalRunSchema,
  uploadRehearsalAudioChunkParamsSchema
} from "./rehearsal.schema";

describe("rehearsalRunSchema", () => {
  it("accepts deleted raw audio tracking on completed runs", () => {
    const run = rehearsalRunSchema.parse({
      runId: "run_1",
      projectId: "project_demo_1",
      deckId: "deck_demo_1",
      audioFileId: "file_audio_1",
      jobId: "job_1",
      status: "succeeded",
      error: null,
      rawAudioDeletedAt: "2026-06-29T00:00:10.000Z",
      createdAt: "2026-06-29T00:00:00.000Z",
      updatedAt: "2026-06-29T00:00:10.000Z"
    });

    expect(run.status).toBe("succeeded");
    expect(run.rawAudioDeletedAt).toBe("2026-06-29T00:00:10.000Z");
  });
});

describe("rehearsalReportSchema", () => {
  it("accepts a report without retaining the raw transcript", () => {
    const report = rehearsalReportSchema.parse(rehearsalReportFixture());

    expect(report.transcriptRetained).toBe(false);
    expect(report.transcript).toBeNull();
  });

  it("rejects transcript content when retention is disabled", () => {
    const result = rehearsalReportSchema.safeParse({
      ...rehearsalReportFixture(),
      transcriptRetained: false,
      transcript: "민감한 전사 원문"
    });

    expect(result.success).toBe(false);
  });

  it("rejects provisional 0-100 score fields before ORBIT-37 defines the formula", () => {
    const topLevelScore = rehearsalReportSchema.safeParse({
      ...rehearsalReportFixture(),
      score: 88
    });
    const metricScores = rehearsalReportSchema.safeParse({
      ...rehearsalReportFixture(),
      metrics: {
        ...rehearsalReportFixture().metrics,
        deliveryScore: 91,
        speedScore: 84
      }
    });

    expect(topLevelScore.success).toBe(false);
    expect(metricScores.success).toBe(false);
  });

  it("accepts worker-generated report detail fields without 0-100 scores", () => {
    const report = rehearsalReportSchema.parse({
      ...rehearsalReportFixture(),
      speedSamples: [{ startSecond: 0, endSecond: 5, wordsPerMinute: 120 }],
      fillerWordDetails: [{ word: "음", count: 2 }],
      pauseDetails: [{ startSecond: 2, endSecond: 3.5, durationSeconds: 1.5 }],
      missedKeywords: [{ slideId: "slide_1", keywordId: "kw_1", text: "ORBIT" }],
      slideTimings: [{ slideId: "slide_1", targetSeconds: 60, actualSeconds: 52 }],
      qnaSummary: {
        questionCount: 1,
        questionSummary: "가격 정책 질문이 있었습니다.",
        unclearTopics: [{ topic: "가격 정책", slideId: "slide_1" }]
      }
    });

    expect(report.speedSamples).toHaveLength(1);
    expect(report.fillerWordDetails[0]?.word).toBe("음");
    expect(report.pauseDetails[0]?.durationSeconds).toBe(1.5);
    expect(report.missedKeywords[0]?.keywordId).toBe("kw_1");
    expect(report.missedKeywords[0]?.keywordRole).toBe("required-message");
    expect(report.slideTimings[0]?.actualSeconds).toBe(52);
    expect(report.qnaSummary.questionCount).toBe(1);
  });

  it("defaults optional official detail sections to empty values", () => {
    const report = rehearsalReportSchema.parse(rehearsalReportFixture());

    expect(report.speedSamples).toEqual([]);
    expect(report.missedKeywords).toEqual([]);
    expect(report.slideTimings).toEqual([]);
    expect(report.qnaSummary).toEqual({
      questionCount: 0,
      questionSummary: "",
      unclearTopics: []
    });
  });
});

describe("getRehearsalReportResponseSchema", () => {
  it("allows report to be null while the run is not ready", () => {
    const response = getRehearsalReportResponseSchema.parse({
      run: {
        runId: "run_1",
        projectId: "project_demo_1",
        deckId: "deck_demo_1",
        audioFileId: "file_audio_1",
        jobId: "job_1",
        status: "processing",
        error: null,
        rawAudioDeletedAt: null,
        createdAt: "2026-06-29T00:00:00.000Z",
        updatedAt: "2026-06-29T00:00:05.000Z"
      },
      report: null
    });

    expect(response.run.status).toBe("processing");
    expect(response.report).toBeNull();
  });
});

describe("createRehearsalAudioUploadUrlRequestSchema", () => {
  it("accepts audio MIME types without exposing purpose in the request", () => {
    const request = createRehearsalAudioUploadUrlRequestSchema.parse({
      originalName: "rehearsal.webm",
      mimeType: "audio/webm",
      size: maxRehearsalAudioUploadSizeBytes
    });

    expect(request.mimeType).toBe("audio/webm");
  });

  it("accepts report STT MIME aliases including FLAC", () => {
    for (const mimeType of ["audio/mp3", "audio/flac", "audio/x-m4a"] as const) {
      const request = createRehearsalAudioUploadUrlRequestSchema.parse({
        originalName: "rehearsal.audio",
        mimeType,
        size: 1024
      });

      expect(request.mimeType).toBe(mimeType);
    }
  });

  it("rejects non-audio MIME types", () => {
    const result = createRehearsalAudioUploadUrlRequestSchema.safeParse({
      originalName: "slides.pdf",
      mimeType: "application/pdf",
      size: 1024
    });

    expect(result.success).toBe(false);
  });

  it("rejects MIME types outside the rehearsal audio contract", () => {
    for (const mimeType of ["audio/ogg"] as const) {
      const result = createRehearsalAudioUploadUrlRequestSchema.safeParse({
        originalName: "rehearsal.audio",
        mimeType,
        size: 1024
      });

      expect(result.success).toBe(false);
    }
  });

  it("defers runtime upload size limits to the service schema", () => {
    const request = createRehearsalAudioUploadUrlRequestSchema.parse({
      originalName: "rehearsal.webm",
      mimeType: "audio/webm",
      size: maxRehearsalAudioUploadSizeBytes + 1
    });

    expect(request.size).toBe(maxRehearsalAudioUploadSizeBytes + 1);
  });
});

describe("beginRehearsalAudioUploadRequestSchema", () => {
  it("accepts only the FLAC chunk profile used by the presenter recorder", () => {
    const request = beginRehearsalAudioUploadRequestSchema.parse({
      codec: "flac",
      sampleRate: 16000,
      channels: 1,
      chunkDurationMs: 30000
    });

    expect(request.codec).toBe("flac");
  });

  it.each([
    ["sampleRate", 48000],
    ["channels", 2],
    ["chunkDurationMs", 10000]
  ])("rejects unsupported chunk %s", (field, value) => {
    const result = beginRehearsalAudioUploadRequestSchema.safeParse({
      codec: "flac",
      sampleRate: 16000,
      channels: 1,
      chunkDurationMs: 30000,
      [field]: value
    });

    expect(result.success).toBe(false);
  });
});

describe("uploadRehearsalAudioChunkParamsSchema", () => {
  it("accepts a runId and zero-based chunk index", () => {
    const params = uploadRehearsalAudioChunkParamsSchema.parse({
      runId: "run_1",
      index: "0"
    });

    expect(params.index).toBe(0);
  });

  it("rejects negative chunk indexes", () => {
    const result = uploadRehearsalAudioChunkParamsSchema.safeParse({
      runId: "run_1",
      index: -1
    });

    expect(result.success).toBe(false);
  });
});

describe("completeRehearsalAudioUploadRequestSchema", () => {
  it("keeps the legacy complete request as fileId for upload-url compatibility", () => {
    const request = completeRehearsalAudioUploadRequestSchema.parse({
      fileId: "file_audio_1"
    });

    expect(request.fileId).toBe("file_audio_1");
  });
});

describe("completeRehearsalAudioChunkUploadRequestSchema", () => {
  it("accepts the final chunk manifest", () => {
    const manifest = completeRehearsalAudioChunkUploadRequestSchema.parse({
      chunkCount: 3,
      totalDurationMs: 90000,
      totalSizeBytes: 1024,
      sha256: "a".repeat(64)
    });

    expect(manifest.chunkCount).toBe(3);
  });

  it.each([
    ["chunkCount", 0],
    ["totalDurationMs", 0],
    ["totalSizeBytes", 0],
    ["sha256", "not-a-sha"]
  ])("rejects invalid complete manifest %s", (field, value) => {
    const result = completeRehearsalAudioChunkUploadRequestSchema.safeParse({
      chunkCount: 3,
      totalDurationMs: 90000,
      totalSizeBytes: 1024,
      sha256: "a".repeat(64),
      [field]: value
    });

    expect(result.success).toBe(false);
  });
});

describe("rehearsalRunMetaSchema", () => {
  it("accepts slide timeline, missed keywords, and advice events", () => {
    const meta = rehearsalRunMetaSchema.parse({
      endedAt: "2026-07-02T00:02:00.000Z",
      slideTimeline: [{ slideId: "slide_1", enteredAt: "2026-07-02T00:00:00.000Z" }],
      missedKeywords: [{ slideId: "slide_1", keywordId: "kw_1" }],
      adviceEvents: [{ type: "pace-too-fast", at: "2026-07-02T00:00:30.000Z" }]
    });

    expect(meta.slideTimeline).toHaveLength(1);
    expect(meta.endedAt).toBe("2026-07-02T00:02:00.000Z");
  });

  it.each(["transcript", "speakerNotes", "rawAudio", "script"])(
    "rejects sensitive run meta field %s",
    (field) => {
      const result = rehearsalRunMetaSchema.safeParse({
        slideTimeline: [],
        missedKeywords: [],
        adviceEvents: [],
        [field]: "민감한 원문"
      });

      expect(result.success).toBe(false);
    }
  );
});

describe("getRehearsalSummaryResponseSchema", () => {
  it("accepts run-level rehearsal trend summaries", () => {
    const response = getRehearsalSummaryResponseSchema.parse({
      summary: {
        projectId: "project_demo_1",
        deckId: "deck_demo_1",
        currentRunId: "run_2",
        runCount: 2,
        runs: [
          {
            runId: "run_1",
            generatedAt: "2026-07-02T00:00:00.000Z",
            durationSeconds: 90,
            missedKeywordCount: 1,
            slideTimingCount: 1
          }
        ],
        slides: [
          {
            slideId: "slide_1",
            sampleCount: 2,
            averageActualSeconds: 55,
            currentActualSeconds: 60,
            deltaFromAverageSeconds: 5,
            repeatedMissedKeywords: [
              {
                slideId: "slide_1",
                keywordId: "kw_1",
                text: "ORBIT",
                missCount: 2
              }
            ]
          }
        ]
      }
    });

    expect(response.summary.slides[0]?.repeatedMissedKeywords[0]?.keywordRole).toBe(
      "required-message"
    );
  });
});

function rehearsalReportFixture() {
  return {
    reportId: "report_run_1",
    runId: "run_1",
    projectId: "project_demo_1",
    deckId: "deck_demo_1",
    transcriptRetained: false,
    transcript: null,
    metrics: {
      durationSeconds: 90,
      wordsPerMinute: 120,
      fillerWordCount: 2,
      pauseCount: 1,
      keywordCoverage: 0.75
    },
    coaching: {
      status: "succeeded",
      summary: "핵심 메시지가 분명합니다.",
      strengths: ["키워드를 언급했습니다."],
      improvements: ["불필요한 filler를 줄이세요."],
      nextPracticeFocus: "도입부를 더 짧게 연습하세요.",
      message: ""
    },
    generatedAt: "2026-06-29T00:00:10.000Z"
  };
}
