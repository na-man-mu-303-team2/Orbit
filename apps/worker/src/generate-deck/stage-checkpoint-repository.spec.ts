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

  it("rejects undeclared result refs before querying and non-empty refs read from DB", async () => {
    const write = repositoryWithResponses();

    await expect(
      write.repository.succeed(message, "worker-a:lease-token", 1, {
        provider_response: { output: "raw" },
      }),
    ).rejects.toThrow();
    await expect(
      write.repository.succeed(message, "worker-a:lease-token", 1, {
        referenceExtractionArtifactId: "7dc4ed60-2d85-4f13-b3ca-c6bb4ed54f8a",
      }),
    ).rejects.toThrow();
    await expect(
      write.repository.ensureQueued(message, {
        referenceExtractionArtifactId: "7dc4ed60-2d85-4f13-b3ca-c6bb4ed54f8a",
      }),
    ).rejects.toThrow();
    expect(write.query).not.toHaveBeenCalled();

    const read = repositoryWithResponses([
      queuedRow({ input_ref_json: { storageKey: "uncontracted-key" } }),
    ]);
    await expect(read.repository.get(message)).rejects.toThrow();
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

  it("fairly claims one queued checkpoint under a per-user transaction lock", async () => {
    const managerQuery = vi
      .fn<QueryFunction>()
      .mockResolvedValueOnce([
        {
          requested_by_user_id: "user-b",
          running_count: 0,
          oldest_created_at: "2026-07-16T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce([{ user_id: "user-b" }])
      .mockResolvedValueOnce([{ running_count: 0 }])
      .mockResolvedValueOnce([
        {
          ...runningRow(),
          project_id: "project-b",
          requested_by_user_id: "user-b",
        },
      ]);
    const transaction = vi.fn(async (_isolationLevel, callback) =>
      callback({ query: managerQuery }),
    );
    const repository = new AiDeckGenerationStageCheckpointRepository({
      query: vi.fn(),
      transaction,
    } as unknown as DataSource);

    await expect(repository.claimNext("worker-a", 5)).resolves.toMatchObject({
      requestedByUserId: "user-b",
      message: {
        pipelineJobId: "job-ai-deck-1",
        projectId: "project-b",
        stage: "content-planning",
        shardKey: "",
      },
      checkpoint: { status: "running", attempt: 1 },
    });

    expect(transaction).toHaveBeenCalledWith(
      "READ COMMITTED",
      expect.any(Function),
    );
    const candidatesSql = compactSql(managerQuery.mock.calls[0]?.[0]);
    expect(candidatesSql).toContain(
      "COALESCE(NULLIF(jobs.payload->>'requestedByUserId', ''), projects.created_by)",
    );
    expect(candidatesSql).toContain(
      "ORDER BY running_count, oldest_created_at, requested_by_user_id",
    );
    const lockSql = compactSql(managerQuery.mock.calls[1]?.[0]);
    expect(lockSql).toContain("pg_try_advisory_xact_lock");
    const guardSql = compactSql(managerQuery.mock.calls[2]?.[0]);
    expect(guardSql).toContain("FROM users");
    expect(guardSql).toContain("FOR UPDATE");
    const recountSql = compactSql(managerQuery.mock.calls[3]?.[0]);
    expect(recountSql).toContain("stages.status = 'running'");
    const claimSql = compactSql(managerQuery.mock.calls[4]?.[0]);
    expect(claimSql).toContain("FOR UPDATE OF stages SKIP LOCKED");
    expect(claimSql).toContain("LIMIT 1");
    expect(claimSql).toContain("status = 'running'");
    expect(claimSql).toContain("attempt = stages.attempt + 1");
    expect(claimSql).toContain("lease_expires_at = now() + interval '10 minutes'");
  });

  it("leaves the sixth checkpoint queued when the requesting user already has five running", async () => {
    const managerQuery = vi
      .fn<QueryFunction>()
      .mockResolvedValueOnce([
        {
          requested_by_user_id: "user-a",
          running_count: 5,
          oldest_created_at: "2026-07-16T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce([{ user_id: "user-a" }])
      .mockResolvedValueOnce([{ running_count: 5 }]);
    const repository = new AiDeckGenerationStageCheckpointRepository({
      query: vi.fn(),
      transaction: async (
        _isolationLevel: "READ COMMITTED",
        callback: (manager: { query: QueryFunction }) => unknown,
      ) => callback({ query: managerQuery }),
    } as unknown as DataSource);

    await expect(repository.claimNext("worker-b", 5)).resolves.toBeNull();
    expect(managerQuery).toHaveBeenCalledTimes(4);
    expect(
      managerQuery.mock.calls.some(([sql]) =>
        compactSql(sql).includes("UPDATE ai_deck_generation_stages"),
      ),
    ).toBe(false);
  });

  it("skips a user locked by another Worker replica and claims the next fair candidate", async () => {
    const managerQuery = vi
      .fn<QueryFunction>()
      .mockResolvedValueOnce([
        {
          requested_by_user_id: "user-a",
          running_count: 0,
          oldest_created_at: "2026-07-16T00:00:00.000Z",
        },
        {
          requested_by_user_id: "user-b",
          running_count: 0,
          oldest_created_at: "2026-07-16T00:00:01.000Z",
        },
      ])
      .mockResolvedValueOnce([{ acquired: false }])
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce([{ user_id: "user-b" }])
      .mockResolvedValueOnce([{ running_count: 0 }])
      .mockResolvedValueOnce([
        {
          ...runningRow(),
          project_id: "project-b",
          requested_by_user_id: "user-b",
        },
      ]);
    const repository = new AiDeckGenerationStageCheckpointRepository({
      query: vi.fn(),
      transaction: async (
        _isolationLevel: "READ COMMITTED",
        callback: (manager: { query: QueryFunction }) => unknown,
      ) => callback({ query: managerQuery }),
    } as unknown as DataSource);

    await expect(repository.claimNext("worker-b", 5)).resolves.toMatchObject({
      requestedByUserId: "user-b",
    });
    expect(managerQuery.mock.calls[1]?.[1]).toEqual(["user-a"]);
    expect(managerQuery.mock.calls[2]?.[1]).toEqual(["user-b"]);
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

  it("releases only an active parent's queued dispatch marker after transport exhaustion", async () => {
    const { query, repository } = repositoryWithResponses([
      queuedRow({ dispatched_at: null }),
    ]);
    const referenceMessage = {
      ...message,
      stage: "reference-extract-file" as const,
      shardKey: "file-a",
    };

    await expect(
      repository.releaseDispatchedForTransportRetry(referenceMessage),
    ).resolves.toMatchObject({ status: "queued", dispatchedAt: null });

    const sql = compactSql(query.mock.calls[0]?.[0]);
    expect(sql).toContain("jobs.project_id = $2");
    expect(sql).toContain("jobs.status IN ('queued','running')");
    expect(sql).toContain("stages.status = 'queued'");
    expect(sql).toContain("stages.dispatched_at IS NOT NULL");
    expect(sql).toContain("dispatched_at = NULL");
  });

  it("recovers bounded stale queued dispatches for deterministic re-enqueue", async () => {
    const { query, repository } = repositoryWithResponses([
      queuedRow({ dispatched_at: null }),
    ]);

    await expect(repository.recoverStaleDispatches(25)).resolves.toBe(1);

    const sql = compactSql(query.mock.calls[0]?.[0]);
    expect(sql).toContain(
      "stages.stage IN ( 'reference-extract-file','source-grounding','content-planning', 'cover-slide','design-planning','layout-compile','image-slide', 'semantic-quality','rendered-visual-quality','publication' )",
    );
    expect(sql).toContain("stages.status = 'queued'");
    expect(sql).toContain(
      "stages.dispatched_at <= now() - interval '15 minutes'",
    );
    expect(sql).toContain("FOR UPDATE OF stages SKIP LOCKED");
    expect(sql).toContain("LIMIT $1");
    expect(sql).toContain("dispatched_at = NULL");
    expect(query.mock.calls[0]?.[1]).toEqual([25]);
  });

  it("lists only undispatched implemented checkpoints with the validated parent project", async () => {
    const { query, repository } = repositoryWithResponses([
      {
        ...queuedRow(),
        project_id: "project-a",
        stage: "reference-extract-file",
        shard_key: "file-a",
      },
    ]);

    await expect(repository.listUndispatched(25)).resolves.toEqual([
      {
        message: {
          pipelineJobId: "job-ai-deck-1",
          projectId: "project-a",
          stage: "reference-extract-file",
          shardKey: "file-a",
        },
        attempt: 0,
      },
    ]);

    const sql = compactSql(query.mock.calls[0]?.[0]);
    expect(sql).toContain("stages.status = 'queued'");
    expect(sql).toContain("stages.dispatched_at IS NULL");
    expect(sql).toContain(
      "stages.stage IN ( 'reference-extract-file','source-grounding','content-planning', 'cover-slide','design-planning','layout-compile','image-slide', 'semantic-quality','rendered-visual-quality','publication' )",
    );
    expect(sql).toContain("jobs.project_id");
    expect(sql).toContain("LIMIT $1");
    expect(query.mock.calls[0]?.[1]).toEqual([25]);
  });

  it("lists only expired running implemented stage generations", async () => {
    const { query, repository } = repositoryWithResponses([
      {
        ...runningRow(),
        project_id: "project-a",
        stage: "reference-extract-file",
        shard_key: "file-a",
        attempt: 4,
      },
    ]);

    await expect(repository.listExpiredLeases(10)).resolves.toEqual([
      {
        message: {
          pipelineJobId: "job-ai-deck-1",
          projectId: "project-a",
          stage: "reference-extract-file",
          shardKey: "file-a",
        },
        attempt: 4,
      },
    ]);

    const sql = compactSql(query.mock.calls[0]?.[0]);
    expect(sql).toContain("stages.status = 'running'");
    expect(sql).toContain("stages.lease_expires_at <= now()");
    expect(sql).toContain(
      "stages.stage IN ( 'reference-extract-file','source-grounding','content-planning', 'cover-slide','design-planning','layout-compile','image-slide', 'semantic-quality','rendered-visual-quality','publication' )",
    );
    expect(sql).toContain("LIMIT $1");
  });

  it.each([
    [4, "queued", true],
    [5, "failed", false],
  ] as const)(
    "reconciles expired attempt %i to %s without changing its generation",
    async (attempt, status, retryable) => {
      const row =
        status === "queued"
          ? queuedRow({ attempt })
          : failedRow({
              attempt,
              error_json: {
                code: "REFERENCE_EXTRACTION_LEASE_EXHAUSTED",
                message: "Reference extraction lease expired.",
                failedStage: "reference-extract-file",
                retryable: false,
              },
            });
      const { query, repository } = repositoryWithResponses([row]);
      const retryError = {
        code: "REFERENCE_EXTRACTION_LEASE_EXPIRED",
        message: "Reference extraction lease expired.",
        failedStage: "reference-extract-file" as const,
        retryable: true as const,
      };
      const exhaustedError = {
        code: "REFERENCE_EXTRACTION_LEASE_EXHAUSTED",
        message: "Reference extraction lease expired.",
        failedStage: "reference-extract-file" as const,
        retryable: false as const,
      };

      await expect(
        repository.reconcileExpiredLease(
          { ...message, stage: "reference-extract-file", shardKey: "file-a" },
          attempt,
          retryError,
          exhaustedError,
        ),
      ).resolves.toMatchObject({ status, attempt });

      const sql = compactSql(query.mock.calls[0]?.[0]);
      expect(sql).toContain("stages.attempt = $5");
      expect(sql).toContain("stages.lease_expires_at <= now()");
      expect(sql).toContain("dispatched_at = NULL");
      expect(sql).toContain("lease_owner = NULL");
      expect(query.mock.calls[0]?.[1]?.[attempt < 5 ? 5 : 6]).toMatchObject({
        retryable,
      });
    },
  );
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

function failedRow(overrides: Record<string, unknown> = {}) {
  return checkpointRow({
    status: "failed",
    attempt: 1,
    error_json: {
      code: "CONTENT_LLM_PROVIDER_FAILURE",
      message: "Content provider failed.",
      failedStage: "content-planning",
      retryable: false,
    },
    ...overrides,
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
