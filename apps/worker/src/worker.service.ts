import { loadOrbitConfig } from "@orbit/config";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";
import { processNextReferenceExtractJob } from "./reference-extract.processor";

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private readonly config = loadOrbitConfig(process.env, { service: "worker" });
  private processing = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  onModuleInit() {
    this.logger.log(`Worker ready with ${this.config.JOB_QUEUE_DRIVER}`);
    this.timer = setInterval(() => {
      void this.processOnce();
    }, 1000);
    void this.processOnce();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async processOnce() {
    if (this.processing) {
      return;
    }

    this.processing = true;
    try {
      const job = await processNextReferenceExtractJob(
        this.dataSource,
        this.config.PYTHON_WORKER_URL
      );
      if (job) {
        this.logger.log(`Processed ${job.type} job ${job.jobId}: ${job.status}`);
      }
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : error);
    } finally {
      this.processing = false;
    }
  }
}
