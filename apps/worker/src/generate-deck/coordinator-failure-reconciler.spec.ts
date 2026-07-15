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
    ).resolves.toEqual({ scanned: 1, recovered: 1, removed: 1 });

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
    ).resolves.toEqual({ scanned: 1, recovered: 0, removed: 0 });

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
    ).resolves.toEqual({ scanned: 2, recovered: 0, removed: 0 });

    expect(recover).not.toHaveBeenCalled();
    expect(unrelated.remove).not.toHaveBeenCalled();
    expect(nonExhausted.remove).not.toHaveBeenCalled();
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
    getJobs: vi.fn(async () => jobs),
    close: vi.fn(async () => undefined),
  };
}
