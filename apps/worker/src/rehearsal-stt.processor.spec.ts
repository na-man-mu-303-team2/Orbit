import type { StoragePort } from "@orbit/storage";
import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processRehearsalSttJob } from "./rehearsal-stt.processor";

const payload = {
  jobId: "job-1",
  projectId: "project-a",
  runId: "run-a",
  deckId: "deck-a",
  audioFileId: "file-audio"
};

const assetRow = {
  file_id: "file-audio",
  project_id: "project-a",
  storage_key: "projects/project-a/assets/file-audio/rehearsal.webm",
  mime_type: "audio/webm",
  original_name: "rehearsal.webm",
  purpose: "rehearsal-audio",
  status: "uploaded"
};

const deckRow = {
  version: 1,
  deck_json: {
    deckId: "deck_a",
    projectId: "project-a",
    title: "deck",
    version: 1,
    metadata: {
      language: "ko",
      locale: "ko-KR",
      sourceType: "manual"
    },
    theme: {
      accentColor: "#2563eb",
      backgroundColor: "#ffffff",
      textColor: "#111827",
      fontFamily: "Pretendard",
      typography: {
        titleFontFamily: "Pretendard",
        bodyFontFamily: "Pretendard",
        titleSize: 32,
        bodySize: 18
      }
    },
    canvas: {
      preset: "wide-16-9",
      width: 1920,
      height: 1080,
      aspectRatio: "16:9"
    },
    slides: [
      {
        slideId: "slide_1",
        order: 1,
        title: "slide",
        estimatedSeconds: 60,
        notes: "",
        style: {},
        elements: [],
        animations: [],
        actions: [],
        keywords: [
          {
            keywordId: "kw_1",
            text: "ORBIT",
            synonyms: ["오르빗"],
            abbreviations: []
          }
        ]
      },
      {
        slideId: "slide_2",
        order: 2,
        title: "next slide",
        estimatedSeconds: 60,
        notes: "",
        style: {},
        elements: [],
        animations: [],
        keywords: []
      }
    ]
  }
};

describe("processRehearsalSttJob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("transcribes, analyzes, deletes raw audio, and stores results", async () => {
    const query = createQueryMock()
      .mockResolvedValueOnce([jobRow("running", 10, null, null)])
      .mockResolvedValueOnce([runRow()])
      .mockResolvedValueOnce([assetRow])
      .mockResolvedValueOnce([deckRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([runMetaRow()])
      .mockResolvedValueOnce([jobRow("running", 30, null, null)])
      .mockResolvedValueOnce([jobRow("running", 65, null, null)])
      .mockResolvedValueOnce([jobRow("running", 85, null, null)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([runRow()])
      .mockResolvedValueOnce([
        jobRow(
          "succeeded",
          100,
          {
            transcriptRetained: false,
            transcript: null,
            report: {
              reportId: "report_run-a",
              transcriptRetained: false,
              transcript: null
            },
            rawAudioDeletedAt: "2026-06-27T00:00:02.000Z"
          },
          null
        )
      ]);
    const storage = createStorage();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              runId: "run-a",
              projectId: "project-a",
              fileId: "file-audio",
              transcript: "안녕하세요 ORBIT 발표입니다",
              language: "ko-KR",
              provider: "fake",
              model: "fake-transcriber",
              durationSeconds: 90,
              segments: [{ text: "안녕하세요 ORBIT 발표입니다" }]
            })
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              runId: "run-a",
              wordsPerMinute: 120,
              fillerWordCount: 1,
              pauseCount: 0,
              keywordCoverage: 0.5,
              speedSamples: [{ startSecond: 0, endSecond: 3.5, wordsPerMinute: 120 }],
              fillerWordDetails: [{ word: "음", count: 1 }],
              pauseDetails: [{ startSecond: 1, endSecond: 2.2, durationSeconds: 1.2 }],
              missedKeywords: [{ slideId: "slide_1", keywordId: "kw_1", text: "ORBIT" }],
              aiSummary: {
                headline: "도입부 핵심 메시지가 약했습니다.",
                paragraphs: [
                  "발표 흐름은 안정적이었지만 ORBIT 키워드가 빠졌습니다.",
                  "다음 연습에서는 도입부 핵심 문장을 고정하세요."
                ]
              },
              coaching: { status: "succeeded", summary: "clear" }
            })
          )
        )
    );

    const job = await processRehearsalSttJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("succeeded");
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8000/audio/transcribe",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8000/rehearsal/analyze",
      expect.objectContaining({ method: "POST" })
    );
    expect(storage.removeObject).toHaveBeenCalledWith(assetRow.storage_key);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE project_assets"),
      expect.arrayContaining(["file-audio", "project-a"])
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("report_json"),
      expect.arrayContaining([
        expect.stringContaining('"reportId":"report_run-a"'),
        expect.stringContaining('"speedSamples":[{"startSecond":0,"endSecond":3.5,"wordsPerMinute":120}]'),
        expect.stringContaining('"missedKeywords":[{"slideId":"slide_1","keywordId":"kw_1","text":"ORBIT"}]'),
        expect.stringContaining('"slideTimings":[{"slideId":"slide_1","targetSeconds":60,"actualSeconds":45}]'),
        false
      ])
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE jobs"),
      expect.arrayContaining([
        "job-1",
        "succeeded",
        100,
        "리포트 생성 완료",
        expect.objectContaining({
          transcriptRetained: false,
          transcript: null,
          segmentCount: 1,
            report: expect.objectContaining({
              reportId: "report_run-a",
              transcriptRetained: false,
              transcript: null,
              aiSummary: {
                headline: "도입부 핵심 메시지가 약했습니다.",
                paragraphs: [
                  "발표 흐름은 안정적이었지만 ORBIT 키워드가 빠졌습니다.",
                  "다음 연습에서는 도입부 핵심 문장을 고정하세요."
                ]
              },
              fillerWordDetails: [{ word: "음", count: 1 }],
              pauseDetails: [{ startSecond: 1, endSecond: 2.2, durationSeconds: 1.2 }]
            })
        }),
        null
      ])
    );
  });

  it("replays patch-only deck updates before rehearsal analysis", async () => {
    const updatedKeywordPatchOperations = [
      {
        type: "replace_keywords",
        slideId: "slide_1",
        keywords: [
          {
            keywordId: "kw_1",
            text: "LATEST",
            synonyms: ["최신"],
            abbreviations: []
          }
        ]
      }
    ];
    const query = createQueryMock()
      .mockResolvedValueOnce([jobRow("running", 10, null, null)])
      .mockResolvedValueOnce([runRow()])
      .mockResolvedValueOnce([assetRow])
      .mockResolvedValueOnce([{ ...deckRow, version: 1 }])
      .mockResolvedValueOnce([
        {
          project_id: "project-a",
          deck_id: "deck-a",
          before_version: 1,
          after_version: 2,
          source: "user",
          operations: updatedKeywordPatchOperations
        }
      ])
      .mockResolvedValueOnce([runMetaRow()])
      .mockResolvedValueOnce([jobRow("running", 30, null, null)])
      .mockResolvedValueOnce([jobRow("running", 65, null, null)])
      .mockResolvedValueOnce([jobRow("running", 85, null, null)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([runRow()])
      .mockResolvedValueOnce([
        jobRow(
          "succeeded",
          100,
          {
            transcriptRetained: false,
            transcript: null,
            report: {
              reportId: "report_run-a",
              transcriptRetained: false,
              transcript: null
            },
            rawAudioDeletedAt: "2026-06-27T00:00:02.000Z"
          },
          null
        )
      ]);
    const storage = createStorage();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            runId: "run-a",
            projectId: "project-a",
            fileId: "file-audio",
            transcript: "안녕하세요 LATEST 발표입니다",
            language: "ko-KR",
            provider: "fake",
            model: "fake-transcriber",
            durationSeconds: 3.5,
            segments: [{ text: "안녕하세요 LATEST 발표입니다" }]
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            runId: "run-a",
            wordsPerMinute: 120,
            fillerWordCount: 0,
            pauseCount: 0,
            keywordCoverage: 1
          })
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    await processRehearsalSttJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      payload
    );

    const analyzeCall = fetchMock.mock.calls[1];
    const analyzeBody = JSON.parse(String(analyzeCall?.[1]?.body));
    expect(analyzeBody.deckKeywords).toEqual([
      {
        slideId: "slide_1",
        keywordId: "kw_1",
        text: "LATEST",
        synonyms: ["최신"],
        abbreviations: [],
        required: true
      }
    ]);
  });

  it("builds slide timings from replayed deck patches", async () => {
    const addedSlide = {
      slideId: "slide_3",
      order: 3,
      title: "patched slide",
      estimatedSeconds: 30,
      notes: "",
      style: {},
      elements: [],
      animations: [],
      actions: [],
      keywords: []
    };
    const query = createQueryMock()
      .mockResolvedValueOnce([jobRow("running", 10, null, null)])
      .mockResolvedValueOnce([runRow()])
      .mockResolvedValueOnce([assetRow])
      .mockResolvedValueOnce([deckRow])
      .mockResolvedValueOnce([
        {
          project_id: "project-a",
          deck_id: "deck-a",
          before_version: 1,
          after_version: 2,
          source: "user",
          operations: [{ type: "add_slide", slide: addedSlide }]
        }
      ])
      .mockResolvedValueOnce([
        {
          meta_json: {
            slideTimeline: [
              { slideId: "slide_1", enteredAt: "2026-06-27T00:00:00.000Z" },
              { slideId: "slide_3", enteredAt: "2026-06-27T00:00:20.000Z" },
              { slideId: "slide_2", enteredAt: "2026-06-27T00:00:50.000Z" }
            ],
            missedKeywords: [],
            adviceEvents: []
          }
        }
      ])
      .mockResolvedValueOnce([jobRow("running", 30, null, null)])
      .mockResolvedValueOnce([jobRow("running", 65, null, null)])
      .mockResolvedValueOnce([jobRow("running", 85, null, null)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([runRow()])
      .mockResolvedValueOnce([
        jobRow(
          "succeeded",
          100,
          {
            transcriptRetained: false,
            transcript: null,
            report: {
              reportId: "report_run-a",
              transcriptRetained: false,
              transcript: null
            },
            rawAudioDeletedAt: "2026-06-27T00:00:02.000Z"
          },
          null
        )
      ]);
    const storage = createStorage();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              runId: "run-a",
              projectId: "project-a",
              fileId: "file-audio",
              transcript: "안녕하세요 ORBIT 발표입니다",
              language: "ko-KR",
              provider: "fake",
              model: "fake-transcriber",
              durationSeconds: 90,
              segments: [{ text: "안녕하세요 ORBIT 발표입니다" }]
            })
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              runId: "run-a",
              wordsPerMinute: 120,
              fillerWordCount: 0,
              pauseCount: 0,
              keywordCoverage: 1
            })
          )
        )
    );

    await processRehearsalSttJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      payload
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("report_json"),
      expect.arrayContaining([
        expect.stringContaining(
          '"slideTimings":[{"slideId":"slide_1","targetSeconds":60,"actualSeconds":20},{"slideId":"slide_3","targetSeconds":30,"actualSeconds":30}]'
        )
      ])
    );
  });

  it("does not re-add client-side missed keywords that transcript analysis matched", async () => {
    const query = createQueryMock()
      .mockResolvedValueOnce([jobRow("running", 10, null, null)])
      .mockResolvedValueOnce([runRow()])
      .mockResolvedValueOnce([assetRow])
      .mockResolvedValueOnce([deckRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          meta_json: {
            slideTimeline: [],
            missedKeywords: [{ slideId: "slide_1", keywordId: "kw_1" }],
            adviceEvents: []
          }
        }
      ])
      .mockResolvedValueOnce([jobRow("running", 30, null, null)])
      .mockResolvedValueOnce([jobRow("running", 65, null, null)])
      .mockResolvedValueOnce([jobRow("running", 85, null, null)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([runRow()])
      .mockResolvedValueOnce([jobRow("succeeded", 100, {}, null)]);
    const storage = createStorage();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              runId: "run-a",
              projectId: "project-a",
              fileId: "file-audio",
              transcript: "안녕하세요 ORBIT 발표입니다",
              language: "ko-KR",
              provider: "fake",
              model: "fake-transcriber",
              durationSeconds: 10,
              segments: [{ text: "안녕하세요 ORBIT 발표입니다" }]
            })
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              runId: "run-a",
              wordsPerMinute: 120,
              fillerWordCount: 0,
              pauseCount: 0,
              keywordCoverage: 1,
              missedKeywords: []
            })
          )
        )
    );

    await processRehearsalSttJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      payload
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("report_json"),
      expect.arrayContaining([expect.stringContaining('"missedKeywords":[]')])
    );
  });

  it("deletes raw audio and marks the job failed when STT fails", async () => {
    const query = createQueryMock()
      .mockResolvedValueOnce([jobRow("running", 10, null, null)])
      .mockResolvedValueOnce([runRow()])
      .mockResolvedValueOnce([assetRow])
      .mockResolvedValueOnce([deckRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([runMetaRow()])
      .mockResolvedValueOnce([jobRow("running", 30, null, null)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([runRow()])
      .mockResolvedValueOnce([
        jobRow("failed", 10, null, {
          code: "PYTHON_WORKER_STT_FAILED",
          message: "bad audio"
        })
      ]);
    const storage = createStorage();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad audio", { status: 500 }))
    );

    const job = await processRehearsalSttJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe("PYTHON_WORKER_STT_FAILED");
    expect(storage.removeObject).toHaveBeenCalledWith(assetRow.storage_key);
  });

  it("deletes raw audio and marks the job failed when analysis fails", async () => {
    const query = createQueryMock()
      .mockResolvedValueOnce([jobRow("running", 10, null, null)])
      .mockResolvedValueOnce([runRow()])
      .mockResolvedValueOnce([assetRow])
      .mockResolvedValueOnce([deckRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([runMetaRow()])
      .mockResolvedValueOnce([jobRow("running", 30, null, null)])
      .mockResolvedValueOnce([jobRow("running", 65, null, null)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([runRow()])
      .mockResolvedValueOnce([
        jobRow("failed", 60, null, {
          code: "PYTHON_WORKER_ANALYZE_FAILED",
          message: "analysis unavailable"
        })
      ]);
    const storage = createStorage();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              runId: "run-a",
              projectId: "project-a",
              fileId: "file-audio",
              transcript: "안녕하세요 ORBIT 발표입니다",
              language: "ko-KR",
              provider: "fake",
              model: "fake-transcriber",
              durationSeconds: 3.5,
              segments: [{ text: "안녕하세요 ORBIT 발표입니다" }]
            })
          )
        )
        .mockResolvedValueOnce(new Response("analysis unavailable", { status: 500 }))
    );

    const job = await processRehearsalSttJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe("PYTHON_WORKER_ANALYZE_FAILED");
    expect(storage.removeObject).toHaveBeenCalledWith(assetRow.storage_key);
  });

  it("marks deletion failure explicitly", async () => {
    const query = createQueryMock()
      .mockResolvedValueOnce([jobRow("running", 10, null, null)])
      .mockResolvedValueOnce([runRow()])
      .mockResolvedValueOnce([assetRow])
      .mockResolvedValueOnce([deckRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([runMetaRow()])
      .mockResolvedValueOnce([jobRow("running", 30, null, null)])
      .mockResolvedValueOnce([jobRow("running", 65, null, null)])
      .mockResolvedValueOnce([jobRow("running", 85, null, null)])
      .mockResolvedValueOnce([runRow()])
      .mockResolvedValueOnce([
        jobRow("failed", 85, null, {
          code: "RAW_AUDIO_DELETE_FAILED",
          message: "delete denied"
        })
      ]);
    const storage = createStorage();
    vi.mocked(storage.removeObject).mockRejectedValueOnce(new Error("delete denied"));
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              runId: "run-a",
              projectId: "project-a",
              fileId: "file-audio",
              transcript: "hello",
              language: "ko-KR",
              provider: "fake",
              model: "fake",
              durationSeconds: 1,
              segments: []
            })
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              runId: "run-a",
              wordsPerMinute: 60,
              fillerWordCount: 0,
              pauseCount: 0,
              keywordCoverage: 0
            })
          )
        )
    );

    const job = await processRehearsalSttJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe("RAW_AUDIO_DELETE_FAILED");
  });

  it("marks the job failed when report validation fails after deleting raw audio", async () => {
    const query = createQueryMock()
      .mockResolvedValueOnce([jobRow("running", 10, null, null)])
      .mockResolvedValueOnce([runRow()])
      .mockResolvedValueOnce([assetRow])
      .mockResolvedValueOnce([deckRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([runMetaRow()])
      .mockResolvedValueOnce([jobRow("running", 30, null, null)])
      .mockResolvedValueOnce([jobRow("running", 65, null, null)])
      .mockResolvedValueOnce([jobRow("running", 85, null, null)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([runRow()])
      .mockResolvedValueOnce([
        jobRow("failed", 85, null, {
          code: "REHEARSAL_REPORT_INVALID",
          message: "Invalid report"
        })
      ]);
    const storage = createStorage();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              runId: "run-a",
              projectId: "project-a",
              fileId: "file-audio",
              transcript: "안녕하세요 ORBIT 발표입니다",
              language: "ko-KR",
              provider: "fake",
              model: "fake-transcriber",
              durationSeconds: 3.5,
              segments: [{ text: "안녕하세요 ORBIT 발표입니다" }]
            })
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              runId: "run-a",
              wordsPerMinute: 120,
              fillerWordCount: 1,
              pauseCount: 0,
              keywordCoverage: 1,
              coaching: { status: "failed", summary: "bad coaching state" }
            })
          )
        )
    );

    const job = await processRehearsalSttJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe("REHEARSAL_REPORT_INVALID");
    expect(storage.removeObject).toHaveBeenCalledWith(assetRow.storage_key);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE rehearsal_runs"),
      expect.arrayContaining([
        "run-a",
        "failed",
        null,
        expect.objectContaining({ code: "REHEARSAL_REPORT_INVALID" }),
        expect.any(String)
      ])
    );
  });
});

function createQueryMock() {
  return vi.fn(async (sql: string, params?: unknown[]): Promise<unknown[] | undefined> => {
    if (sql.includes("UPDATE jobs")) {
      const [
        jobId = "job-1",
        status = "running",
        progress = 0,
        message = String(status),
        result = null,
        error = null
      ] = Array.isArray(params) ? params : [];

      return [
        jobRow(
          status as "running" | "succeeded" | "failed",
          typeof progress === "number" ? progress : 0,
          isRecord(result) ? result : null,
          isJobError(error) ? error : null,
          typeof message === "string" ? message : String(status) as "running" | "succeeded" | "failed",
          typeof jobId === "string" && jobId ? jobId : "job-1"
        )
      ];
    }

    if (sql.includes("UPDATE rehearsal_runs")) {
      return [runRow()];
    }

    if (sql.includes("UPDATE project_assets")) {
      return [];
    }

    return undefined;
  });
}

function createStorage() {
  return {
    getSignedReadUrl: vi.fn(async () => "http://localhost:9000/rehearsal.webm"),
    removeObject: vi.fn(async () => undefined)
  } as unknown as Pick<StoragePort, "getSignedReadUrl" | "removeObject">;
}

function jobRow(
  status: "running" | "succeeded" | "failed",
  progress: number,
  result: Record<string, unknown> | null,
  error: { code: string; message: string } | null,
  message: string = status,
  jobId = "job-1"
) {
  return {
    jobId,
    projectId: "project-a",
    type: "rehearsal-stt",
    status,
    progress,
    message,
    result,
    error,
    createdAt: "2026-06-27T00:00:00.000Z",
    updatedAt: "2026-06-27T00:00:01.000Z"
  };
}

function runRow() {
  return { run_id: "run-a" };
}

function runMetaRow() {
  return {
    meta_json: {
      slideTimeline: [
        { slideId: "slide_1", enteredAt: "2026-06-27T00:00:00.000Z" },
        { slideId: "slide_2", enteredAt: "2026-06-27T00:00:45.000Z" }
      ],
      missedKeywords: [],
      adviceEvents: []
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJobError(value: unknown): value is { code: string; message: string } {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    value.code.length > 0 &&
    typeof value.message === "string"
  );
}
