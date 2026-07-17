import type { StoragePort } from "@orbit/storage";
import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { processSlidePracticeAnalysisJob } from "./slide-practice-analysis.processor";

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
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      transcript: "음 어 발표를 시작합니다",
      provider: "openai",
      meanRecognitionConfidence: null,
      voice: voiceMetrics(),
    }), { status: 200 })));

    const job = await processSlidePracticeAnalysisJob(
      { query } as unknown as DataSource,
      {
        getSignedReadUrl: vi.fn(async () => "https://private.invalid/slide.webm"),
        removeObject,
      } as unknown as StoragePort,
      "http://python-worker:8000",
      payload,
    );

    expect(job.status).toBe("succeeded");
    expect(job.result).toEqual({ analysisId: "analysis-a", reportId: "report-a" });
    expect(removeObject).toHaveBeenCalledWith("private/slide.webm");
    const persistedParameters = query.mock.calls
      .filter(([sql]) => String(sql).includes("INSERT INTO slide_practice_reports"))
      .flatMap(([, parameters]) => parameters ?? []);
    const persisted = JSON.stringify(persistedParameters);
    expect(persisted).not.toContain("발표를 시작합니다");
    expect(persisted).toContain('"classifierVersion":4');
    expect(persisted).toContain('"mode":"lullaby"');
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
    );

    expect(job.status).toBe("failed");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO storage_deletion_outbox"))).toBe(true);
  });
});

function createQuery() {
  return vi.fn(async (sql: string, parameters?: unknown[]) => {
    if (sql.includes("FROM slide_practice_audio_analyses analyses")) return [inputRow()];
    if (sql.includes("FROM user_voice_baselines")) return [];
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
    deck_id: "deck-a",
    deck_version: 2,
    slide_id: "slide-a",
    slide_order: 0,
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

function voiceMetrics() {
  return {
    activeSpeechMs: 10_000,
    pauseRatio: 0.16,
    pitchMedianHz: 180,
    pitchSpanHz: 30,
    pitchValidRatio: 0.8,
    loudnessDb: -40,
    loudnessMadDb: 2,
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
