import {
  redisConnectionOptions,
  referenceExtractQueueName,
  rehearsalSttQueueName
} from "@orbit/job-queue";
import { loadOrbitConfig } from "@orbit/config";
import type { Job as OrbitJob } from "@orbit/shared";
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { type Job as BullMqJob, Worker as BullMqWorker } from "bullmq";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import type { DataSource } from "typeorm";
import { serializeLogError } from "./logging";
import { processReferenceExtractJob } from "./reference-extract.processor";
import { processRehearsalSttJob } from "./rehearsal-stt.processor";
import { workerStorage } from "./storage";

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly config = loadOrbitConfig(process.env, { service: "worker" });
  private workers: BullMqWorker[] = [];

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectPinoLogger(WorkerService.name)
    private readonly logger: PinoLogger
  ) {}

  onModuleInit() {
    this.logger.info(
      {
        event: "worker.ready",
        driver: this.config.JOB_QUEUE_DRIVER,
        queueNames: [referenceExtractQueueName, rehearsalSttQueueName]
      },
      "Worker ready."
    );
    if (this.config.JOB_QUEUE_DRIVER === "sqs") {
      throw new Error("SqsJobQueue adapter is not implemented yet.");
    }

    const connection = redisConnectionOptions(this.config.REDIS_URL);
    const storage = workerStorage();

    this.workers = [
      new BullMqWorker(
        referenceExtractQueueName,
        (job) =>
          this.processJob(referenceExtractQueueName, job, () =>
            processReferenceExtractJob(
              this.dataSource,
              this.config.PYTHON_WORKER_URL,
              job.data
            )
          ),
        {
          connection
        }
      ),
      new BullMqWorker(
        rehearsalSttQueueName,
        (job) =>
          this.processJob(rehearsalSttQueueName, job, () =>
            processRehearsalSttJob(
              this.dataSource,
              storage,
              this.config.PYTHON_WORKER_URL,
              job.data
            )
          ),
        {
          connection
        }
      )
    ];

    for (const worker of this.workers) {
      worker.on("failed", (job, error) => {
        this.logger.error(
          {
            event: "bullmq.job.failed",
            queueName: worker.name,
            bullJobId: job?.id,
            attemptsMade: job?.attemptsMade,
            ...jobPayloadFields(job?.data),
            error: serializeLogError(error)
          },
          "BullMQ job failed."
        );
      });
    }
  }

  async onModuleDestroy() {
    await Promise.all(this.workers.map((worker) => worker.close()));
    this.logger.info(
      {
        event: "worker.stopped",
        queueNames: [referenceExtractQueueName, rehearsalSttQueueName]
      },
      "Worker stopped."
    );
  }

  private async processJob(
    queueName: string,
    job: BullMqJob,
    handler: () => Promise<OrbitJob>
  ): Promise<OrbitJob> {
    const startedAt = Date.now();
    const baseFields = {
      queueName,
      bullJobId: job.id,
      attemptsMade: job.attemptsMade,
      ...jobPayloadFields(job.data)
    };

    this.logger.info(
      {
        event: "job.started",
        ...baseFields
      },
      "Job started."
    );

    try {
      const result = await handler();
      const durationMs = Date.now() - startedAt;
      const event = result.status === "failed" ? "job.failed" : "job.succeeded";
      const level = result.status === "failed" ? "error" : "info";

      this.logger[level](
        {
          event,
          ...baseFields,
          jobId: result.jobId,
          jobType: result.type,
          projectId: result.projectId,
          status: result.status,
          durationMs,
          error: result.error ?? undefined
        },
        "Job finished."
      );
      return result;
    } catch (error) {
      this.logger.error(
        {
          event: "job.failed",
          ...baseFields,
          durationMs: Date.now() - startedAt,
          error: serializeLogError(error)
        },
        "Job failed."
      );
      throw error;
    }
  }
}

function jobPayloadFields(data: unknown) {
  const payload = isRecord(data) ? data : {};
  return {
    jobId: readString(payload, "jobId"),
    jobType: readString(payload, "type"),
    projectId: readString(payload, "projectId"),
    runId: readString(payload, "runId"),
    deckId: readString(payload, "deckId"),
    audioFileId: readString(payload, "audioFileId"),
    fileCount: Array.isArray(payload.files) ? payload.files.length : undefined
  };
}

function readString(value: Record<string, unknown>, key: string) {
  const raw = value[key];
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
