import {
  aiTemplateDeckGenerationQueueName,
  generateDeckQueueName,
  pptxImportQueueName,
  pptxOoxmlGenerationQueueName,
  pptxOoxmlSyncQueueName,
  redisConnectionOptions,
  referenceExtractQueueName,
  rehearsalSemanticEvaluationQueueName,
  rehearsalSttQueueName,
  semanticCueExtractionQueueName,
  workerHealthCheckQueueName,
} from "@orbit/job-queue";
import { loadOrbitConfig } from "@orbit/config";
import type { Job as OrbitJob } from "@orbit/shared";
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { type Job as BullMqJob, Worker as BullMqWorker } from "bullmq";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import type { DataSource } from "typeorm";
import { processAiTemplateDeckGenerationJob } from "./ai-template-deck-generation.processor";
import { processGenerateDeckJob } from "./generate-deck.processor";
import { serializeLogError } from "./logging";
import { processPptxOoxmlGenerationJob } from "./pptx-ooxml-generation.processor";
import { processPptxOoxmlSyncJob } from "./pptx-ooxml-sync.processor";
import { processPptxImportJob } from "./pptx-import.processor";
import { processReferenceExtractJob } from "./reference-extract.processor";
import { RedisRehearsalTranscriptCache } from "./rehearsal-transcript-cache";
import { processRehearsalSemanticEvaluationJob } from "./rehearsal-semantic-evaluation.processor";
import { processRehearsalSttJob } from "./rehearsal-stt.processor";
import { processSemanticCueExtractionJob } from "./semantic-cue-extraction.processor";
import { workerStorage } from "./storage";
import { processWorkerHealthCheckJob } from "./worker-health-check.processor";

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly config = loadOrbitConfig(process.env, { service: "worker" });
  private readonly queueNames = [
    referenceExtractQueueName,
    rehearsalSttQueueName,
    rehearsalSemanticEvaluationQueueName,
    generateDeckQueueName,
    aiTemplateDeckGenerationQueueName,
    semanticCueExtractionQueueName,
    pptxOoxmlGenerationQueueName,
    pptxOoxmlSyncQueueName,
    pptxImportQueueName,
    workerHealthCheckQueueName,
  ];
  private workers: BullMqWorker[] = [];
  private transcriptCache: RedisRehearsalTranscriptCache | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectPinoLogger(WorkerService.name)
    private readonly logger: PinoLogger,
  ) {}

  onModuleInit() {
    this.logger.info(
      {
        event: "worker.ready",
        driver: this.config.JOB_QUEUE_DRIVER,
        queueNames: this.queueNames,
      },
      "Worker ready.",
    );
    if (this.config.JOB_QUEUE_DRIVER === "sqs") {
      throw new Error("SqsJobQueue adapter is not implemented yet.");
    }

    const storage = workerStorage();
    this.transcriptCache = new RedisRehearsalTranscriptCache(this.config.REDIS_URL);
    this.workers = [
      this.createWorker(referenceExtractQueueName, (job) =>
        processReferenceExtractJob(
          this.dataSource,
          this.config.PYTHON_WORKER_URL,
          job.data,
        ),
      ),
      this.createWorker(rehearsalSttQueueName, (job) =>
        processRehearsalSttJob(
          this.dataSource,
          storage,
          this.config.PYTHON_WORKER_URL,
          job.data,
          this.transcriptCache ?? undefined,
          (event) => {
            const level = event.event.endsWith(".partial") ? "warn" : "info";
            this.logger[level](event, "Rehearsal semantic evaluation updated.");
          },
        ),
      ),
      this.createWorker(rehearsalSemanticEvaluationQueueName, (job) =>
        processRehearsalSemanticEvaluationJob(
          this.dataSource,
          this.config.PYTHON_WORKER_URL,
          job.data,
          this.transcriptCache!,
          (event) => {
            const level = event.event.endsWith(".retry_failed")
              ? "error"
              : "info";
            this.logger[level](
              event,
              "Rehearsal semantic evaluation retry updated."
            );
          }
        )
      ),
      this.createWorker(generateDeckQueueName, (job) =>
        processGenerateDeckJob(
          this.dataSource,
          storage,
          this.config.PYTHON_WORKER_URL,
          job.data,
        ),
      ),
      this.createWorker(aiTemplateDeckGenerationQueueName, (job) =>
        processAiTemplateDeckGenerationJob(
          this.dataSource,
          storage,
          this.config.PYTHON_WORKER_URL,
          job.data,
        ),
      ),
      this.createWorker(semanticCueExtractionQueueName, (job) =>
        processSemanticCueExtractionJob(
          this.dataSource,
          this.config.PYTHON_WORKER_URL,
          job.data,
        ),
      ),
      this.createWorker(pptxOoxmlGenerationQueueName, (job) =>
        processPptxOoxmlGenerationJob(
          this.dataSource,
          storage,
          this.config.PYTHON_WORKER_URL,
          job.data,
        ),
      ),
      this.createWorker(pptxOoxmlSyncQueueName, (job) =>
        processPptxOoxmlSyncJob(
          this.dataSource,
          storage,
          this.config.PYTHON_WORKER_URL,
          job.data,
        ),
      ),
      this.createWorker(pptxImportQueueName, (job) =>
        processPptxImportJob(
          this.dataSource,
          storage,
          this.config.PYTHON_WORKER_URL,
          job.data,
        ),
      ),
      this.createWorker(workerHealthCheckQueueName, (job) =>
        processWorkerHealthCheckJob(
          this.dataSource,
          this.config.PYTHON_WORKER_URL,
          job.data,
        ),
      ),
    ];
  }

  async onModuleDestroy() {
    await Promise.all(this.workers.map((worker) => worker.close()));
    await this.transcriptCache?.close();
    this.logger.info(
      {
        event: "worker.stopped",
        queueNames: this.queueNames,
      },
      "Worker stopped.",
    );
  }

  private createWorker(
    queueName: string,
    handler: (job: BullMqJob) => Promise<OrbitJob>,
  ): BullMqWorker {
    const worker = new BullMqWorker(
      queueName,
      (job) => this.processJob(queueName, job, () => handler(job)),
      {
        connection: redisConnectionOptions(this.config.REDIS_URL),
      },
    );

    worker.on("failed", (job, error) => {
      this.logger.error(
        {
          event: "bullmq.job.failed",
          queueName,
          bullJobId: job?.id,
          attemptsMade: job?.attemptsMade,
          ...jobPayloadFields(job?.data),
          error: serializeLogError(error),
        },
        "BullMQ job failed.",
      );
    });

    return worker;
  }

  private async processJob(
    queueName: string,
    job: BullMqJob,
    handler: () => Promise<OrbitJob>,
  ): Promise<OrbitJob> {
    const startedAt = Date.now();
    const baseFields = {
      queueName,
      bullJobId: job.id,
      attemptsMade: job.attemptsMade,
      ...jobPayloadFields(job.data),
    };

    this.logger.info(
      {
        event: "job.started",
        ...baseFields,
      },
      "Job started.",
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
          error: result.error ?? undefined,
        },
        "Job finished.",
      );
      if (queueName === semanticCueExtractionQueueName) {
        const versionConflict =
          result.error?.code === "SEMANTIC_CUE_DECK_VERSION_CONFLICT";
        const semanticEvent =
          result.status === "succeeded"
            ? "semantic_cue.extraction.succeeded"
            : versionConflict
              ? "semantic_cue.extraction.version_conflict"
              : "semantic_cue.extraction.failed";
        const semanticLevel =
          result.status === "succeeded" ? "info" : versionConflict ? "warn" : "error";
        this.logger[semanticLevel](
          {
            event: semanticEvent,
            ...baseFields,
            jobId: result.jobId,
            jobType: result.type,
            projectId: result.projectId,
            status: result.status,
            durationMs,
            reason: result.error?.code,
          },
          "Semantic cue extraction finished.",
        );
      }
      return result;
    } catch (error) {
      this.logger.error(
        {
          event: "job.failed",
          ...baseFields,
          durationMs: Date.now() - startedAt,
          error: serializeLogError(error),
        },
        "Job failed.",
      );
      throw error;
    }
  }
}

function jobPayloadFields(data: unknown) {
  const payload = isRecord(data) ? data : {};
  const request = isRecord(payload.request) ? payload.request : {};
  return {
    jobId: readString(payload, "jobId"),
    jobType: readString(payload, "type"),
    projectId: readString(payload, "projectId"),
    runId: readString(payload, "runId"),
    deckId: readString(payload, "deckId") ?? readString(request, "deckId"),
    deckVersion: readNumber(request, "baseVersion"),
    force: readBoolean(request, "force"),
    audioFileId: readString(payload, "audioFileId"),
    fileId: readString(payload, "fileId"),
    fileCount: Array.isArray(payload.files) ? payload.files.length : undefined,
  };
}

function readString(value: Record<string, unknown>, key: string) {
  const raw = value[key];
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

function readNumber(value: Record<string, unknown>, key: string) {
  const raw = value[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

function readBoolean(value: Record<string, unknown>, key: string) {
  const raw = value[key];
  return typeof raw === "boolean" ? raw : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
