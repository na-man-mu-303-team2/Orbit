import {
  generateDeckQueueName,
  redisConnectionOptions,
  referenceExtractQueueName
} from "@orbit/job-queue";
import { loadOrbitConfig } from "@orbit/config";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { Worker as BullMqWorker } from "bullmq";
import type { DataSource } from "typeorm";
import { processGenerateDeckJob } from "./generate-deck.processor";
import { processReferenceExtractJob } from "./reference-extract.processor";

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private readonly config = loadOrbitConfig(process.env, { service: "worker" });
  private workers: BullMqWorker[] = [];

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  onModuleInit() {
    this.logger.log(`Worker ready with ${this.config.JOB_QUEUE_DRIVER}`);
    if (this.config.JOB_QUEUE_DRIVER === "sqs") {
      throw new Error("SqsJobQueue adapter is not implemented yet.");
    }

    this.workers = [
      new BullMqWorker(
        referenceExtractQueueName,
        async (job) => {
          const result = await processReferenceExtractJob(
            this.dataSource,
            this.config.PYTHON_WORKER_URL,
            job.data
          );
          this.logger.log(
            `Processed ${result.type} job ${result.jobId}: ${result.status}`
          );
          return result;
        },
        {
          connection: redisConnectionOptions(this.config.REDIS_URL)
        }
      ),
      new BullMqWorker(
        generateDeckQueueName,
        async (job) => {
          const result = await processGenerateDeckJob(
            this.dataSource,
            this.config.PYTHON_WORKER_URL,
            job.data
          );
          this.logger.log(
            `Processed ${result.type} job ${result.jobId}: ${result.status}`
          );
          return result;
        },
        {
          connection: redisConnectionOptions(this.config.REDIS_URL)
        }
      )
    ];

    for (const worker of this.workers) {
      worker.on("failed", (job, error) => {
        this.logger.error(
          `BullMQ job ${job?.id ?? "unknown"} failed: ${error.message}`
        );
      });
    }
  }

  async onModuleDestroy() {
    await Promise.all(this.workers.map((worker) => worker.close()));
  }
}
