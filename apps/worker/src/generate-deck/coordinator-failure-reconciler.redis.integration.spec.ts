import {
  generateDeckQueueName,
  generateDeckStagedCoordinatorJobName,
  redisConnectionOptions,
} from "@orbit/job-queue";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { randomUUID } from "node:crypto";
import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { reconcileFailedAiDeckCoordinatorJobs } from "./coordinator-failure-reconciler";

const redisUrl = process.env.AI_DECK_REDIS_INTEGRATION_URL;
const describeRedis = redisUrl ? describe : describe.skip;
type ProofJobData = { jobId: string; projectId: string };

describeRedis("failed coordinator Redis integration", () => {
  it(
    "scans, retains, revisits, and removes a real failed BullMQ coordinator",
    async () => {
      if (!redisUrl) throw new Error("AI_DECK_REDIS_INTEGRATION_URL is required.");
      const admin = new Redis(redisUrl);
      const connection = redisConnectionOptions(redisUrl);
      let queue: Queue<ProofJobData, never, string> | null = null;
      let worker: Worker<ProofJobData, never, string> | null = null;

      try {
        if ((await admin.dbsize()) !== 0) {
          throw new Error("Redis integration database must be empty.");
        }
        queue = new Queue<ProofJobData, never, string>(generateDeckQueueName, {
          connection,
          skipMetasUpdate: true,
        });
        worker = new Worker<ProofJobData, never, string>(
          generateDeckQueueName,
          async () => {
            throw new Error("expected Redis integration failure");
          },
          { connection },
        );
        await worker.waitUntilReady();

        const coordinatorId = `zscan-coordinator-${randomUUID()}`;
        const unrelatedId = `zscan-unrelated-${randomUUID()}`;
        const coordinator = await queue.add(
          generateDeckStagedCoordinatorJobName,
          { jobId: coordinatorId, projectId: "project-zscan-integration" },
          { jobId: coordinatorId, attempts: 1, removeOnFail: false },
        );
        const unrelated = await queue.add(
          "generate-deck",
          { jobId: unrelatedId, projectId: "project-zscan-integration" },
          { jobId: unrelatedId, attempts: 1, removeOnFail: false },
        );
        await Promise.all([waitForFailed(coordinator), waitForFailed(unrelated)]);
        await worker.close();
        worker = null;

        const recoveryError = new Error("expected database outage");
        const recover = vi
          .fn()
          .mockRejectedValueOnce(recoveryError)
          .mockResolvedValueOnce("coordinator-failed" as const);
        const first = await reconcileFailedAiDeckCoordinatorJobs(
          {} as DataSource,
          { redisUrl, limit: 100, recover },
        );

        expect(first).toMatchObject({ recovered: 0, removed: 0 });
        expect(await coordinator.getState()).toBe("failed");

        const second = await reconcileFailedAiDeckCoordinatorJobs(
          {} as DataSource,
          { redisUrl, cursor: first.nextCursor, limit: 100, recover },
        );

        expect(second).toMatchObject({ recovered: 1, removed: 1 });
        expect(recover).toHaveBeenCalledTimes(2);
        expect(await queue.getJob(coordinatorId)).toBeUndefined();
        expect(await unrelated.getState()).toBe("failed");
      } finally {
        await worker?.close().catch(() => undefined);
        await queue?.obliterate({ force: true }).catch(() => undefined);
        await queue?.close().catch(() => undefined);
        await admin.quit();
      }
    },
    15_000,
  );
});

async function waitForFailed(job: { getState(): Promise<string> }) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await job.getState()) === "failed") return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("BullMQ integration job did not reach failed state.");
}
