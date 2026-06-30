import { createDemoDeck } from "@orbit/editor-core";
import type { Job, RehearsalReport, RehearsalRun } from "@orbit/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  LiveSttAdapterError,
  RehearsalFlowError,
  RehearsalWorkspace,
  SherpaLiveSttAdapter,
  applyLiveTranscriptEvent,
  createLiveTranscriptBuffer,
  createRecordingFile,
  createRecordingSession,
  evaluateLiveTranscript,
  fetchRehearsalReport,
  fetchOrCreateRehearsalDeck,
  getLiveAudioLevelLabel,
  getLiveAudioLevelPercent,
  normalizeRecordingMimeType,
  normalizeLiveTranscriptText,
  rehearsalMicrophoneAudioConstraints,
  renderLiveTranscriptBuffer,
  requestRehearsalMicrophoneStream,
  runRehearsalUploadFlow,
  selectRecordingMimeType,
  shouldAutoAdvanceLiveSlide
} from "./RehearsalWorkspace";
import { resolveEditorAssetUrl } from "../editor/editorAssetUrl";

const createdAt = "2026-06-29T00:00:00.000Z";

describe("RehearsalWorkspace", () => {
  it("renders the current deck preview and notes", () => {
    const deck = createDemoDeck();
    const html = renderToStaticMarkup(<RehearsalWorkspace initialDeck={deck} />);

    expect(html).toContain("리허설");
    expect(html).toContain(deck.slides[0]?.title);
    expect(html).toContain("Live STT");
    expect(html).toContain("Live STT 시작");
    expect(html).toContain("Live STT 종료");
    expect(html).toContain("Live STT 시작을 눌러 테스트하세요");
    expect(html).toContain("Mic input");
    expect(html).toContain("입력 대기");
    expect(html).toContain("-100 dB RMS");
    expect(html).toContain("Report AI");
    expect(html).toContain("Speaker notes");
  });

  it("requests microphone audio with live STT input quality constraints", async () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const getUserMedia = vi.fn(async () => stream);

    const result = await requestRehearsalMicrophoneStream({
      getUserMedia
    } as unknown as Pick<MediaDevices, "getUserMedia">);

    expect(result).toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: rehearsalMicrophoneAudioConstraints
    });
  });

  it("labels live STT microphone input levels", () => {
    expect(getLiveAudioLevelLabel(null)).toBe("입력 대기");
    expect(getLiveAudioLevelPercent(null)).toBe(0);
    expect(
      getLiveAudioLevelLabel({
        type: "audio-level",
        rms: 0.001,
        peak: 0.01,
        rmsDb: -60,
        peakDb: -40,
        isLikelySilence: true
      })
    ).toBe("입력 낮음");
    expect(
      getLiveAudioLevelLabel({
        type: "audio-level",
        rms: 0.08,
        peak: 0.3,
        rmsDb: -22,
        peakDb: -10,
        isLikelySilence: false
      })
    ).toBe("입력 적정");
    expect(
      getLiveAudioLevelLabel({
        type: "audio-level",
        rms: 0.5,
        peak: 0.9,
        rmsDb: -6,
        peakDb: -2,
        isLikelySilence: false
      })
    ).toBe("입력 과대");
    expect(getLiveAudioLevelPercent({
      type: "audio-level",
      rms: 0.08,
      peak: 0.3,
      rmsDb: -22,
      peakDb: -10,
      isLikelySilence: false
    })).toBe(60);
  });

  it("renders report metrics without exposing a non-retained transcript", () => {
    const deck = createDemoDeck();
    const html = renderToStaticMarkup(
      <RehearsalWorkspace
        initialDeck={deck}
        initialReport={reportFixture({
          transcriptRetained: false,
          transcript: null
        })}
      />
    );

    expect(html).toContain("리허설 보고서");
    expect(html).toContain("120 wpm");
    expect(html).toContain("전사문 미보존");
    expect(html).not.toContain("민감한 전사 원문");
  });

  it("matches live STT keywords with normalized Korean aliases", () => {
    const slide = {
      ...createDemoDeck().slides[0]!,
      slideId: "slide_1",
      keywords: [
        {
          keywordId: "kw_1",
          text: "ORBIT",
          synonyms: ["오르빗"],
          abbreviations: []
        },
        {
          keywordId: "kw_2",
          text: "Live STT",
          synonyms: ["실시간 음성 인식"],
          abbreviations: ["stt"]
        }
      ]
    };

    const analysis = evaluateLiveTranscript(
      slide,
      "오늘은 오르빗 실시간음성인식 흐름을 확인합니다"
    );

    expect(normalizeLiveTranscriptText("실시간 음성 인식")).toBe("실시간음성인식");
    expect(analysis.coverage).toBe(1);
    expect(analysis.detectedKeywords.map((keyword) => keyword.keywordId)).toEqual(["kw_1", "kw_2"]);
    expect(analysis.missingKeywordIds).toEqual([]);
  });

  it("resolves slide thumbnails to same-origin asset URLs", () => {
    vi.stubGlobal("window", {
      location: {
        origin: "http://localhost:5173"
      }
    });

    expect(resolveEditorAssetUrl("/api/v1/projects/p1/assets/file_1/content")).toBe(
      "http://localhost:5173/api/v1/projects/p1/assets/file_1/content"
    );
    expect(
      resolveEditorAssetUrl(
        "http://localhost:9000/orbit-local/projects/project_real_1/assets/file_real_1/slide_1.png"
      )
    ).toBe(
      "http://localhost:5173/api/v1/projects/project_real_1/assets/file_real_1/content"
    );
    expect(resolveEditorAssetUrl("https://cdn.example.com/thumb.png")).toBe(
      "https://cdn.example.com/thumb.png"
    );
  });

  it("composes committed live STT finals with the current draft", () => {
    let buffer = createLiveTranscriptBuffer();

    buffer = applyLiveTranscriptEvent(buffer, {
      transcript: "오늘은",
      isFinal: false
    });
    expect(renderLiveTranscriptBuffer(buffer)).toBe("오늘은");

    buffer = applyLiveTranscriptEvent(buffer, {
      transcript: "오늘은",
      isFinal: true
    });
    expect(renderLiveTranscriptBuffer(buffer)).toBe("오늘은");

    buffer = applyLiveTranscriptEvent(buffer, {
      transcript: "오르빗",
      isFinal: false
    });

    expect(renderLiveTranscriptBuffer(buffer)).toBe("오늘은 오르빗");
    expect(renderLiveTranscriptBuffer(buffer)).not.toContain("오늘은 오늘은");
  });

  it("evaluates keywords across multiple committed live STT utterances", () => {
    const slide = {
      ...createDemoDeck().slides[0]!,
      slideId: "slide_1",
      keywords: [
        {
          keywordId: "kw_1",
          text: "ORBIT",
          synonyms: ["오르빗"],
          abbreviations: []
        },
        {
          keywordId: "kw_2",
          text: "Live STT",
          synonyms: ["실시간 음성 인식"],
          abbreviations: ["stt"]
        }
      ]
    };
    let buffer = createLiveTranscriptBuffer();

    buffer = applyLiveTranscriptEvent(buffer, {
      transcript: "오늘은 오르빗을 소개합니다",
      isFinal: true
    });
    buffer = applyLiveTranscriptEvent(buffer, {
      transcript: "실시간 음성 인식 흐름입니다",
      isFinal: true
    });

    const transcript = renderLiveTranscriptBuffer(buffer);
    const analysis = evaluateLiveTranscript(slide, transcript);

    expect(transcript).toBe("오늘은 오르빗을 소개합니다 실시간 음성 인식 흐름입니다");
    expect(analysis.coverage).toBe(1);
    expect(analysis.detectedKeywords.map((keyword) => keyword.keywordId)).toEqual([
      "kw_1",
      "kw_2"
    ]);
  });

  it("starts a fresh live STT transcript buffer after reset", () => {
    let buffer = createLiveTranscriptBuffer();
    buffer = applyLiveTranscriptEvent(buffer, {
      transcript: "이전 슬라이드 오르빗",
      isFinal: true
    });

    buffer = createLiveTranscriptBuffer();
    expect(renderLiveTranscriptBuffer(buffer)).toBe("");

    buffer = applyLiveTranscriptEvent(buffer, {
      transcript: "새 슬라이드",
      isFinal: false
    });
    expect(renderLiveTranscriptBuffer(buffer)).toBe("새 슬라이드");
  });

  it("decides auto-advance only when keyword coverage reaches 80%", () => {
    expect(
      shouldAutoAdvanceLiveSlide({
        analysis: { coverage: 0.8, missingKeywordIds: ["kw_5"] },
        currentSlideIndex: 0,
        slideCount: 2,
        keywordCount: 5,
        alreadyAdvanced: false
      })
    ).toBe(true);

    expect(
      shouldAutoAdvanceLiveSlide({
        analysis: { coverage: 0.75, missingKeywordIds: ["kw_4"] },
        currentSlideIndex: 0,
        slideCount: 2,
        keywordCount: 4,
        alreadyAdvanced: false
      })
    ).toBe(false);

    expect(
      shouldAutoAdvanceLiveSlide({
        analysis: { coverage: 1, missingKeywordIds: [] },
        currentSlideIndex: 1,
        slideCount: 2,
        keywordCount: 1,
        alreadyAdvanced: false
      })
    ).toBe(false);
  });

  it("keeps the default sherpa adapter as an explicit unavailable shell", async () => {
    await expect(
      new SherpaLiveSttAdapter().start({ getTracks: () => [] } as unknown as MediaStream, {
        onPartialTranscript: () => undefined,
        onError: () => undefined
      })
    ).rejects.toMatchObject({
      code: "LIVE_STT_MODEL_UNAVAILABLE"
    } satisfies Partial<LiveSttAdapterError>);
  });

  it("records audio through a MediaRecorder-compatible session", () => {
    const stoppedFiles: File[] = [];
    const errors: Error[] = [];
    const session = createRecordingSession({ getTracks: () => [] } as unknown as MediaStream, {
      recorderCtor: FakeMediaRecorder as unknown as typeof MediaRecorder,
      now: () => new Date("2026-06-29T00:00:00.000Z"),
      onStop: (file) => stoppedFiles.push(file),
      onError: (error) => errors.push(error)
    });

    session.start();
    expect(session.recorder.state).toBe("recording");

    session.stop();
    expect(errors).toEqual([]);
    expect(stoppedFiles).toHaveLength(1);
    expect(stoppedFiles[0]?.name).toBe("rehearsal-2026-06-29T00-00-00-000Z.webm");
    expect(stoppedFiles[0]?.type).toBe("audio/webm");
  });

  it("selects the first supported recording MIME type", () => {
    const recorderCtor = {
      isTypeSupported: vi.fn((mimeType: string) => mimeType === "audio/mp4")
    } as unknown as typeof MediaRecorder;

    expect(selectRecordingMimeType(recorderCtor)).toBe("audio/mp4");
  });

  it("does not select unsupported OpenAI report STT MIME fallbacks", () => {
    const recorderCtor = {
      isTypeSupported: vi.fn((mimeType: string) => mimeType === "audio/ogg")
    } as unknown as typeof MediaRecorder;

    expect(selectRecordingMimeType(recorderCtor)).toBe("audio/webm");
  });

  it("normalizes recorder codec MIME types before upload", () => {
    const file = createRecordingFile(
      new Blob(["audio"], { type: "audio/webm;codecs=opus" }),
      "audio/webm;codecs=opus",
      new Date("2026-06-29T00:00:00.000Z")
    );

    expect(normalizeRecordingMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(file.type).toBe("audio/webm");
    expect(file.name).toBe("rehearsal-2026-06-29T00-00-00-000Z.webm");
  });

  it("persists a fallback demo deck when rehearsal entry has no stored deck", async () => {
    const fallbackDeck = createDemoDeck();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });

      if (!init) {
        return new Response("missing", { status: 404 });
      }

      return jsonResponse({
        projectId: fallbackDeck.projectId,
        deck: fallbackDeck,
        updatedAt: createdAt,
        snapshot: null
      });
    });

    const deck = await fetchOrCreateRehearsalDeck({
      fallbackDeck,
      fetcher
    });

    expect(deck.deckId).toBe(fallbackDeck.deckId);
    expect(calls.map((call) => call.url)).toEqual([
      `/api/v1/projects/${fallbackDeck.projectId}/deck`,
      `/api/v1/projects/${fallbackDeck.projectId}/deck`
    ]);
    expect(calls[1]?.init).toMatchObject({
      method: "PUT",
      headers: { "content-type": "application/json" }
    });
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      deck: fallbackDeck,
      snapshotReason: "deck-replaced"
    });
  });
});

describe("runRehearsalUploadFlow", () => {
  it("creates a run, uploads audio, completes it, polls the job, and fetches final run", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });

      if (url === "/api/v1/projects/project-a/rehearsals") {
        return jsonResponse({ run: runFixture("created") });
      }

      if (url === "/api/v1/rehearsals/run-1/audio/upload-url") {
        return jsonResponse({
          run: runFixture("uploading", { audioFileId: "file-audio" }),
          upload: {
            fileId: "file-audio",
            projectId: "project-a",
            uploadUrl: "http://storage.local/rehearsal.webm",
            method: "PUT",
            headers: { "content-type": "audio/webm" },
            expiresAt: "2026-06-29T00:15:00.000Z",
            purpose: "rehearsal-audio"
          }
        });
      }

      if (url === "http://storage.local/rehearsal.webm") {
        return new Response(null, { status: 200 });
      }

      if (url === "/api/v1/rehearsals/run-1/audio/complete") {
        return jsonResponse({
          run: runFixture("processing", {
            audioFileId: "file-audio",
            jobId: "job-1"
          }),
          job: jobFixture("queued", 0)
        });
      }

      if (url === "/api/jobs/job-1") {
        const count = calls.filter((call) => call.url === "/api/jobs/job-1").length;
        return jsonResponse(count === 1 ? jobFixture("running", 40) : jobFixture("succeeded", 100));
      }

      if (url === "/api/v1/rehearsals/run-1") {
        return jsonResponse({
          run: runFixture("succeeded", {
            audioFileId: "file-audio",
            jobId: "job-1",
            rawAudioDeletedAt: "2026-06-29T00:00:10.000Z"
          })
        });
      }

      return new Response("unexpected", { status: 500 });
    });
    const audioFile = new File(["audio"], "rehearsal.webm", {
      type: "audio/webm"
    });

    const result = await runRehearsalUploadFlow({
      projectId: "project-a",
      deckId: "deck-a",
      audioFile,
      fetcher,
      pollDelayMs: 0
    });

    expect(result.run.status).toBe("succeeded");
    expect(result.job.status).toBe("succeeded");
    expect(calls.map((call) => call.url)).toEqual([
      "/api/v1/projects/project-a/rehearsals",
      "/api/v1/rehearsals/run-1/audio/upload-url",
      "http://storage.local/rehearsal.webm",
      "/api/v1/rehearsals/run-1/audio/complete",
      "/api/jobs/job-1",
      "/api/jobs/job-1",
      "/api/v1/rehearsals/run-1"
    ]);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      deckId: "deck-a"
    });
    expect(calls[2]?.init).toMatchObject({
      method: "PUT",
      headers: { "content-type": "audio/webm" },
      body: audioFile
    });
  });

  it("stops before complete when storage upload is interrupted", async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);

      if (url === "/api/v1/projects/project-a/rehearsals") {
        return jsonResponse({ run: runFixture("created") });
      }

      if (url === "/api/v1/rehearsals/run-1/audio/upload-url") {
        return jsonResponse({
          run: runFixture("uploading", { audioFileId: "file-audio" }),
          upload: {
            fileId: "file-audio",
            projectId: "project-a",
            uploadUrl: "http://storage.local/rehearsal.webm",
            method: "PUT",
            headers: { "content-type": "audio/webm" },
            expiresAt: "2026-06-29T00:15:00.000Z",
            purpose: "rehearsal-audio"
          }
        });
      }

      if (url === "http://storage.local/rehearsal.webm") {
        return new Response("network interrupted", { status: 503 });
      }

      return new Response("unexpected", { status: 500 });
    });

    await expect(
      runRehearsalUploadFlow({
        projectId: "project-a",
        deckId: "deck-a",
        audioFile: new File(["audio"], "rehearsal.webm", {
          type: "audio/webm"
        }),
        fetcher,
        pollDelayMs: 0
      })
    ).rejects.toMatchObject({
      stage: "storage-put"
    } satisfies Partial<RehearsalFlowError>);

    expect(calls).toEqual([
      "/api/v1/projects/project-a/rehearsals",
      "/api/v1/rehearsals/run-1/audio/upload-url",
      "http://storage.local/rehearsal.webm"
    ]);
  });
});

describe("fetchRehearsalReport", () => {
  it("loads the official report for a rehearsal run", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        run: runFixture("succeeded"),
        report: reportFixture()
      })
    );

    const result = await fetchRehearsalReport("run-1", fetcher);

    expect(fetcher).toHaveBeenCalledWith("/api/v1/rehearsals/run-1/report");
    expect(result.report?.transcriptRetained).toBe(false);
    expect(result.report?.transcript).toBeNull();
  });
});

class FakeMediaRecorder {
  static isTypeSupported(mimeType: string) {
    return mimeType === "audio/webm";
  }

  state: RecordingState = "inactive";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;

  constructor(
    readonly stream: MediaStream,
    readonly options?: MediaRecorderOptions
  ) {}

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["audio"], {
        type: this.options?.mimeType ?? "audio/webm"
      })
    } as BlobEvent);
    this.onstop?.(new Event("stop"));
  }
}

function runFixture(
  status: RehearsalRun["status"],
  patch: Partial<RehearsalRun> = {}
): RehearsalRun {
  return {
    runId: "run-1",
    projectId: "project-a",
    deckId: "deck-a",
    audioFileId: null,
    jobId: null,
    status,
    error: null,
    rawAudioDeletedAt: null,
    createdAt,
    updatedAt: createdAt,
    ...patch
  };
}

function jobFixture(status: Job["status"], progress: number): Job {
  return {
    jobId: "job-1",
    projectId: "project-a",
    type: "rehearsal-stt",
    status,
    progress,
    message: status,
    result: null,
    error: null,
    createdAt,
    updatedAt: createdAt
  };
}

function reportFixture(patch: Partial<RehearsalReport> = {}): RehearsalReport {
  return {
    reportId: "report_run-1",
    runId: "run-1",
    projectId: "project-a",
    deckId: "deck-a",
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
    generatedAt: "2026-06-29T00:00:10.000Z",
    ...patch
  };
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" }
  });
}
