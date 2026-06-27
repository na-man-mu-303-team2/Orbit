import { loadOrbitConfig } from "@orbit/config";
import { InMemoryJobQueue } from "@orbit/job-queue";
import { demoIds } from "@orbit/shared";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";

@Injectable()
export class WorkerService implements OnModuleInit {
  private readonly logger = new Logger(WorkerService.name);
  private readonly queue = new InMemoryJobQueue();

  async onModuleInit() {
    const config = loadOrbitConfig(process.env, { service: "worker" });
    const job = await this.queue.enqueue({
      projectId: demoIds.projectId,
      type: "reference-extract",
      payload: {
        mode: "worker-boot-smoke",
        driver: config.JOB_QUEUE_DRIVER
      }
    });

    this.logger.log(
      `Worker ready with ${config.JOB_QUEUE_DRIVER}; smoke job ${job.jobId}`
    );
  }
}
