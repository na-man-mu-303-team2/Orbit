import {
  Job,
  JobType,
  deckSchema,
  demoIds,
  deckExportFormatSchema,
  generateDeckRequestSchema,
  aiTemplateDeckGenerationRequestSchema,
  jobSchema,
  nowIso,
  type AiTemplateDeckGenerationRequest,
  type Deck,
  type DeckExportFormat,
  type PptxOoxmlGenerationRequest,
  type GenerateDeckRequest,
  type SavedDesignPackSnapshot,
  type BrandKitSnapshot,
} from "@orbit/shared";
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
export const rehearsalSttQueueName = "rehearsal-stt";
export const rehearsalSttJobName = "rehearsal-stt";
export const generateDeckQueueName = "generate-deck";
export const generateDeckJobName = "generate-deck";
export const deckExportQueueName = "deck-export";
export const deckExportJobName = "deck-export";
export const aiTemplateDeckGenerationQueueName = "ai-template-deck-generation";
export const aiTemplateDeckGenerationJobName = "ai-template-deck-generation";
export const pptxImportQueueName = "pptx-import";
export const pptxImportJobName = "pptx-import";
export const pptxOoxmlGenerationQueueName = "pptx-ooxml-generation";
export const pptxOoxmlGenerationJobName = "pptx-ooxml-generation";
export const pptxOoxmlSyncQueueName = "pptx-ooxml-sync";
export const pptxOoxmlSyncJobName = "pptx-ooxml-sync";
export const workerHealthCheckQueueName = "worker-health-check";
export const workerHealthCheckJobName = "worker-health-check";

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

export interface EnqueueReferenceExtractJobInput extends ReferenceExtractBullMqPayload {
  driver: "bullmq" | "sqs";
  redisUrl: string;
}

export interface RehearsalSttBullMqPayload {
  jobId: string;
  projectId: string;
  runId: string;
  deckId: string;
  audioFileId: string;
}

export interface EnqueueRehearsalSttJobInput extends RehearsalSttBullMqPayload {
  driver: "bullmq" | "sqs";
  redisUrl: string;
}

export interface GenerateDeckBullMqPayload {
  jobId: string;
  projectId: string;
  request: GenerateDeckRequest;
  designPackSnapshot?: SavedDesignPackSnapshot;
  brandKitSnapshot?: BrandKitSnapshot;
  imageAssetScope?: {
    userId: string;
    organizationId?: string;
  };
}

export interface EnqueueGenerateDeckJobInput extends GenerateDeckBullMqPayload {
  driver: "bullmq" | "sqs";
  redisUrl: string;
}

export interface DeckExportBullMqPayload {
  jobId: string;
  projectId: string;
  deck: Deck;
  format: DeckExportFormat;
}

export interface EnqueueDeckExportJobInput extends DeckExportBullMqPayload {
  driver: "bullmq" | "sqs";
  redisUrl: string;
}

export interface AiTemplateDeckGenerationBullMqPayload {
  jobId: string;
  projectId: string;
  request: AiTemplateDeckGenerationRequest;
}

export interface EnqueueAiTemplateDeckGenerationJobInput
  extends AiTemplateDeckGenerationBullMqPayload {
  driver: "bullmq" | "sqs";
  redisUrl: string;
}

export interface PptxImportBullMqPayload {
  jobId: string;
  projectId: string;
  fileId: string;
}

export interface EnqueuePptxImportJobInput extends PptxImportBullMqPayload {
  driver: "bullmq" | "sqs";
  redisUrl: string;
}

export interface PptxOoxmlGenerationBullMqPayload {
  jobId: string;
  projectId: string;
  request: PptxOoxmlGenerationRequest;
}

export interface EnqueuePptxOoxmlGenerationJobInput extends PptxOoxmlGenerationBullMqPayload {
  driver: "bullmq" | "sqs";
  redisUrl: string;
}

export interface PptxOoxmlSyncBullMqPayload {
  jobId: string;
  projectId: string;
  deckId: string;
  changeId: string;
  targetDeckVersion: number;
}

export interface EnqueuePptxOoxmlSyncJobInput extends PptxOoxmlSyncBullMqPayload {
  driver: "bullmq" | "sqs";
  redisUrl: string;
}

export interface WorkerHealthCheckBullMqPayload {
  jobId: string;
  projectId: string;
}

export interface EnqueueWorkerHealthCheckJobInput extends WorkerHealthCheckBullMqPayload {
  driver: "bullmq" | "sqs";
  redisUrl: string;
}

export async function enqueueReferenceExtractJob(
  input: EnqueueReferenceExtractJobInput,
): Promise<void> {
  if (input.driver === "sqs") {
    throw new Error("SqsJobQueue adapter is not implemented yet.");
  }

  const queue = new Queue(referenceExtractQueueName, {
    connection: redisConnectionOptions(input.redisUrl),
  });

  try {
    await queue.add(referenceExtractJobName, {
      jobId: input.jobId,
      projectId: input.projectId,
      files: input.files,
    } satisfies ReferenceExtractBullMqPayload);
  } finally {
    await queue.close();
  }
}

export async function enqueueRehearsalSttJob(
  input: EnqueueRehearsalSttJobInput,
): Promise<void> {
  if (input.driver === "sqs") {
    throw new Error("SqsJobQueue adapter is not implemented yet.");
  }

  const queue = new Queue(rehearsalSttQueueName, {
    connection: redisConnectionOptions(input.redisUrl),
  });

  try {
    await queue.add(rehearsalSttJobName, {
      jobId: input.jobId,
      projectId: input.projectId,
      runId: input.runId,
      deckId: input.deckId,
      audioFileId: input.audioFileId,
    } satisfies RehearsalSttBullMqPayload);
  } finally {
    await queue.close();
  }
}

export async function enqueueGenerateDeckJob(
  input: EnqueueGenerateDeckJobInput,
): Promise<void> {
  if (input.driver === "sqs") {
    throw new Error("SqsJobQueue adapter is not implemented yet.");
  }

  const queue = new Queue(generateDeckQueueName, {
    connection: redisConnectionOptions(input.redisUrl),
  });

  try {
    await queue.add(generateDeckJobName, {
      jobId: input.jobId,
      projectId: input.projectId,
      request: generateDeckRequestSchema.parse(input.request),
      ...(input.designPackSnapshot
        ? { designPackSnapshot: input.designPackSnapshot }
        : {}),
      ...(input.brandKitSnapshot ? { brandKitSnapshot: input.brandKitSnapshot } : {}),
      ...(input.imageAssetScope ? { imageAssetScope: input.imageAssetScope } : {}),
    } satisfies GenerateDeckBullMqPayload);
  } finally {
    await queue.close();
  }
}

export async function enqueueDeckExportJob(
  input: EnqueueDeckExportJobInput,
): Promise<void> {
  if (input.driver === "sqs") {
    throw new Error("SqsJobQueue adapter is not implemented yet.");
  }

  const queue = new Queue(deckExportQueueName, {
    connection: redisConnectionOptions(input.redisUrl),
  });

  try {
    await queue.add(deckExportJobName, {
      jobId: input.jobId,
      projectId: input.projectId,
      deck: deckSchema.parse(input.deck),
      format: deckExportFormatSchema.parse(input.format),
    } satisfies DeckExportBullMqPayload);
  } finally {
    await queue.close();
  }
}

export async function enqueueAiTemplateDeckGenerationJob(
  input: EnqueueAiTemplateDeckGenerationJobInput,
): Promise<void> {
  if (input.driver === "sqs") {
    throw new Error("SqsJobQueue adapter is not implemented yet.");
  }

  const queue = new Queue(aiTemplateDeckGenerationQueueName, {
    connection: redisConnectionOptions(input.redisUrl),
  });

  try {
    await queue.add(aiTemplateDeckGenerationJobName, {
      jobId: input.jobId,
      projectId: input.projectId,
      request: aiTemplateDeckGenerationRequestSchema.parse(input.request),
    } satisfies AiTemplateDeckGenerationBullMqPayload);
  } finally {
    await queue.close();
  }
}

export async function enqueuePptxImportJob(
  input: EnqueuePptxImportJobInput,
): Promise<void> {
  if (input.driver === "sqs") {
    throw new Error("SqsJobQueue adapter is not implemented yet.");
  }

  const queue = new Queue(pptxImportQueueName, {
    connection: redisConnectionOptions(input.redisUrl),
  });

  try {
    await queue.add(pptxImportJobName, {
      jobId: input.jobId,
      projectId: input.projectId,
      fileId: input.fileId,
    } satisfies PptxImportBullMqPayload);
  } finally {
    await queue.close();
  }
}

export async function enqueuePptxOoxmlGenerationJob(
  input: EnqueuePptxOoxmlGenerationJobInput,
): Promise<void> {
  if (input.driver === "sqs") {
    throw new Error("SqsJobQueue adapter is not implemented yet.");
  }

  const queue = new Queue(pptxOoxmlGenerationQueueName, {
    connection: redisConnectionOptions(input.redisUrl),
  });

  try {
    await queue.add(pptxOoxmlGenerationJobName, {
      jobId: input.jobId,
      projectId: input.projectId,
      request: input.request,
    } satisfies PptxOoxmlGenerationBullMqPayload);
  } finally {
    await queue.close();
  }
}

export async function enqueuePptxOoxmlSyncJob(
  input: EnqueuePptxOoxmlSyncJobInput,
): Promise<void> {
  if (input.driver === "sqs") {
    throw new Error("SqsJobQueue adapter is not implemented yet.");
  }

  const queue = new Queue(pptxOoxmlSyncQueueName, {
    connection: redisConnectionOptions(input.redisUrl),
  });

  try {
    await queue.add(pptxOoxmlSyncJobName, {
      jobId: input.jobId,
      projectId: input.projectId,
      deckId: input.deckId,
      changeId: input.changeId,
      targetDeckVersion: input.targetDeckVersion,
    } satisfies PptxOoxmlSyncBullMqPayload);
  } finally {
    await queue.close();
  }
}

export async function enqueueWorkerHealthCheckJob(
  input: EnqueueWorkerHealthCheckJobInput,
): Promise<void> {
  if (input.driver === "sqs") {
    throw new Error("SqsJobQueue adapter is not implemented yet.");
  }

  const queue = new Queue(workerHealthCheckQueueName, {
    connection: redisConnectionOptions(input.redisUrl),
  });

  try {
    await queue.add(workerHealthCheckJobName, {
      jobId: input.jobId,
      projectId: input.projectId,
    } satisfies WorkerHealthCheckBullMqPayload);
  } finally {
    await queue.close();
  }
}

export function redisConnectionOptions(redisUrl: string) {
  const url = new URL(redisUrl);
  if (!["redis:", "rediss:"].includes(url.protocol)) {
    throw new Error("REDIS_URL must use redis:// or rediss://.");
  }

  const db =
    url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined;
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
    username: url.username ? decodeURIComponent(url.username) : undefined,
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
      updatedAt: now,
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
      updatedAt: nowIso(),
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
