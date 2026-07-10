import { describe, expect, it } from "vitest";
import { maxRehearsalAudioUploadSizeBytes } from "../files/file.schema";
import {
  beginRehearsalAudioUploadRequestSchema,
  completeRehearsalAudioChunkUploadRequestSchema,
  completeRehearsalAudioUploadRequestSchema,
  createRehearsalRunRequestSchema,
  createRehearsalAudioUploadUrlRequestSchema,
  getRehearsalReportResponseSchema,
  rehearsalSemanticCueOutcomeSchema,
  rehearsalSemanticCueDecisionSchema,
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
    expect(run.deckVersion).toBeNull();
    expect(run.evaluationSnapshot).toBeNull();
    expect(run.semanticEvaluationMode).toBe("full");
  });

  it("accepts cancelled runs without report processing fields", () => {
    const run = rehearsalRunSchema.parse({
      runId: "run_cancelled",
      projectId: "project_demo_1",
      deckId: "deck_demo_1",
      audioFileId: null,
      jobId: null,
      status: "cancelled",
      error: null,
      rawAudioDeletedAt: null,
      createdAt: "2026-06-29T00:00:00.000Z",
      updatedAt: "2026-06-29T00:00:10.000Z"
    });

    expect(run.status).toBe("cancelled");
  });
});

describe("createRehearsalRunRequestSchema", () => {
  it("defaults semantic evaluation to full and accepts an expected deck version", () => {
    expect(
      createRehearsalRunRequestSchema.parse({
        deckId: "deck_demo_1",
        expectedDeckVersion: 7
      })
    ).toEqual({
      deckId: "deck_demo_1",
      expectedDeckVersion: 7,
      semanticEvaluationMode: "full"
    });
  });

  it("accepts an explicit delivery-only run", () => {
    expect(
      createRehearsalRunRequestSchema.parse({
        deckId: "deck_demo_1",
        semanticEvaluationMode: "delivery-only"
      }).semanticEvaluationMode
    ).toBe("delivery-only");
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
      utteranceOutcomes: [
        { slideId: "slide_1", kind: "covered", sentenceId: "sentence_1" },
        { slideId: "slide_1", kind: "ad-lib", text: "짧은 추가 설명" }
      ],
      semanticCueDecisions: [
        {
          slideId: "slide_1",
          cueId: "scue_1",
          label: "covered",
          finalScore: 0.91,
          lexicalScore: 0.2,
          conceptCoverage: 0.75,
          entailmentScore: 0.94,
          neutralScore: 0.05,
          contradictionScore: 0.01,
          premise: "처음엔 세일즈에 돈이 많이 들어 고객 한 명 데려오는 비용이 컸습니다",
          hypothesis: "고객 획득 비용이 초기 영업 비용 때문에 높다",
          provider: "mock",
          modelId: "test-nli",
          reasonCodes: ["nli-entailment"],
          at: "2026-07-02T00:00:20.000Z"
        }
      ],
      slideTimings: [{ slideId: "slide_1", targetSeconds: 60, actualSeconds: 52 }],
      slideInsights: [{ slideId: "slide_1", fillerWordCount: 2, pauseCount: 1 }],
      qnaSummary: {
        questionCount: 1,
        questionSummary: "가격 정책 질문이 있었습니다.",
        unclearTopics: [{ topic: "가격 정책", slideId: "slide_1" }]
      },
      aiSummary: {
        headline: "도입부 핵심 메시지가 약했습니다.",
        paragraphs: [
          "발표 흐름은 안정적이었지만 Opening에서 ORBIT 키워드가 빠졌습니다.",
          "다음 연습에서는 도입부 핵심 문장을 먼저 고정해야 합니다."
        ]
      }
    });

    expect(report.speedSamples).toHaveLength(1);
    expect(report.fillerWordDetails[0]?.word).toBe("음");
    expect(report.pauseDetails[0]?.durationSeconds).toBe(1.5);
    expect(report.missedKeywords[0]?.keywordId).toBe("kw_1");
    expect(report.utteranceOutcomes.map((outcome) => outcome.kind)).toEqual([
      "covered",
      "ad-lib"
    ]);
    expect(report.semanticCueDecisions[0]?.cueId).toBe("scue_1");
    expect(report.slideTimings[0]?.actualSeconds).toBe(52);
    expect(report.slideInsights[0]?.fillerWordCount).toBe(2);
    expect(report.qnaSummary.questionCount).toBe(1);
    expect(report.aiSummary?.headline).toBe("도입부 핵심 메시지가 약했습니다.");
  });

  it("defaults optional official detail sections to empty values", () => {
    const report = rehearsalReportSchema.parse(rehearsalReportFixture());

    expect(report.speedSamples).toEqual([]);
    expect(report.missedKeywords).toEqual([]);
    expect(report.utteranceOutcomes).toEqual([]);
    expect(report.semanticCueDecisions).toEqual([]);
    expect(report.semanticCueOutcomes).toEqual([]);
    expect(report.semanticEvaluation).toEqual({
      state: "unavailable",
      measurementMode: "none",
      reasons: ["evaluation_not_run"],
      retryable: false
    });
    expect(report.metrics.keywordCoverageMeasurement).toEqual({
      state: "measured"
    });
    expect(report.slideTimings).toEqual([]);
    expect(report.slideInsights).toEqual([]);
    expect(report.qnaSummary).toEqual({
      questionCount: 0,
      questionSummary: "",
      unclearTopics: []
    });
    expect(report.aiSummary).toBeUndefined();
  });

  it("accepts a canonical measured semantic cue outcome", () => {
    const report = rehearsalReportSchema.parse({
      ...rehearsalReportFixture(),
      semanticEvaluation: {
        state: "succeeded",
        measurementMode: "full",
        reasons: [],
        retryable: false
      },
      semanticCueOutcomes: [
        semanticCueOutcome({
          status: "covered",
          measurementMode: "full",
          matchedBy: "post_run_semantic",
          evidence: {
            excerpt: "  고객 획득 비용은\n초기 영업 비용 때문에 높았습니다.  ",
            startMs: 1200,
            endMs: 4800
          }
        })
      ]
    });

    expect(report.semanticCueOutcomes[0]?.evidence?.excerpt).toBe(
      "고객 획득 비용은 초기 영업 비용 때문에 높았습니다."
    );
  });
});

describe("rehearsalSemanticCueOutcomeSchema", () => {
  it("requires an explicit reason for unmeasured outcomes", () => {
    const missingReason = rehearsalSemanticCueOutcomeSchema.safeParse(
      semanticCueOutcome({ status: "unmeasured", measurementMode: "none" })
    );
    const measuredUnmeasured = rehearsalSemanticCueOutcomeSchema.safeParse(
      semanticCueOutcome({
        status: "unmeasured",
        measurementMode: "full",
        unmeasuredReason: "no_transcript"
      })
    );

    expect(missingReason.success).toBe(false);
    expect(measuredUnmeasured.success).toBe(false);
  });

  it("allows missed only after full measurement", () => {
    const none = rehearsalSemanticCueOutcomeSchema.safeParse(
      semanticCueOutcome({ status: "missed", measurementMode: "none" })
    );
    const basic = rehearsalSemanticCueOutcomeSchema.safeParse(
      semanticCueOutcome({ status: "missed", measurementMode: "basic" })
    );
    const full = rehearsalSemanticCueOutcomeSchema.safeParse(
      semanticCueOutcome({ status: "missed", measurementMode: "full" })
    );

    expect(none.success).toBe(false);
    expect(basic.success).toBe(false);
    expect(full.success).toBe(true);
  });

  it("allows basic mode only for positive covered or partial evidence", () => {
    expect(
      rehearsalSemanticCueOutcomeSchema.safeParse(
        semanticCueOutcome({ status: "covered", measurementMode: "basic" })
      ).success
    ).toBe(true);
    expect(
      rehearsalSemanticCueOutcomeSchema.safeParse(
        semanticCueOutcome({ status: "partial", measurementMode: "basic" })
      ).success
    ).toBe(true);
    expect(
      rehearsalSemanticCueOutcomeSchema.safeParse(
        semanticCueOutcome({ status: "excluded", measurementMode: "basic" })
      ).success
    ).toBe(false);
  });

  it("requires fallback reasons and keeps excluded outcomes evidence-free", () => {
    const fallbackWithoutReason = rehearsalSemanticCueOutcomeSchema.safeParse(
      semanticCueOutcome({ fallbackUsed: true })
    );
    const excludedWithEvidence = rehearsalSemanticCueOutcomeSchema.safeParse(
      semanticCueOutcome({
        status: "excluded",
        measurementMode: "none",
        evidence: { excerpt: "저장하면 안 되는 근거", startMs: 0, endMs: 10 }
      })
    );
    const excluded = rehearsalSemanticCueOutcomeSchema.safeParse(
      semanticCueOutcome({ status: "excluded", measurementMode: "none" })
    );

    expect(fallbackWithoutReason.success).toBe(false);
    expect(excludedWithEvidence.success).toBe(false);
    expect(excluded.success).toBe(true);
  });
});

describe("rehearsalSemanticCueDecisionSchema", () => {
  it("normalizes legacy NLI decisions and requires a visible fallback reason", () => {
    const legacy = rehearsalSemanticCueDecisionSchema.parse({
      slideId: "slide_1",
      cueId: "scue_1",
      label: "covered",
      finalScore: 0.9,
      provider: "mock",
      reasonCodes: ["nli-entailment"]
    });
    const invalidFallback = rehearsalSemanticCueDecisionSchema.safeParse({
      ...legacy,
      fallbackUsed: true,
      fallbackReason: undefined
    });

    expect(legacy).toMatchObject({
      matchedBy: "nli",
      measurementMode: "full",
      fallbackUsed: false
    });
    expect(invalidFallback.success).toBe(false);
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
      slideTimeline: [{ slideId: "slide_1", enteredAt: "2026-07-02T00:00:00.000Z" }],
      missedKeywords: [{ slideId: "slide_1", keywordId: "kw_1" }],
      adviceEvents: [{ type: "pace-too-fast", at: "2026-07-02T00:00:30.000Z" }]
    });

    expect(meta.slideTimeline).toHaveLength(1);
  });

  it("accepts bounded utterance outcomes for coverage, ad-lib, and missed script sentences", () => {
    const meta = rehearsalRunMetaSchema.parse({
      utteranceOutcomes: [
        {
          slideId: "slide_1",
          kind: "covered",
          sentenceId: "sentence_1",
          similarity: 0.98,
          lexicalOverlap: 0.75,
          at: "2026-07-02T00:00:10.000Z"
        },
        {
          slideId: "slide_1",
          kind: "paraphrased",
          sentenceId: "sentence_2",
          similarity: 0.92,
          lexicalOverlap: 0.2,
          at: "2026-07-02T00:00:20.000Z"
        },
        {
          slideId: "slide_1",
          kind: "ad-lib",
          text: "이 부분은 실제 고객 미팅에서 들었던 추가 사례입니다.",
          similarity: 0.87,
          at: "2026-07-02T00:00:30.000Z"
        },
        {
          slideId: "slide_2",
          kind: "missed",
          sentenceId: "sentence_3"
        }
      ]
    });

    expect(meta.utteranceOutcomes.map((outcome) => outcome.kind)).toEqual([
      "covered",
      "paraphrased",
      "ad-lib",
      "missed"
    ]);
  });

  it("accepts bounded semantic cue NLI evidence", () => {
    const meta = rehearsalRunMetaSchema.parse({
      semanticCueDecisions: [
        {
          slideId: "slide_1",
          cueId: "scue_1",
          label: "covered",
          finalScore: 0.9,
          embeddingScore: 0.72,
          lexicalScore: 0.1,
          conceptCoverage: 0.66,
          entailmentScore: 0.93,
          neutralScore: 0.06,
          contradictionScore: 0.01,
          premise: "처음엔 세일즈에 돈이 많이 들어 고객 한 명 데려오는 비용이 컸습니다",
          hypothesis: "고객 획득 비용이 초기 영업 비용 때문에 높다",
          provider: "mock",
          modelId: "test-nli",
          reasonCodes: ["ad-lib-candidate", "nli-entailment"],
          at: "2026-07-02T00:00:30.000Z"
        }
      ]
    });

    expect(meta.semanticCueDecisions[0]?.label).toBe("covered");
  });

  it("defaults utterance outcomes to an empty list for existing run meta payloads", () => {
    const meta = rehearsalRunMetaSchema.parse({
      slideTimeline: [],
      missedKeywords: [],
      adviceEvents: []
    });

    expect(meta.utteranceOutcomes).toEqual([]);
    expect(meta.semanticCueDecisions).toEqual([]);
    expect(meta.semanticCapabilityEvents).toEqual([]);
  });

  it("deduplicates bounded capability cue IDs without accepting sensitive fields", () => {
    const meta = rehearsalRunMetaSchema.parse({
      semanticCapabilityEvents: [
        {
          eventId: "cap_1",
          capability: "nli",
          fromState: "available",
          toState: "degraded",
          reason: "timeout",
          measurementMode: "basic",
          retryable: true,
          slideId: "slide_1",
          cueIds: ["scue_1", "scue_1"],
          provider: "browser-transformersjs",
          latencyMs: 1500,
          at: "2026-07-02T00:00:30.000Z"
        }
      ]
    });
    const sensitive = rehearsalRunMetaSchema.safeParse({
      semanticCapabilityEvents: [
        {
          eventId: "cap_2",
          capability: "nli",
          fromState: "available",
          toState: "unavailable",
          reason: "runtime_error",
          measurementMode: "none",
          retryable: false,
          cueIds: [],
          at: "2026-07-02T00:00:30.000Z",
          transcript: "민감한 전사 원문"
        }
      ]
    });

    expect(meta.semanticCapabilityEvents[0]?.cueIds).toEqual(["scue_1"]);
    expect(sensitive.success).toBe(false);
  });

  it("requires capability failure reasons and an explicit recovery source state", () => {
    const noFailureReason = rehearsalRunMetaSchema.safeParse({
      semanticCapabilityEvents: [
        {
          eventId: "cap_1",
          capability: "stt",
          fromState: "available",
          toState: "unavailable",
          measurementMode: "none",
          retryable: true,
          cueIds: [],
          at: "2026-07-02T00:00:30.000Z"
        }
      ]
    });
    const noRecoverySource = rehearsalRunMetaSchema.safeParse({
      semanticCapabilityEvents: [
        {
          eventId: "cap_2",
          capability: "stt",
          fromState: null,
          toState: "available",
          measurementMode: "full",
          retryable: false,
          cueIds: [],
          at: "2026-07-02T00:00:31.000Z"
        }
      ]
    });

    expect(noFailureReason.success).toBe(false);
    expect(noRecoverySource.success).toBe(false);
  });

  it("rejects oversized semantic cue premise and hypothesis evidence", () => {
    const result = rehearsalRunMetaSchema.safeParse({
      semanticCueDecisions: [
        {
          slideId: "slide_1",
          cueId: "scue_1",
          label: "covered",
          finalScore: 0.9,
          premise: "가".repeat(601),
          hypothesis: "나".repeat(301),
          provider: "mock",
          reasonCodes: ["nli-entailment"]
        }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("rejects oversized ad-lib utterance text", () => {
    const result = rehearsalRunMetaSchema.safeParse({
      utteranceOutcomes: [
        {
          slideId: "slide_1",
          kind: "ad-lib",
          text: "가".repeat(601)
        }
      ]
    });

    expect(result.success).toBe(false);
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
    slideInsights: [],
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

function semanticCueOutcome(
  patch: Partial<Parameters<typeof rehearsalSemanticCueOutcomeSchema.parse>[0]> = {}
) {
  return {
    slideId: "slide_1",
    cueId: "scue_1",
    cueRevision: 1,
    cueMeaningSnapshot: "고객 획득 비용이 초기 영업 비용 때문에 높다",
    reportLabelSnapshot: "초기 영업 비용이 높인 CAC",
    importance: "core",
    status: "covered",
    measurementMode: "full",
    fallbackUsed: false,
    coveredConcepts: ["고객 획득 비용", "초기 영업 비용"],
    missingConcepts: [],
    ...patch
  };
}
