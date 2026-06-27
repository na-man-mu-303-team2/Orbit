import type { EnqueueJobInput, UpdateJobInput } from "@orbit/job-queue";
import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";
import { DbJobQueue } from "./db-job-queue";

@Injectable()
export class JobsService {
  private readonly queue: DbJobQueue;

  constructor(@InjectDataSource() dataSource: DataSource) {
    this.queue = new DbJobQueue(dataSource);
  }

  create(input: EnqueueJobInput) {
    return this.queue.enqueue(input);
  }

  get(jobId: string) {
    return this.queue.get(jobId);
  }

  update(jobId: string, patch: UpdateJobInput) {
    return this.queue.update(jobId, patch);
  }
}
