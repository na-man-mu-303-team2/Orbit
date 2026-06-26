import { EnqueueJobInput, InMemoryJobQueue } from "@orbit/job-queue";
import { Injectable } from "@nestjs/common";

@Injectable()
export class JobsService {
  private readonly queue = new InMemoryJobQueue();

  create(input: EnqueueJobInput) {
    return this.queue.enqueue(input);
  }

  get(jobId: string) {
    return this.queue.get(jobId);
  }
}

