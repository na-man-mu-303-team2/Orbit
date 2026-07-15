import {
  generateDeckQueueName,
  generateDeckStagedCoordinatorJobName,
  redisConnectionOptions,
} from "@orbit/job-queue";
import type { Job } from "@orbit/shared";
import { Queue } from "bullmq";
import type { DataSource } from "typeorm";
import { z } from "zod";

import {
  recoverAiDeckBullMqFinalFailure,
  type AiDeckBullMqFailureRecoveryResult,
} from "./transport-failure-recovery";
import { processAiDeckStagedCoordinatorJob } from "./staged-coordinator";

const reconcileLimitSchema = z.number().int().min(1).max(100);
const reconcileStartSchema = z.number().int().nonnegative();

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
  ): Promise<Array<FailedAiDeckCoordinatorJob | null | undefined>>;
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

type ResumeFunction = (
  dataSource: DataSource,
  data: unknown,
) => Promise<Job>;

export interface FailedAiDeckCoordinatorReconcilerOptions {
  redisUrl: string;
  start?: number;
  limit?: number;
  queueFactory?: (redisUrl: string) => FailedCoordinatorQueue;
  recover?: RecoveryFunction;
  resume?: ResumeFunction;
  onError?: (error: unknown, job: FailedAiDeckCoordinatorJob) => void;
}

export async function reconcileFailedAiDeckCoordinatorJobs(
  dataSource: DataSource,
  options: FailedAiDeckCoordinatorReconcilerOptions,
): Promise<{
  scanned: number;
  recovered: number;
  resumed: number;
  removed: number;
  nextStart: number;
}> {
  const start = reconcileStartSchema.parse(options.start ?? 0);
  const limit = reconcileLimitSchema.parse(options.limit ?? 25);
  const queue = (options.queueFactory ?? createQueue)(options.redisUrl);
  let scanned = 0;
  let recovered = 0;
  let resumed = 0;
  let removed = 0;
  try {
    const queueRows = await queue.getJobs(
      ["failed"],
      start,
      start + limit - 1,
      true,
    );
    const jobs = queueRows.filter(isFailedCoordinatorJob);
    scanned = jobs.length;
    const candidates = jobs.filter(isStagedCoordinator);

    for (const job of candidates) {
      try {
        if (hasExhaustedConfiguredAttempts(job)) {
          const result = await (
            options.recover ?? recoverAiDeckBullMqFinalFailure
          )(dataSource, {
            queueName: generateDeckQueueName,
            jobName: job.name,
            data: job.data,
          });
          if (result === "coordinator-failed") recovered += 1;
        } else {
          await (options.resume ?? processAiDeckStagedCoordinatorJob)(
            dataSource,
            job.data,
          );
          resumed += 1;
        }
        await job.remove();
        removed += 1;
      } catch (error) {
        options.onError?.(error, job);
      }
    }
    const nextStart =
      queueRows.length < limit
        ? 0
        : Math.max(0, start + queueRows.length - removed);
    return { scanned, recovered, resumed, removed, nextStart };
  } finally {
    await queue.close();
  }
}

function isFailedCoordinatorJob(
  job: FailedAiDeckCoordinatorJob | null | undefined,
): job is FailedAiDeckCoordinatorJob {
  return job !== null && job !== undefined;
}

function createQueue(redisUrl: string): FailedCoordinatorQueue {
  return new Queue(generateDeckQueueName, {
    connection: redisConnectionOptions(redisUrl),
    skipMetasUpdate: true,
  }) as unknown as FailedCoordinatorQueue;
}

function isStagedCoordinator(job: FailedAiDeckCoordinatorJob): boolean {
  return job.name === generateDeckStagedCoordinatorJobName;
}

function hasExhaustedConfiguredAttempts(
  job: FailedAiDeckCoordinatorJob,
): boolean {
  const configuredAttempts =
    typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
  return job.attemptsMade >= Math.max(1, configuredAttempts);
}
