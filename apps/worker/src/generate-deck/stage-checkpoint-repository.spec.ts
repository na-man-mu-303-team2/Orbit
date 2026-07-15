import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { AiDeckGenerationStageCheckpointRepository } from "./stage-checkpoint-repository";

const message = {
  pipelineJobId: "job-ai-deck-1",
  projectId: "project-a",
  stage: "content-planning" as const,
  shardKey: "",
};

describe("AiDeckGenerationStageCheckpointRepository", () => {
  it("creates one queued checkpoint and reads the existing row on conflict", async () => {
    const { query, repository } = repositoryWithResponses([], [queuedRow()]);

    const checkpoint = await repository.ensureQueued(message);

    expect(checkpoint?.status).toBe("queued");
    expect(query).toHaveBeenCalledTimes(2);
    const insertSql = compactSql(query.mock.calls[0]?.[0]);
    expect(insertSql).toContain("INSERT INTO ai_deck_generation_stages");
    expect(insertSql).toContain(
      "jobs.type = 'ai-deck-generation' AND jobs.status IN ('queued','running')",
    );
    expect(insertSql).toContain(
      "ON CONFLICT (pipeline_job_id, stage, shard_key) DO NOTHING",
    );
    expect(insertSql).not.toContain("DO UPDATE");
    expect(query.mock.calls[0]?.[1]).toEqual([
      "job-ai-deck-1",
      "project-a",
      "content-planning",
      "",
      {},
    ]);

    const selectSql = compactSql(query.mock.calls[1]?.[0]);
    expect(selectSql).toContain(
      "JOIN jobs ON jobs.job_id = stages.pipeline_job_id",
    );
    expect(selectSql).toContain("jobs.project_id = $2");
    expect(selectSql).toContain("jobs.type = 'ai-deck-generation'");
  });

  it("accepts bounded reference metadata and rejects embedded payload data", async () => {
    const { query, repository } = repositoryWithResponses([queuedRow()]);

    await expect(repository.ensureQueued(message, {})).resolves.toMatchObject({
      status: "queued",
    });

    for (const invalidReference of [
      { deck: { slides: [] } },
      { artifactKey: "ai-deck/job-1/content-plan.json" },
      { storageKey: "ai-deck/job-1/content-plan.json" },
      { contentBase64: "ZmFrZQ==" },
      { content_base64: "ZmFrZQ==" },
      { providerResponse: { output: "raw" } },
      { provider_response: { output: "raw" } },
      { content: "user content" },
      { sourceText: "full user content" },
      { blob: "ZmFrZQ==" },
      { output: "raw provider output" },
      { assetUrl: "data:image/png;base64,ZmFrZQ==" },
      { bytes: Buffer.from("fake") },
    ]) {
      await expect(
        repository.ensureQueued(message, invalidReference),
      ).rejects.toThrow();
    }

    expect(query).toHaveBeenCalledTimes(1);
  });

  it("claims queued work atomically and increments attempt only on claim", async () => {
    const { query, repository } = repositoryWithResponses([runningRow()]);

    const checkpoint = await repository.claim(message, "worker-a");

    expect(checkpoint?.status).toBe("running");
    expect(checkpoint?.attempt).toBe(1);
    const sql = compactSql(query.mock.calls[0]?.[0]);
    expect(sql).toContain("status = 'running'");
    expect(sql).toContain("attempt = stages.attempt + 1");
    expect(sql).toContain("lease_expires_at = now() + interval '10 minutes'");
    expect(sql).toContain("stages.status = 'queued'");
    expect(sql).toContain("stages.attempt < 5");
    expect(sql).toContain("jobs.project_id = $2");
    expect(sql).not.toContain("dispatched_at IS NOT NULL");
  });

  it("returns no execution right when the conditional claim loses", async () => {
    const { repository } = repositoryWithResponses([]);

    await expect(repository.claim(message, "worker-b")).resolves.toBeNull();
  });

  it("issues a unique lease token for every claim generation", async () => {
    const { query, repository } = repositoryWithResponses([runningRow()], []);

    await repository.claim(message, "worker-a");
    await repository.claim(message, "worker-a");

    const firstLease = query.mock.calls[0]?.[1]?.[4];
    const secondLease = query.mock.calls[1]?.[1]?.[4];
    expect(firstLease).toMatch(/^worker-a:[0-9a-f-]{36}$/);
    expect(secondLease).toMatch(/^worker-a:[0-9a-f-]{36}$/);
    expect(firstLease).not.toBe(secondLease);
  });

  it("renews and completes only a live lease owned by the caller", async () => {
    const { query, repository } = repositoryWithResponses(
      [runningRow()],
      [succeededRow()],
      [],
    );

    await expect(
      repository.renewLease(message, "worker-a", 1),
    ).resolves.toMatchObject({ status: "running" });
    await expect(
      repository.succeed(message, "worker-a", 1, {}),
    ).resolves.toMatchObject({ status: "succeeded", leaseOwner: null });
    await expect(
      repository.succeed(message, "worker-a", 1, {}),
    ).resolves.toBeNull();

    for (const callIndex of [0, 1, 2]) {
      const sql = compactSql(query.mock.calls[callIndex]?.[0]);
      expect(sql).toContain("stages.lease_owner = $5");
      expect(sql).toContain("stages.attempt = $6");
      expect(sql).toContain("stages.lease_expires_at > now()");
    }
    const succeedSql = compactSql(query.mock.calls[1]?.[0]);
    expect(succeedSql).toContain("lease_owner = NULL");
    expect(succeedSql).toContain("lease_expires_at = NULL");
  });

  it("records terminal failure without allowing a stale owner to commit", async () => {
    const { query, repository } = repositoryWithResponses([failedRow()], []);
    const safeError = {
      code: "CONTENT_LLM_PROVIDER_FAILURE",
      message: "Content provider failed.",
      failedStage: "content-planning" as const,
      retryable: false,
    };

    await expect(
      repository.fail(message, "worker-a", 1, safeError),
    ).resolves.toMatchObject({ status: "failed", error: safeError });
    await expect(
      repository.fail(message, "worker-a", 1, safeError),
    ).resolves.toBeNull();

    const sql = compactSql(query.mock.calls[0]?.[0]);
    expect(sql).toContain("status = 'failed'");
    expect(sql).toContain("error_json = $7::jsonb");
    expect(sql).toContain("stages.lease_owner = $5");
    expect(sql).toContain("stages.attempt = $6");
    expect(sql).toContain("stages.lease_expires_at > now()");
    expect(sql).toContain("lease_owner = NULL");
    expect(sql).toContain("lease_expires_at = NULL");
  });

  it("requeues retryable work as an undispatched checkpoint", async () => {
    const { query, repository } = repositoryWithResponses([
      queuedRow({ attempt: 1 }),
    ]);

    await expect(
      repository.releaseForRetry(message, "worker-a", 1, {
        code: "WEB_RESEARCH_PROVIDER_FAILED",
        message: "Research provider unavailable.",
        failedStage: "content-planning",
        retryable: true,
      }),
    ).resolves.toMatchObject({ status: "queued", attempt: 1 });

    const sql = compactSql(query.mock.calls[0]?.[0]);
    expect(sql).toContain("status = 'queued'");
    expect(sql).toContain("dispatched_at = NULL");
    expect(sql).toContain("lease_owner = NULL");
    expect(sql).toContain("lease_expires_at = NULL");
    expect(sql).toContain("stages.attempt < 5");
    expect(sql).toContain("stages.attempt = $6");
  });

  it("marks only queued, previously undispatched checkpoints", async () => {
    const dispatchedAt = "2026-07-15T01:05:00.000Z";
    const { query, repository } = repositoryWithResponses(
      [queuedRow({ dispatched_at: dispatchedAt })],
      [],
    );

    await expect(repository.markDispatched(message, 0)).resolves.toMatchObject({
      dispatchedAt,
    });
    await expect(repository.markDispatched(message, 0)).resolves.toBeNull();

    const sql = compactSql(query.mock.calls[0]?.[0]);
    expect(sql).toContain("dispatched_at = now()");
    expect(sql).toContain("stages.status = 'queued'");
    expect(sql).toContain("stages.dispatched_at IS NULL");
    expect(sql).toContain("stages.attempt = $5");
  });
});

function repositoryWithResponses(...responses: unknown[][]) {
  const pending = [...responses];
  const query = vi.fn<QueryFunction>(async () => pending.shift() ?? []);
  const repository = new AiDeckGenerationStageCheckpointRepository({
    query,
  } as unknown as Pick<DataSource, "query">);
  return { query, repository };
}

type QueryFunction = (
  sql: string,
  parameters?: unknown[],
) => Promise<unknown[]>;

function compactSql(value: unknown): string {
  return String(value).replace(/\s+/g, " ").trim();
}

function queuedRow(overrides: Record<string, unknown> = {}) {
  return checkpointRow({ status: "queued", ...overrides });
}

function runningRow() {
  return checkpointRow({
    status: "running",
    attempt: 1,
    lease_owner: "worker-a",
    lease_expires_at: "2026-07-15T01:10:00.000Z",
  });
}

function succeededRow() {
  return checkpointRow({
    status: "succeeded",
    attempt: 1,
    result_ref_json: {},
  });
}

function failedRow() {
  return checkpointRow({
    status: "failed",
    attempt: 1,
    error_json: {
      code: "CONTENT_LLM_PROVIDER_FAILURE",
      message: "Content provider failed.",
      failedStage: "content-planning",
      retryable: false,
    },
  });
}

function checkpointRow(overrides: Record<string, unknown>) {
  return {
    pipeline_job_id: "job-ai-deck-1",
    stage: "content-planning",
    shard_key: "",
    status: "queued",
    attempt: 0,
    input_ref_json: {},
    result_ref_json: null,
    error_json: null,
    lease_owner: null,
    lease_expires_at: null,
    dispatched_at: null,
    created_at: "2026-07-15T01:00:00.000Z",
    updated_at: "2026-07-15T01:00:00.000Z",
    ...overrides,
  };
}
