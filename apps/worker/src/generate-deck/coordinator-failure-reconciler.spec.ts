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
      removed: 1,
      nextStart: 0,
    });

    expect(queue.getJobs).toHaveBeenCalledWith(["failed"], 0, 99, true);
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
      removed: 0,
      nextStart: 0,
    });

    expect(job.remove).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(recoveryError, job);
    expect(queue.close).toHaveBeenCalledTimes(1);
  });

  it("ignores unrelated or non-exhausted failed jobs", async () => {
    const unrelated = failedCoordinatorJob({ name: "generate-deck" });
    const nonExhausted = failedCoordinatorJob({ attemptsMade: 4 });
    const queue = failedQueue(unrelated, nonExhausted);
    const recover = vi.fn();

    await expect(
      reconcileFailedAiDeckCoordinatorJobs({} as DataSource, {
        redisUrl: "redis://localhost:6379",
        queueFactory: () => queue,
        recover,
      }),
    ).resolves.toEqual({
      scanned: 2,
      recovered: 0,
      removed: 0,
      nextStart: 0,
    });

    expect(recover).not.toHaveBeenCalled();
    expect(unrelated.remove).not.toHaveBeenCalled();
    expect(nonExhausted.remove).not.toHaveBeenCalled();
  });

  it("bounds each scan and resumes from a cursor on the next tick", async () => {
    const unrelated = Array.from({ length: 100 }, (_, index) =>
      failedCoordinatorJob({ id: `legacy-${index}`, name: "generate-deck" }),
    );
    const coordinator = failedCoordinatorJob();
    const queue = failedQueue(...unrelated, coordinator);
    const recover = vi.fn(async () => "coordinator-failed" as const);

    const first = await reconcileFailedAiDeckCoordinatorJobs(
      {} as DataSource,
      {
        redisUrl: "redis://localhost:6379",
        queueFactory: () => queue,
        recover,
      },
    );

    expect(first).toEqual({
      scanned: 100,
      recovered: 0,
      removed: 0,
      nextStart: 100,
    });

    await expect(
      reconcileFailedAiDeckCoordinatorJobs({} as DataSource, {
        redisUrl: "redis://localhost:6379",
        start: first.nextStart,
        queueFactory: () => queue,
        recover,
      }),
    ).resolves.toEqual({
      scanned: 1,
      recovered: 1,
      removed: 1,
      nextStart: 0,
    });

    expect(queue.getJobs).toHaveBeenNthCalledWith(1, ["failed"], 0, 99, true);
    expect(queue.getJobs).toHaveBeenNthCalledWith(2, ["failed"], 100, 199, true);
    expect(recover).toHaveBeenCalledTimes(1);
    expect(coordinator.remove).toHaveBeenCalledTimes(1);
  });

  it("skips missing jobs returned during concurrent replica cleanup", async () => {
    const coordinator = failedCoordinatorJob();
    const queue = {
      getJobs: vi.fn(async () => [undefined, coordinator, null]),
      close: vi.fn(async () => undefined),
    };
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
      removed: 1,
      nextStart: 0,
    });
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

function failedQueue(...jobs: ReturnType<typeof failedCoordinatorJob>[]) {
  return {
    getJobs: vi.fn(
      async (_types: ["failed"], start: number, end: number) =>
        jobs.slice(start, end + 1),
    ),
    close: vi.fn(async () => undefined),
  };
}
