import type { StoragePort } from "@orbit/storage";
import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTestDeck } from "./generate-deck/test-deck.fixture";
import {
  processSlidePracticeAnalysisJob,
  type SlidePracticeAnalysisBusinessEvent,
} from "./slide-practice-analysis.processor";

const payload = {
  jobId: "job-slide-practice",
  projectId: "project-a",
  analysisId: "analysis-a",
};

describe("processSlidePracticeAnalysisJob", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("stores only derived metrics and deletes private audio", async () => {
    const query = createQuery();
    const removeObject = vi.fn(async () => undefined);
    const businessEvents: unknown[] = [];
    const fetcher = vi.fn(async (url: unknown, _init?: RequestInit) => {
      if (String(url).endsWith("/slide-practice/coaching")) {
        return new Response(JSON.stringify({
          summary: "말 속도를 천천히 연습해 보세요.",
          item: {
            evidenceId: "evidence-1",
            category: "pitch",
            title: "억양 변화 주기",
            reason: "억양 변화가 적습니다.",
            action: "핵심 문장부터 시작해 보세요.",
            practiceTip: "추천 문장을 세 번 읽어 보세요.",
          },
          model: "gpt-test",
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        transcript: "발표를 시작합니다",
        provider: "openai",
        meanRecognitionConfidence: null,
        voice: voiceMetrics(),
        loudnessSamples: [
          { startMs: 0, endMs: 1_000, loudnessDb: -40 },
          { startMs: 1_000, endMs: 2_000, loudnessDb: -35 },
        ],
        speedSamples: [
          { startMs: 0, endMs: 5_000, syllablesPerSecond: 2.2 },
        ],
        transcriptSegments: [{
          text: "발표를 시작합니다",
          startMs: 0,
          endMs: 2_000,
        }],
        pauseSegments: [],
        fillerVerbatim: {
          state: "succeeded",
          transcript: "음 어 발표를 시작합니다",
          model: "gpt-4o-mini-transcribe",
          promptVersion: "korean-filler-verbatim-v1",
          reasonCode: null,
        },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);

    const job = await processSlidePracticeAnalysisJob(
      { query } as unknown as DataSource,
      {
        getSignedReadUrl: vi.fn(async () => "https://private.invalid/slide.webm"),
        removeObject,
      } as unknown as StoragePort,
      "http://python-worker:8000",
      payload,
      runtime((event) => businessEvents.push(event)),
    );

    expect(job.status).toBe("succeeded");
    expect(job.result).toEqual({ analysisId: "analysis-a", reportId: "report-a" });
    expect(removeObject).toHaveBeenCalledWith("private/slide.webm");
    const persistedParameters = query.mock.calls
      .filter(([sql]) => String(sql).includes("INSERT INTO slide_practice_reports"))
      .flatMap(([, parameters]) => parameters ?? []);
    const persisted = JSON.stringify(persistedParameters);
    expect(persisted).not.toContain("음 어 발표를 시작합니다");
    expect(persisted).toContain('"reportVersion":3');
    expect(persisted).toContain('"metricDefinitionVersion":3');
    expect(persisted).toContain('"contentHashVersion":"slide-text-v1"');
    expect(persisted).toContain(`"slideContentHash":"${"a".repeat(64)}"`);
    expect(persisted).toContain('"loudnessSamples"');
    expect(persisted).toContain('"speedSamples"');
    expect(persisted).toContain('"coaching"');
    expect(persisted).toContain('"status":"succeeded"');
    expect(persisted).toContain('"promptVersion":2');
    expect(persisted).toContain('"scriptEvidence"');
    expect(persisted).toContain('"classifierVersion":4');
    expect(persisted).toContain('"mode":"lullaby"');
    expect(persisted).toContain('"totalCount":2');
    expect(persisted).toContain('"state":"measured"');
    expect(persisted).toContain('"mode":"openai-verbatim"');
    const reportInsert = query.mock.calls.find(([sql]) => (
      String(sql).includes("INSERT INTO slide_practice_reports")
    ));
    expect(reportInsert?.[1]?.[8]).toBe("slide-text-v1");
    expect(reportInsert?.[1]?.[9]).toBe("a".repeat(64));
    const coachingRequest = fetcher.mock.calls.find(([url]) => (
      String(url).endsWith("/slide-practice/coaching")
    ));
    expect(String(coachingRequest?.[1]?.body)).toContain("loudness-unstable");
    expect(String(coachingRequest?.[1]?.body)).toContain("filler-use");
    expect(String(coachingRequest?.[1]?.body)).not.toContain("transcript");
    expect(String(coachingRequest?.[1]?.body)).not.toContain("audio");
    expect(String(coachingRequest?.[1]?.body)).not.toContain("음 어 발표를 시작합니다");
    const analysisRequest = fetcher.mock.calls.find(([url]) => (
      String(url).endsWith("/slide-practice/analyze-audio")
    ));
    const analysisBody = String(analysisRequest?.[1]?.body);
    expect(analysisBody).toContain('"model":"gpt-4o-mini-transcribe"');
    expect(analysisBody).toContain('"promptVersion":"korean-filler-verbatim-v1"');
    expect(analysisBody).toContain("음, 어, 으, 아");
    expect(analysisBody).toContain("반복, 말더듬, 문장 재시작");
    expect(JSON.stringify(businessEvents)).not.toContain("음 어 발표를 시작합니다");
  });

  it("queues raw audio deletion when server analysis fails", async () => {
    const query = createQuery();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));

    const job = await processSlidePracticeAnalysisJob(
      { query } as unknown as DataSource,
      {
        getSignedReadUrl: vi.fn(async () => "https://private.invalid/slide.webm"),
        removeObject: vi.fn(async () => { throw new Error("storage unavailable"); }),
      } as unknown as StoragePort,
      "http://python-worker:8000",
      payload,
      runtime(),
    );

    expect(job.status).toBe("failed");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO storage_deletion_outbox"))).toBe(true);
  });

  it("preserves unmeasured metrics as null instead of zero", async () => {
    const query = createQuery();
    const fetcher = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response(JSON.stringify({
      transcript: "짧음",
      provider: "openai",
      meanRecognitionConfidence: null,
      voice: {
        ...voiceMetrics(),
        activeSpeechMs: 500,
        pitchMedianHz: null,
        pitchSpanHz: null,
        loudnessDb: null,
        loudnessMadDb: null,
      },
      loudnessSamples: [],
      speedSamples: [],
      transcriptSegments: [],
      pauseSegments: [],
      fillerVerbatim: {
        state: "unavailable",
        transcript: null,
        model: "gpt-4o-mini-transcribe",
        promptVersion: "korean-filler-verbatim-v1",
        reasonCode: "FILLER_VERBATIM_UNAVAILABLE",
      },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);

    const job = await processSlidePracticeAnalysisJob(
      { query } as unknown as DataSource,
      {
        getSignedReadUrl: vi.fn(async () => "https://private.invalid/slide.webm"),
        removeObject: vi.fn(async () => undefined),
      } as unknown as StoragePort,
      "http://python-worker:8000",
      payload,
      runtime(),
    );

    expect(job.status).toBe("succeeded");
    const persistedParameters = query.mock.calls
      .find(([sql]) => String(sql).includes("INSERT INTO slide_practice_reports"))?.[1] ?? [];
    const report = persistedParameters[12] as {
      quality: { state: string; reasons: string[] };
      fillers: { measurement: { state: string; reasonCode: string } };
      voice: { loudnessDb: number | null; syllablesPerSecond: number | null };
    };
    expect(report.quality).toEqual({
      state: "unmeasured",
      reasons: ["insufficient-speech", "audio-analysis-unavailable", "pitch-unavailable"],
    });
    expect(report.voice.syllablesPerSecond).toBeNull();
    expect(report.voice.loudnessDb).toBeNull();
    expect(report.fillers.measurement).toMatchObject({
      state: "unmeasured",
      reasonCode: "FILLER_VERBATIM_UNAVAILABLE",
    });
    expect(JSON.stringify(report)).not.toContain('"syllablesPerSecond":0');
    expect(fetcher.mock.calls
      .filter(([url]) => String(url).endsWith("/slide-practice/coaching")))
      .toHaveLength(0);
  });
});

function runtime(onEvent?: (event: SlidePracticeAnalysisBusinessEvent) => void) {
  return {
    fillerVerbatimModel: "gpt-4o-mini-transcribe",
    onEvent,
  };
}

function createQuery() {
  return vi.fn(async (sql: string, parameters?: unknown[]) => {
    if (sql.includes("FROM slide_practice_audio_analyses analyses")) return [inputRow()];
    if (sql.includes("FROM user_voice_baselines")) return [];
    if (sql.includes("FROM decks d")) return [{
      deck_json: deckFixture(),
      version: 2,
      patch_rows: [],
    }];
    if (sql.includes("SELECT report_id FROM slide_practice_reports")) return [];
    if (sql.includes("INSERT INTO slide_practice_reports")) return [{ report_id: "report-a" }];
    if (sql.includes("UPDATE jobs") && parameters?.[1] === "running") return [jobRow("running", null, null)];
    if (sql.includes("UPDATE jobs") && parameters?.[1] === "succeeded") return [jobRow("succeeded", parameters[4], null)];
    if (sql.includes("UPDATE jobs") && parameters?.[1] === "failed") return [jobRow("failed", null, parameters[5])];
    return [];
  });
}

function inputRow() {
  return {
    analysis_id: "analysis-a",
    project_id: "project-a",
    created_by: "user-a",
    client_request_id: "request-a",
    practice_session_id: "practice-a",
    deck_id: "deck_test_a",
    deck_version: 2,
    slide_id: "slide_test_a",
    slide_order: 1,
    content_hash_version: "slide-text-v1",
    slide_content_hash: "a".repeat(64),
    started_at: "2026-07-17T00:00:00.000Z",
    duration_ms: 12_000,
    device_id_hash: null,
    status: "queued",
    audio_file_id: "file-audio",
    storage_key: "private/slide.webm",
    mime_type: "audio/webm",
    asset_status: "uploaded",
    purpose: "slide-practice-audio",
  };
}

function deckFixture() {
  const deck = createTestDeck("project-a");
  return {
    ...deck,
    deckId: "deck_test_a",
    version: 2,
    slides: [{
      ...deck.slides[0],
      slideId: "slide_test_a",
      order: 1,
      speakerNotes: "발표를 시작합니다.",
    }],
  };
}

function voiceMetrics() {
  return {
    activeSpeechMs: 10_000,
    pauseRatio: 0.16,
    pitchMedianHz: 180,
    pitchSpanHz: 30,
    pitchValidRatio: 0.8,
    loudnessDb: -40,
    loudnessMadDb: 3.01,
    syllablesPerSecond: null,
    signalToNoiseDb: 20,
    breathinessRatio: 0.2,
    clarityRatio: 0.7,
    rhythmRegularity: 0.8,
    clippingRatio: 0,
  };
}

function jobRow(status: "running" | "succeeded" | "failed", result: unknown, error: unknown) {
  return {
    job_id: "job-slide-practice",
    project_id: "project-a",
    type: "slide-practice-analysis",
    status,
    progress: status === "running" ? 10 : 100,
    message: "slide practice",
    result,
    error,
    created_at: "2026-07-17T00:00:00.000Z",
    updated_at: "2026-07-17T00:00:01.000Z",
  };
}
