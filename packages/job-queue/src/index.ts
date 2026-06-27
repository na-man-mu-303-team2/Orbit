import { Job, JobType, demoIds, jobSchema, nowIso } from "@orbit/shared";
import { Queue } from "bullmq";

export interface EnqueueJobInput {
  projectId?: string;
  type: JobType;
  payload?: Record<string, unknown>;
}

export interface JobQueuePort {
  enqueue(input: EnqueueJobInput): Promise<Job>;
  update(jobId: string, patch: UpdateJobInput): Promise<Job | null>;
  get(jobId: string): Promise<Job | null>;
}

export type UpdateJobInput = Partial<
  Pick<Job, "status" | "progress" | "message" | "result" | "error">
>;

export const referenceExtractQueueName = "reference-extract";
export const referenceExtractJobName = "reference-extract";

export interface ReferenceExtractBullMqFile {
  fileId: string;
  originalName: string;
  mimeType: string;
  contentBase64: string;
}

export interface ReferenceExtractBullMqPayload {
  jobId: string;
  projectId: string;
  files: ReferenceExtractBullMqFile[];
}

export interface EnqueueReferenceExtractJobInput
  extends ReferenceExtractBullMqPayload {
  driver: "bullmq" | "sqs";
  redisUrl: string;
}

export async function enqueueReferenceExtractJob(
  input: EnqueueReferenceExtractJobInput
): Promise<void> {
  if (input.driver === "sqs") {
    throw new Error("SqsJobQueue adapter is not implemented yet.");
  }

  const queue = new Queue(referenceExtractQueueName, {
    connection: redisConnectionOptions(input.redisUrl)
  });

  try {
    await queue.add(referenceExtractJobName, {
      jobId: input.jobId,
      projectId: input.projectId,
      files: input.files
    } satisfies ReferenceExtractBullMqPayload);
  } finally {
    await queue.close();
  }
}

export function redisConnectionOptions(redisUrl: string) {
  const url = new URL(redisUrl);
  if (!["redis:", "rediss:"].includes(url.protocol)) {
    throw new Error("REDIS_URL must use redis:// or rediss://.");
  }

  const db = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined;
  if (db !== undefined && !Number.isInteger(db)) {
    throw new Error("REDIS_URL database index must be an integer.");
  }

  return {
    db,
    host: url.hostname,
    maxRetriesPerRequest: null,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    port: url.port ? Number(url.port) : 6379,
    tls: url.protocol === "rediss:" ? {} : undefined,
    username: url.username ? decodeURIComponent(url.username) : undefined
  };
}

export class InMemoryJobQueue implements JobQueuePort {
  private readonly jobs = new Map<string, Job>();
  private jobSequence = 0;

  async enqueue(input: EnqueueJobInput): Promise<Job> {
    const now = nowIso();
    this.jobSequence += 1;
    const job = jobSchema.parse({
      jobId: `job_${Date.now()}_${this.jobSequence}`,
      projectId: input.projectId ?? demoIds.projectId,
      type: input.type,
      status: "queued",
      progress: 0,
      message: "작업 대기 중",
      result: input.payload ?? null,
      error: null,
      createdAt: now,
      updatedAt: now
    });

    this.jobs.set(job.jobId, job);
    return job;
  }

  async get(jobId: string): Promise<Job | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async update(jobId: string, patch: UpdateJobInput): Promise<Job | null> {
    const current = this.jobs.get(jobId);
    if (!current) {
      return null;
    }

    const job = jobSchema.parse({
      ...current,
      ...patch,
      updatedAt: nowIso()
    });
    this.jobs.set(jobId, job);
    return job;
  }
}

export class BullMqJobQueue extends InMemoryJobQueue {
  readonly driver = "bullmq" as const;
}

export class SqsJobQueue implements JobQueuePort {
  async enqueue(_input: EnqueueJobInput): Promise<Job> {
    throw new Error("SqsJobQueue adapter is not implemented yet.");
  }

  async get(_jobId: string): Promise<Job | null> {
    throw new Error("SqsJobQueue adapter is not implemented yet.");
  }

  async update(_jobId: string, _patch: UpdateJobInput): Promise<Job | null> {
    throw new Error("SqsJobQueue adapter is not implemented yet.");
  }
}
