import type { StoragePort } from "@orbit/storage";
import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { processFocusedPracticeAnalysisJob } from "./focused-practice-analysis.processor";

const payload = { jobId: "job-focused", projectId: "project-a", attemptId: "attempt-a" };

describe("processFocusedPracticeAnalysisJob", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("stores bounded outcomes and deletes private audio", async () => {
    const query = createQuery();
    const removeObject = vi.fn(async () => undefined);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ transcript: "핵심 지표는 10%입니다.", segments: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ outcomes: [outcome("passed")] }), { status: 200 })));

    const job = await processFocusedPracticeAnalysisJob(
      { query } as unknown as DataSource,
      { getSignedReadUrl: vi.fn(async () => "https://private.invalid/audio"), removeObject } as unknown as StoragePort,
      "http://python-worker:8000",
      payload,
    );

    expect(job.status).toBe("succeeded");
    expect(job.result).toEqual({ attemptId: "attempt-a", result: "passed" });
    expect(removeObject).toHaveBeenCalledWith("private/focused.webm");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("cleanup_state = $4"))).toBe(true);
  });

  it("schedules cleanup when analysis and immediate deletion both fail", async () => {
    const query = createQuery();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("unavailable", { status: 503 })));

    const job = await processFocusedPracticeAnalysisJob(
      { query } as unknown as DataSource,
      {
        getSignedReadUrl: vi.fn(async () => "https://private.invalid/audio"),
        removeObject: vi.fn(async () => { throw new Error("storage unavailable"); }),
      } as unknown as StoragePort,
      "http://python-worker:8000",
      payload,
    );

    expect(job.status).toBe("failed");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO storage_deletion_outbox"))).toBe(true);
    expect(query.mock.calls.some(([sql, parameters]) =>
      String(sql).includes("status = 'failed'") && Array.isArray(parameters) && parameters.includes("pending"),
    )).toBe(true);
  });
});

function createQuery() {
  return vi.fn(async (sql: string, parameters?: unknown[]) => {
    if (sql.includes("FROM focused_practice_attempts attempts")) return [inputRow()];
    if (sql.includes("FROM practice_goals")) return [{
      goal_id: "goal-a",
      criterion_ref_json: { criterionId: "criterion-a", revision: 1 },
    }];
    if (sql.includes("UPDATE jobs") && parameters?.[1] === "running") return [jobRow("running", null, null)];
    if (sql.includes("UPDATE jobs") && parameters?.[1] === "succeeded") return [jobRow("succeeded", parameters[4], null)];
    if (sql.includes("UPDATE jobs") && parameters?.[1] === "failed") return [jobRow("failed", null, parameters[5])];
    return [];
  });
}

function inputRow() {
  return {
    attempt_id: "attempt-a", project_id: "project-a", practice_session_id: "practice-a",
    status: "queued", duration_ms: 12_000, audio_file_id: "file-audio",
    storage_key: "private/focused.webm", mime_type: "audio/webm", goal_ids_json: ["goal-a"],
    snapshot_json: {}, evaluation_snapshot_json: { evaluationPlan: { criteria: [{ criterionId: "criterion-a", revision: 1 }] } },
  };
}

function outcome(value: "passed" | "failed") {
  return {
    goalId: "goal-a", criterionRef: { criterionId: "criterion-a", revision: 1 },
    measurementState: "measured", outcome: value,
    observation: { kind: "duration-seconds", value: 12 },
    threshold: { kind: "max-duration-seconds", value: 15 },
    reasonCode: value === "passed" ? "PASSED" : "THRESHOLD_EXCEEDED",
  };
}

function jobRow(status: "running" | "succeeded" | "failed", result: unknown, error: unknown) {
  return {
    job_id: "job-focused", project_id: "project-a", type: "focused-practice-analysis",
    status, progress: status === "running" ? 10 : 100, message: "focused", result, error,
    created_at: "2026-07-11T00:00:00.000Z", updated_at: "2026-07-11T00:00:01.000Z",
  };
}
