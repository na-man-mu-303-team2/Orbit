import { generateDeckRequestSchema, type Job } from "@orbit/shared";
import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import {
  planAiDeckInitialStages,
  processAiDeckStagedCoordinatorJob,
} from "./staged-coordinator";

describe("planAiDeckInitialStages", () => {
  it("uses the documented policy precedence and fans out only uncovered files", () => {
    const request = generateDeckRequestSchema.parse({
      topic: "staged OCR",
      referencePolicy: "references-first",
      design: { referencePolicy: "references-only" },
      brief: { referencePolicy: "research-first" },
      referenceFileIds: ["file-a", "file-b", "file-a", "file-c"],
      referenceContext: [
        { fileId: "file-b", title: "B", content: "already extracted" },
      ],
    });

    expect(planAiDeckInitialStages(request)).toEqual({
      referencePolicy: "references-first",
      referenceFileIds: ["file-a", "file-c"],
    });
  });

  it.each(["topic-only", "user-input-only"] as const)(
    "skips OCR for %s",
    (referencePolicy) => {
      const request = generateDeckRequestSchema.parse({
        topic: "skip OCR",
        referencePolicy,
        referenceFileIds: ["file-a"],
      });

      expect(planAiDeckInitialStages(request)).toEqual({
        referencePolicy,
        referenceFileIds: [],
      });
    },
  );
});

describe("processAiDeckStagedCoordinatorJob", () => {
  it("creates every initial checkpoint and moves the parent to running in one transaction", async () => {
    const query = vi
      .fn<QueryFunction>()
      .mockResolvedValueOnce([parentJobRow()])
      .mockResolvedValueOnce([parentJobRow({ status: "running", progress: 10 })])
      .mockResolvedValueOnce([checkpointRow("file-a")])
      .mockResolvedValueOnce([checkpointRow("file-b")]);
    const transaction = vi.fn(async (work: (manager: { query: QueryFunction }) => unknown) =>
      work({ query }),
    );

    const result = await processAiDeckStagedCoordinatorJob(
      { transaction } as unknown as DataSource,
      { jobId: "job-ai-deck-1", projectId: "project-a" },
    );

    expect(result).toMatchObject({
      jobId: "job-ai-deck-1",
      projectId: "project-a",
      status: "running",
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(4);
    expect(compactSql(query.mock.calls[0]?.[0])).toContain("FOR UPDATE");
    const insertCalls = query.mock.calls.slice(2);
    expect(insertCalls.map((call) => call[1]?.slice(0, 4))).toEqual([
      ["job-ai-deck-1", "project-a", "reference-extract-file", "file-a"],
      ["job-ai-deck-1", "project-a", "reference-extract-file", "file-b"],
    ]);
  });

  it("creates source-grounding directly when every requested file is already covered", async () => {
    const query = vi
      .fn<QueryFunction>()
      .mockResolvedValueOnce([
        parentJobRow({
          payload: {
            request: generateDeckRequestSchema.parse({
              topic: "reuse OCR",
              referencePolicy: "references-first",
              referenceFileIds: ["file-a"],
              referenceContext: [
                { fileId: "file-a", content: "existing extraction" },
              ],
            }),
          },
        }),
      ])
      .mockResolvedValueOnce([parentJobRow({ status: "running", progress: 10 })])
      .mockResolvedValueOnce([
        { ...checkpointRow(""), stage: "source-grounding", shard_key: "" },
      ]);
    const transaction = vi.fn(async (work: (manager: { query: QueryFunction }) => unknown) =>
      work({ query }),
    );

    await processAiDeckStagedCoordinatorJob(
      { transaction } as unknown as DataSource,
      { jobId: "job-ai-deck-1", projectId: "project-a" },
    );

    expect(query.mock.calls[2]?.[1]?.slice(0, 4)).toEqual([
      "job-ai-deck-1",
      "project-a",
      "source-grounding",
      "",
    ]);
  });

  it("rejects coordinator payload fields beyond the ID-only contract", async () => {
    const transaction = vi.fn();

    await expect(
      processAiDeckStagedCoordinatorJob(
        { transaction } as unknown as DataSource,
        {
          jobId: "job-ai-deck-1",
          projectId: "project-a",
          request: { topic: "must stay in DB" },
        },
      ),
    ).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  });
});

type QueryFunction = (
  sql: string,
  parameters?: unknown[],
) => Promise<unknown[]>;

function parentJobRow(overrides: Record<string, unknown> = {}) {
  const now = "2026-07-15T01:00:00.000Z";
  return {
    job_id: "job-ai-deck-1",
    project_id: "project-a",
    type: "ai-deck-generation" satisfies Job["type"],
    status: "queued" satisfies Job["status"],
    progress: 0,
    message: "queued",
    payload: {
      request: generateDeckRequestSchema.parse({
        topic: "staged OCR",
        referencePolicy: "references-first",
        referenceFileIds: ["file-a", "file-b"],
      }),
    },
    result: null,
    error: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function checkpointRow(fileId: string) {
  const now = "2026-07-15T01:00:00.000Z";
  return {
    pipeline_job_id: "job-ai-deck-1",
    stage: "reference-extract-file",
    shard_key: fileId,
    status: "queued",
    attempt: 0,
    input_ref_json: {},
    result_ref_json: null,
    error_json: null,
    lease_owner: null,
    lease_expires_at: null,
    dispatched_at: null,
    created_at: now,
    updated_at: now,
  };
}

function compactSql(value: unknown): string {
  return String(value).replace(/\s+/g, " ").trim();
}
