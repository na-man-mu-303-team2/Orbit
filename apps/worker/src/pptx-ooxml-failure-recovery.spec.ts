import {
  pptxOoxmlGenerationQueueName,
  pptxOoxmlSyncQueueName,
} from "@orbit/job-queue";
import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { recoverPptxOoxmlFinalFailure } from "./pptx-ooxml-failure-recovery";

describe("PPTX OOXML final failure recovery", () => {
  it.each([
    [
      pptxOoxmlGenerationQueueName,
      "pptx-ooxml-generation",
      "PPTX_OOXML_GENERATION_WORKER_TERMINATED",
    ],
    [
      pptxOoxmlSyncQueueName,
      "pptx-ooxml-sync",
      "PPTX_OOXML_SYNC_WORKER_TERMINATED",
    ],
  ] as const)("marks a terminal %s job failed", async (queueName, type, code) => {
    const query = vi.fn(async (_sql: string, params: unknown[]) => [
      { job_id: params[0] as string },
    ]);

    await expect(
      recoverPptxOoxmlFinalFailure(
        { query } as unknown as Pick<DataSource, "query">,
        {
          queueName,
          data: { jobId: "job-1", projectId: "project-a" },
        },
      ),
    ).resolves.toEqual({ outcome: "recovered", jobId: "job-1" });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status IN ('queued', 'running')"),
      expect.arrayContaining(["job-1", "project-a", type, code]),
    );
    expect(query.mock.calls[0]?.[1]?.[4]).toBe(code);
  });

  it("ignores unrelated queues and malformed payloads", async () => {
    const query = vi.fn();
    const dataSource = { query } as unknown as Pick<DataSource, "query">;

    await expect(
      recoverPptxOoxmlFinalFailure(dataSource, {
        queueName: "other-queue",
        data: { jobId: "job-1", projectId: "project-a" },
      }),
    ).resolves.toEqual({ outcome: "ignored", jobId: null });
    await expect(
      recoverPptxOoxmlFinalFailure(dataSource, {
        queueName: pptxOoxmlGenerationQueueName,
        data: {},
      }),
    ).resolves.toEqual({ outcome: "ignored", jobId: null });
    expect(query).not.toHaveBeenCalled();
  });
});
