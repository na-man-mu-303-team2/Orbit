import {
  enqueueWorkerHealthCheckJob,
  type EnqueueJobInput,
  type EnqueueWorkerHealthCheckJobInput,
  type UpdateJobInput
} from "@orbit/job-queue";
import { loadOrbitConfig } from "@orbit/config";
import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import type { DataSource } from "typeorm";
import { DbJobQueue } from "./db-job-queue";
import { serializeLogError } from "../logging";

export type WorkerHealthCheckEnqueueJob = (
  input: EnqueueWorkerHealthCheckJobInput
) => Promise<void>;

export const WORKER_HEALTH_CHECK_ENQUEUE_JOB =
  "WORKER_HEALTH_CHECK_ENQUEUE_JOB";

@Injectable()
export class JobsService {
  private readonly queue: DbJobQueue;

  constructor(
    @InjectDataSource() dataSource: DataSource,
    @Inject(WORKER_HEALTH_CHECK_ENQUEUE_JOB)
    private readonly enqueueWorkerHealthCheck: WorkerHealthCheckEnqueueJob,
    @InjectPinoLogger(JobsService.name)
    private readonly logger: PinoLogger
  ) {
    this.queue = new DbJobQueue(dataSource);
  }

  async create(input: EnqueueJobInput) {
    const queuedJob = await this.queue.enqueue(input);

    if (queuedJob.type !== "worker-health-check") {
      return queuedJob;
    }

    try {
      const config = loadOrbitConfig(process.env, { service: "api" });
      await this.enqueueWorkerHealthCheck({
        driver: config.JOB_QUEUE_DRIVER,
        redisUrl: config.REDIS_URL,
        jobId: queuedJob.jobId,
        projectId: queuedJob.projectId
      });
      this.logger.info(
        {
          event: "job.enqueued",
          jobId: queuedJob.jobId,
          jobType: queuedJob.type,
          projectId: queuedJob.projectId,
          driver: config.JOB_QUEUE_DRIVER
        },
        "Worker health check job enqueued."
      );
    } catch (error) {
      await this.queue.update(queuedJob.jobId, {
        status: "failed",
        progress: 0,
        message: "Worker health check enqueue failed.",
        error: {
          code: "WORKER_HEALTH_CHECK_ENQUEUE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Worker health check enqueue failed."
        }
      });
      this.logger.error(
        {
          event: "job.enqueue_failed",
          jobId: queuedJob.jobId,
          jobType: queuedJob.type,
          projectId: queuedJob.projectId,
          error: serializeLogError(error)
        },
        "Worker health check enqueue failed."
      );
      throw error;
    }

    return queuedJob;
  }

  get(jobId: string) {
    return this.queue.get(jobId);
  }

  update(jobId: string, patch: UpdateJobInput) {
    return this.queue.update(jobId, patch);
  }
}

export { enqueueWorkerHealthCheckJob };
