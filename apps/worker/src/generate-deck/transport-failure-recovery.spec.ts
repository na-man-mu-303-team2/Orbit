import {
  generateDeckQueueName,
  generateDeckStagedCoordinatorJobName,
  referenceExtractQueueName,
} from "@orbit/job-queue";
import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { recoverAiDeckBullMqFinalFailure } from "./transport-failure-recovery";

describe("recoverAiDeckBullMqFinalFailure", () => {
  it("fails an active coordinator parent and its active checkpoints atomically", async () => {
    const query = vi.fn(async (sql: string, parameters?: unknown[]) => {
      const compact = compactSql(sql);
      if (compact.includes("FROM jobs") && compact.includes("FOR UPDATE")) {
        return [{ job_id: "job-ai-deck-1", project_id: "project-a", status: "running" }];
      }
      if (compact.startsWith("UPDATE ai_deck_generation_stages")) return [];
      if (compact.startsWith("UPDATE jobs")) return [{ job_id: "job-ai-deck-1" }];
      throw new Error(`Unexpected query: ${compact} ${String(parameters)}`);
    });
    const dataSource = transactionalDataSource(query);

    await expect(
      recoverAiDeckBullMqFinalFailure(dataSource, {
        queueName: generateDeckQueueName,
        jobName: generateDeckStagedCoordinatorJobName,
        data: { jobId: "job-ai-deck-1", projectId: "project-a" },
      }),
    ).resolves.toBe("coordinator-failed");

    const calls = query.mock.calls.map((call) => compactSql(call[0]));
    const stageUpdate = calls.findIndex((sql) =>
      sql.startsWith("UPDATE ai_deck_generation_stages"),
    );
    const parentUpdate = calls.findIndex((sql) => sql.startsWith("UPDATE jobs"));
    expect(stageUpdate).toBeGreaterThan(0);
    expect(stageUpdate).toBeLessThan(parentUpdate);
    expect(calls[stageUpdate]).toContain("stages.status IN ('queued','running')");
    expect(calls[stageUpdate]).toContain("dispatched_at = NULL");
    expect(query.mock.calls[stageUpdate]?.[1]?.[1]).toMatchObject({
      code: "AI_DECK_COORDINATOR_FAILED",
      retryable: true,
    });
    expect(query.mock.calls[parentUpdate]?.[1]?.[2]).toMatchObject({
      code: "AI_DECK_COORDINATOR_FAILED",
      retryable: true,
    });
  });

  it("releases a queued OCR dispatch marker after the final transport attempt", async () => {
    const query = vi.fn(async (sql: string) => {
      const compact = compactSql(sql);
      if (compact.includes("FROM jobs") && compact.includes("FOR UPDATE")) {
        return [{ job_id: "job-ai-deck-1", project_id: "project-a", status: "running" }];
      }
      if (compact.startsWith("UPDATE ai_deck_generation_stages")) {
        return [checkpointRow({ dispatched_at: null })];
      }
      throw new Error(`Unexpected query: ${compact}`);
    });
    const dataSource = transactionalDataSource(query);

    await expect(
      recoverAiDeckBullMqFinalFailure(dataSource, {
        queueName: referenceExtractQueueName,
        jobName: "reference-extract-file",
        data: stageMessage(),
      }),
    ).resolves.toBe("stage-dispatch-released");

    const releaseSql = compactSql(query.mock.calls[1]?.[0]);
    expect(releaseSql).toContain("stages.status = 'queued'");
    expect(releaseSql).toContain("stages.dispatched_at IS NOT NULL");
    expect(releaseSql).toContain("dispatched_at = NULL");
    expect(query.mock.calls[1]?.[1]?.slice(0, 4)).toEqual([
      "job-ai-deck-1",
      "project-a",
      "reference-extract-file",
      "file-a",
    ]);
  });

  it("ignores unsupported jobs and foreign or terminal parent identities", async () => {
    const transaction = vi.fn(
      async (work: (manager: { query: ReturnType<typeof vi.fn> }) => unknown) =>
        work({ query: vi.fn(async () => []) }),
    );
    const dataSource = { transaction } as unknown as DataSource;

    await expect(
      recoverAiDeckBullMqFinalFailure(dataSource, {
        queueName: "other-queue",
        jobName: "other-job",
        data: {},
      }),
    ).resolves.toBe("ignored");
    expect(transaction).not.toHaveBeenCalled();

    await expect(
      recoverAiDeckBullMqFinalFailure(dataSource, {
        queueName: referenceExtractQueueName,
        jobName: "reference-extract-file",
        data: stageMessage(),
      }),
    ).resolves.toBe("ignored");
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

function transactionalDataSource(query: ReturnType<typeof vi.fn>): DataSource {
  return {
    transaction: vi.fn(async (work: (manager: { query: typeof query }) => unknown) =>
      work({ query }),
    ),
  } as unknown as DataSource;
}

function stageMessage() {
  return {
    pipelineJobId: "job-ai-deck-1",
    projectId: "project-a",
    stage: "reference-extract-file",
    shardKey: "file-a",
  };
}

function checkpointRow(overrides: Record<string, unknown> = {}) {
  return {
    pipeline_job_id: "job-ai-deck-1",
    stage: "reference-extract-file",
    shard_key: "file-a",
    status: "queued",
    attempt: 0,
    input_ref_json: {},
    result_ref_json: null,
    error_json: null,
    lease_owner: null,
    lease_expires_at: null,
    dispatched_at: "2026-07-15T01:00:00.000Z",
    created_at: "2026-07-15T00:00:00.000Z",
    updated_at: "2026-07-15T01:00:00.000Z",
    ...overrides,
  };
}

function compactSql(value: unknown): string {
  return String(value).replace(/\s+/g, " ").trim();
}
