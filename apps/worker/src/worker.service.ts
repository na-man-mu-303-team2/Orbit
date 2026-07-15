import {
  deckExportQueueName,
  generateDeckQueueName,
  pptxOoxmlGenerationQueueName,
  pptxOoxmlSyncQueueName,
  redisConnectionOptions,
  referenceExtractQueueName,
  rehearsalSemanticEvaluationQueueName,
  rehearsalSttQueueName,
  semanticCueExtractionQueueName,
  speakerNotesSuggestionQueueName,
  workerHealthCheckQueueName,
  focusedPracticeAnalysisQueueName,
  challengeQnaGenerationQueueName,
  challengeQnaAnswerAnalysisQueueName,
} from "@orbit/job-queue";
import { loadOrbitConfig } from "@orbit/config";
import type { Job as OrbitJob } from "@orbit/shared";
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { type Job as BullMqJob, Worker as BullMqWorker } from "bullmq";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import type { DataSource } from "typeorm";
import { processDeckExportJob } from "./deck-export.processor";
import { processGenerateDeckJob } from "./generate-deck.processor";
import { createImageAssetRuntime } from "./image-providers";
import { serializeLogError } from "./logging";
import { processPptxOoxmlGenerationJob } from "./pptx-ooxml-generation.processor";
import { processPptxOoxmlSyncJob } from "./pptx-ooxml-sync.processor";
import { processReferenceExtractJob } from "./reference-extract.processor";
import { RedisRehearsalTranscriptCache } from "./rehearsal-transcript-cache";
import { processRehearsalSemanticEvaluationJob } from "./rehearsal-semantic-evaluation.processor";
import { processRehearsalSttJob } from "./rehearsal-stt.processor";
import { processSemanticCueExtractionJob } from "./semantic-cue-extraction.processor";
import { processSpeakerNotesSuggestionJob } from "./speaker-notes-suggestion.processor";
import { workerStorage } from "./storage";
import { processWorkerHealthCheckJob } from "./worker-health-check.processor";
import { processFocusedPracticeAnalysisJob } from "./focused-practice-analysis.processor";
import { reconcileStorageDeletionOutbox } from "./storage-deletion-reconciler";
import { processChallengeQnaGenerationJob } from "./challenge-qna-generation.processor";
import { processChallengeQnaAnswerJob } from "./challenge-qna-answer.processor";
import { ChallengeQnaEvidenceCache } from "./challenge-qna-evidence-cache";

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly config = loadOrbitConfig(process.env, { service: "worker" });
  private readonly queueNames = [
    referenceExtractQueueName,
    rehearsalSttQueueName,
    rehearsalSemanticEvaluationQueueName,
    generateDeckQueueName,
    deckExportQueueName,
    semanticCueExtractionQueueName,
    speakerNotesSuggestionQueueName,
    pptxOoxmlGenerationQueueName,
    pptxOoxmlSyncQueueName,
    workerHealthCheckQueueName,
    focusedPracticeAnalysisQueueName,
    challengeQnaGenerationQueueName,
    challengeQnaAnswerAnalysisQueueName,
  ];
  private workers: BullMqWorker[] = [];
  private transcriptCache: RedisRehearsalTranscriptCache | null = null;
  private challengeQnaEvidenceCache: ChallengeQnaEvidenceCache | null = null;
  private storageDeletionTimer: ReturnType<typeof setInterval> | null = null;

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
    const reconcileDeletions = () => {
      void reconcileStorageDeletionOutbox(this.dataSource, storage).catch((error) => {
        this.logger.error(
          { event: "storage_deletion.reconcile_failed", error: serializeLogError(error) },
          "Storage deletion reconciliation failed."
        );
      });
    };
    reconcileDeletions();
    this.storageDeletionTimer = setInterval(reconcileDeletions, 30_000);
    this.transcriptCache = new RedisRehearsalTranscriptCache(
      this.config.PRIVATE_EVIDENCE_REDIS_URL
    );
    this.challengeQnaEvidenceCache = new ChallengeQnaEvidenceCache(
      this.config.PRIVATE_EVIDENCE_REDIS_URL
    );
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
          createImageAssetRuntime(this.config),
          (event, fields) =>
            this.logger.info(
              { event, ...fields },
              "AI PPT generation event.",
            ),
        ),
      ),
      this.createWorker(deckExportQueueName, (job) =>
        processDeckExportJob(
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
      this.createWorker(speakerNotesSuggestionQueueName, (job) =>
        processSpeakerNotesSuggestionJob(
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
      this.createWorker(workerHealthCheckQueueName, (job) =>
        processWorkerHealthCheckJob(
          this.dataSource,
          this.config.PYTHON_WORKER_URL,
          job.data,
        ),
      ),
      this.createWorker(focusedPracticeAnalysisQueueName, (job) =>
        processFocusedPracticeAnalysisJob(
          this.dataSource,
          storage,
          this.config.PYTHON_WORKER_URL,
          job.data,
        ),
      ),
      this.createWorker(challengeQnaGenerationQueueName, (job) =>
        processChallengeQnaGenerationJob(
          this.dataSource,
          this.config.PYTHON_WORKER_URL,
          job.data,
        ),
      ),
      this.createWorker(challengeQnaAnswerAnalysisQueueName, (job) =>
        processChallengeQnaAnswerJob(
          this.dataSource,
          storage,
          this.challengeQnaEvidenceCache!,
          this.config.PYTHON_WORKER_URL,
          job.data,
        ),
      ),
    ];
  }

  async onModuleDestroy() {
    if (this.storageDeletionTimer) clearInterval(this.storageDeletionTimer);
    await Promise.all(this.workers.map((worker) => worker.close()));
    await this.transcriptCache?.close();
    await this.challengeQnaEvidenceCache?.close();
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
          ...jobDiagnosticFields(result.result),
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

function jobDiagnosticFields(result: unknown) {
  if (!isRecord(result) || !isRecord(result.diagnostics)) return {};
  const diagnostics = result.diagnostics;
  return {
    referencePolicy: readString(diagnostics, "referencePolicy"),
    uploadedSourceCount: readNonNegativeNumber(
      diagnostics,
      "uploadedSourceCount",
    ),
    webSourceCount: readNonNegativeNumber(diagnostics, "webSourceCount"),
    repairAttempted:
      typeof diagnostics.repairAttempted === "boolean"
        ? diagnostics.repairAttempted
        : undefined,
    validationIssueCount: readNonNegativeNumber(
      diagnostics,
      "validationIssueCount",
    ),
    visualQaStatus: readString(diagnostics, "visualQaStatus"),
    visualReviewAttempts: readNonNegativeNumber(
      diagnostics,
      "visualReviewAttempts",
    ),
    visualRepairAttempts: readNonNegativeNumber(
      diagnostics,
      "visualRepairAttempts",
    ),
    visualIssueCodes: readStringArray(diagnostics, "visualIssueCodes"),
  };
}

function readNonNegativeNumber(value: Record<string, unknown>, key: string) {
  const candidate = value[key];
  return typeof candidate === "number" && candidate >= 0 ? candidate : undefined;
}

function readString(value: Record<string, unknown>, key: string) {
  const raw = value[key];
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

function readStringArray(value: Record<string, unknown>, key: string) {
  const raw = value[key];
  if (!Array.isArray(raw) || !raw.every((item) => typeof item === "string")) {
    return undefined;
  }
  return raw;
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
