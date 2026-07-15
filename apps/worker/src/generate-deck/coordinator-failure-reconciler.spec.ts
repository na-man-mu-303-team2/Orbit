import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { reconcileFailedAiDeckCoordinatorJobs } from "./coordinator-failure-reconciler";

describe("reconcileFailedAiDeckCoordinatorJobs", () => {
  it("retries DB recovery for a retained exhausted coordinator and removes it", async () => {
    const job = failedCoordinatorJob();
    const queue = failedQueue(job);
    const recover = vi.fn(async () => "coordinator-failed" as const);

    await expect(
      reconcileFailedAiDeckCoordinatorJobs({} as DataSource, {
        redisUrl: "redis://localhost:6379",
        queueFactory: () => queue,
        recover,
      }),
    ).resolves.toEqual({
      scanned: 1,
      recovered: 1,
      resumed: 0,
      removed: 1,
      nextCursor: emptyCursor(),
    });

    expect(queue.scanFailed).toHaveBeenCalledWith("0", 25);
    expect(queue.getJob).toHaveBeenCalledWith(job.id);
    expect(recover).toHaveBeenCalledWith(expect.anything(), {
      queueName: "generate-deck",
      jobName: "generate-deck-staged-coordinator",
      data: { jobId: "job-ai-deck-1", projectId: "project-a" },
    });
    expect(job.remove).toHaveBeenCalledTimes(1);
    expect(queue.close).toHaveBeenCalledTimes(1);
  });

  it("keeps the failed coordinator when DB recovery is still unavailable", async () => {
    const job = failedCoordinatorJob();
    const queue = failedQueue(job);
    const onError = vi.fn();
    const recoveryError = new Error("database unavailable");

    await expect(
      reconcileFailedAiDeckCoordinatorJobs({} as DataSource, {
        redisUrl: "redis://localhost:6379",
        queueFactory: () => queue,
        recover: vi.fn(async () => {
          throw recoveryError;
        }),
        onError,
      }),
    ).resolves.toEqual({
      scanned: 1,
      recovered: 0,
      resumed: 0,
      removed: 0,
      nextCursor: emptyCursor(),
    });

    expect(job.remove).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(recoveryError, job);
    expect(queue.close).toHaveBeenCalledTimes(1);
  });

  it("ignores unrelated failed jobs", async () => {
    const unrelated = failedCoordinatorJob({ name: "generate-deck" });
    const queue = failedQueue(unrelated);
    const recover = vi.fn();

    await expect(
      reconcileFailedAiDeckCoordinatorJobs({} as DataSource, {
        redisUrl: "redis://localhost:6379",
        queueFactory: () => queue,
        recover,
      }),
    ).resolves.toEqual({
      scanned: 1,
      recovered: 0,
      resumed: 0,
      removed: 0,
      nextCursor: emptyCursor(),
    });

    expect(recover).not.toHaveBeenCalled();
    expect(unrelated.remove).not.toHaveBeenCalled();
  });

  it("idempotently resumes a stalled coordinator whose DB transaction already committed", async () => {
    const stalled = failedCoordinatorJob({ attemptsMade: 1 });
    const queue = failedQueue(stalled);
    const recover = vi.fn();
    const resume = vi.fn(async () => runningParentJob());

    await expect(
      reconcileFailedAiDeckCoordinatorJobs({} as DataSource, {
        redisUrl: "redis://localhost:6379",
        queueFactory: () => queue,
        recover,
        resume,
      }),
    ).resolves.toEqual({
      scanned: 1,
      recovered: 0,
      resumed: 1,
      removed: 1,
      nextCursor: emptyCursor(),
    });

    expect(resume).toHaveBeenCalledWith(expect.anything(), stalled.data);
    expect(recover).not.toHaveBeenCalled();
    expect(stalled.remove).toHaveBeenCalledTimes(1);
  });

  it("preserves an oversized ZSCAN batch in pending IDs for the next tick", async () => {
    const unrelated = Array.from({ length: 100 }, (_, index) =>
      failedCoordinatorJob({ id: `legacy-${index}`, name: "generate-deck" }),
    );
    const coordinator = failedCoordinatorJob();
    const queue = failedQueue(...unrelated, coordinator);
    queue.scanFailed.mockResolvedValueOnce({
      nextCursor: "17",
      jobIds: [...unrelated, coordinator].map((job) => job.id),
    });
    const recover = vi.fn(async () => "coordinator-failed" as const);

    const first = await reconcileFailedAiDeckCoordinatorJobs(
      {} as DataSource,
      {
        redisUrl: "redis://localhost:6379",
        limit: 100,
        queueFactory: () => queue,
        recover,
      },
    );

    expect(first).toEqual({
      scanned: 100,
      recovered: 0,
      resumed: 0,
      removed: 0,
      nextCursor: {
        redisCursor: "17",
        pendingJobIds: [coordinator.id],
      },
    });

    await expect(
      reconcileFailedAiDeckCoordinatorJobs({} as DataSource, {
        redisUrl: "redis://localhost:6379",
        cursor: first.nextCursor,
        limit: 100,
        queueFactory: () => queue,
        recover,
      }),
    ).resolves.toEqual({
      scanned: 1,
      recovered: 1,
      resumed: 0,
      removed: 1,
      nextCursor: { redisCursor: "17", pendingJobIds: [] },
    });

    expect(queue.scanFailed).toHaveBeenCalledTimes(1);
    expect(recover).toHaveBeenCalledTimes(1);
    expect(coordinator.remove).toHaveBeenCalledTimes(1);
  });

  it("continues with the opaque Redis cursor after another replica removes an earlier member", async () => {
    const unrelated = failedCoordinatorJob({
      id: "legacy-removed-by-peer",
      name: "generate-deck",
    });
    const coordinator = failedCoordinatorJob();
    const queue = failedQueue(unrelated, coordinator);
    queue.scanFailed
      .mockResolvedValueOnce({ nextCursor: "17", jobIds: [unrelated.id] })
      .mockResolvedValueOnce({ nextCursor: "0", jobIds: [coordinator.id] });
    const recover = vi.fn(async () => "coordinator-failed" as const);

    const first = await reconcileFailedAiDeckCoordinatorJobs(
      {} as DataSource,
      {
        redisUrl: "redis://localhost:6379",
        queueFactory: () => queue,
        recover,
      },
    );
    await unrelated.remove();

    await expect(
      reconcileFailedAiDeckCoordinatorJobs({} as DataSource, {
        redisUrl: "redis://localhost:6379",
        cursor: first.nextCursor,
        queueFactory: () => queue,
        recover,
      }),
    ).resolves.toMatchObject({ recovered: 1, removed: 1 });

    expect(queue.scanFailed).toHaveBeenNthCalledWith(1, "0", 25);
    expect(queue.scanFailed).toHaveBeenNthCalledWith(2, "17", 25);
    expect(coordinator.remove).toHaveBeenCalledTimes(1);
  });

  it("revisits a retained recovery failure after the opaque cursor completes a full cycle", async () => {
    const coordinator = failedCoordinatorJob();
    const unrelated = failedCoordinatorJob({
      id: "legacy-between-cursors",
      name: "generate-deck",
    });
    const queue = failedQueue(coordinator, unrelated);
    queue.scanFailed
      .mockResolvedValueOnce({ nextCursor: "17", jobIds: [coordinator.id] })
      .mockResolvedValueOnce({ nextCursor: "0", jobIds: [unrelated.id] })
      .mockResolvedValueOnce({ nextCursor: "17", jobIds: [coordinator.id] });
    const recoveryError = new Error("database unavailable");
    const recover = vi
      .fn()
      .mockRejectedValueOnce(recoveryError)
      .mockResolvedValueOnce("coordinator-failed" as const);

    const first = await reconcileFailedAiDeckCoordinatorJobs(
      {} as DataSource,
      {
        redisUrl: "redis://localhost:6379",
        queueFactory: () => queue,
        recover,
      },
    );
    const second = await reconcileFailedAiDeckCoordinatorJobs(
      {} as DataSource,
      {
        redisUrl: "redis://localhost:6379",
        cursor: first.nextCursor,
        queueFactory: () => queue,
        recover,
      },
    );

    await expect(
      reconcileFailedAiDeckCoordinatorJobs({} as DataSource, {
        redisUrl: "redis://localhost:6379",
        cursor: second.nextCursor,
        queueFactory: () => queue,
        recover,
      }),
    ).resolves.toMatchObject({ recovered: 1, removed: 1 });

    expect(recover).toHaveBeenCalledTimes(2);
    expect(coordinator.remove).toHaveBeenCalledTimes(1);
  });

  it("skips missing and duplicate jobs returned during concurrent cleanup", async () => {
    const coordinator = failedCoordinatorJob();
    const queue = failedQueue(coordinator);
    queue.scanFailed.mockResolvedValueOnce({
      nextCursor: "0",
      jobIds: ["missing", coordinator.id, coordinator.id],
    });
    const recover = vi.fn(async () => "coordinator-failed" as const);

    await expect(
      reconcileFailedAiDeckCoordinatorJobs({} as DataSource, {
        redisUrl: "redis://localhost:6379",
        queueFactory: () => queue,
        recover,
      }),
    ).resolves.toEqual({
      scanned: 1,
      recovered: 1,
      resumed: 0,
      removed: 1,
      nextCursor: emptyCursor(),
    });

    expect(queue.getJob).toHaveBeenCalledTimes(2);
    expect(coordinator.remove).toHaveBeenCalledTimes(1);
  });
});

function failedCoordinatorJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-ai-deck-1",
    name: "generate-deck-staged-coordinator",
    data: { jobId: "job-ai-deck-1", projectId: "project-a" },
    attemptsMade: 5,
    opts: { attempts: 5 },
    remove: vi.fn(async () => undefined),
    ...overrides,
  };
}

function runningParentJob() {
  return {
    jobId: "job-ai-deck-1",
    projectId: "project-a",
    type: "ai-deck-generation" as const,
    status: "running" as const,
    progress: 10,
    message: "AI deck staged generation running.",
    result: null,
    error: null,
    createdAt: "2026-07-15T01:00:00.000Z",
    updatedAt: "2026-07-15T01:00:00.000Z",
  };
}

function emptyCursor() {
  return { redisCursor: "0", pendingJobIds: [] };
}

function failedQueue(...jobs: ReturnType<typeof failedCoordinatorJob>[]) {
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  return {
    scanFailed: vi.fn(async () => ({
      nextCursor: "0",
      jobIds: jobs.map((job) => job.id),
    })),
    getJob: vi.fn(async (jobId: string) => jobsById.get(jobId)),
    close: vi.fn(async () => undefined),
  };
}
