import {
  generateDeckQueueName,
  generateDeckStagedCoordinatorJobName,
  redisConnectionOptions,
} from "@orbit/job-queue";
import { Queue } from "bullmq";
import type { DataSource } from "typeorm";
import { z } from "zod";

import {
  recoverAiDeckBullMqFinalFailure,
  type AiDeckBullMqFailureRecoveryResult,
} from "./transport-failure-recovery";

const reconcileLimitSchema = z.number().int().min(1).max(500);

export interface FailedAiDeckCoordinatorJob {
  id?: string;
  name: string;
  data: unknown;
  attemptsMade: number;
  opts: { attempts?: number };
  remove(): Promise<void>;
}

interface FailedCoordinatorQueue {
  getJobs(
    types: ["failed"],
    start: number,
    end: number,
    asc: boolean,
  ): Promise<FailedAiDeckCoordinatorJob[]>;
  close(): Promise<void>;
}

type RecoveryFunction = (
  dataSource: DataSource,
  input: {
    queueName: string;
    jobName: string;
    data: unknown;
  },
) => Promise<AiDeckBullMqFailureRecoveryResult>;

export interface FailedAiDeckCoordinatorReconcilerOptions {
  redisUrl: string;
  limit?: number;
  queueFactory?: (redisUrl: string) => FailedCoordinatorQueue;
  recover?: RecoveryFunction;
  onError?: (error: unknown, job: FailedAiDeckCoordinatorJob) => void;
}

export async function reconcileFailedAiDeckCoordinatorJobs(
  dataSource: DataSource,
  options: FailedAiDeckCoordinatorReconcilerOptions,
): Promise<{ scanned: number; recovered: number; removed: number }> {
  const limit = reconcileLimitSchema.parse(options.limit ?? 100);
  const queue = (options.queueFactory ?? createQueue)(options.redisUrl);
  let scanned = 0;
  let recovered = 0;
  let removed = 0;
  try {
    const candidates: FailedAiDeckCoordinatorJob[] = [];
    let start = 0;
    while (true) {
      const jobs = await queue.getJobs(
        ["failed"],
        start,
        start + limit - 1,
        true,
      );
      scanned += jobs.length;
      candidates.push(...jobs.filter(isExhaustedCoordinator));
      if (jobs.length < limit) break;
      start += jobs.length;
    }

    for (const job of candidates) {
      try {
        const result = await (
          options.recover ?? recoverAiDeckBullMqFinalFailure
        )(dataSource, {
          queueName: generateDeckQueueName,
          jobName: job.name,
          data: job.data,
        });
        if (result === "coordinator-failed") recovered += 1;
        await job.remove();
        removed += 1;
      } catch (error) {
        options.onError?.(error, job);
      }
    }
    return { scanned, recovered, removed };
  } finally {
    await queue.close();
  }
}

function createQueue(redisUrl: string): FailedCoordinatorQueue {
  return new Queue(generateDeckQueueName, {
    connection: redisConnectionOptions(redisUrl),
    skipMetasUpdate: true,
  }) as unknown as FailedCoordinatorQueue;
}

function isExhaustedCoordinator(job: FailedAiDeckCoordinatorJob): boolean {
  if (job.name !== generateDeckStagedCoordinatorJobName) return false;
  const configuredAttempts =
    typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
  return job.attemptsMade >= Math.max(1, configuredAttempts);
}
