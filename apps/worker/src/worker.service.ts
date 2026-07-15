import {
  deckExportQueueName,
  generateDeckJobName,
  generateDeckQueueName,
  generateDeckStagedCoordinatorJobName,
  pptxOoxmlGenerationQueueName,
  pptxOoxmlSyncQueueName,
  redisConnectionOptions,
  referenceExtractJobName,
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
import { randomUUID } from "node:crypto";
import type { DataSource } from "typeorm";
import { processDeckExportJob } from "./deck-export.processor";
import { processGenerateDeckJob } from "./generate-deck.processor";
import { processAiDeckReferenceExtractionStage } from "./generate-deck/reference-extract-stage";
import { dispatchAiDeckGenerationStages } from "./generate-deck/stage-dispatcher";
import { AiDeckGenerationStageCheckpointRepository } from "./generate-deck/stage-checkpoint-repository";
import { reconcileExpiredAiDeckStageLeases } from "./generate-deck/stage-reconciler";
import { processAiDeckStagedCoordinatorJob } from "./generate-deck/staged-coordinator";
import { recoverAiDeckBullMqFinalFailure } from "./generate-deck/transport-failure-recovery";
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
  private readonly allQueueNames = [
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
  private readonly workerId = `worker-${randomUUID()}`;
  private queueNames: string[] = [];
  private workers: BullMqWorker[] = [];
  private transcriptCache: RedisRehearsalTranscriptCache | null = null;
  private challengeQnaEvidenceCache: ChallengeQnaEvidenceCache | null = null;
  private storageDeletionTimer: ReturnType<typeof setInterval> | null = null;
  private aiDeckMaintenanceTimer: ReturnType<typeof setInterval> | null = null;
  private aiDeckMaintenanceInFlight: Promise<void> | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectPinoLogger(WorkerService.name)
    private readonly logger: PinoLogger,
  ) {}

  onModuleInit() {
    if (this.config.JOB_QUEUE_DRIVER === "sqs") {
      throw new Error("SqsJobQueue adapter is not implemented yet.");
    }
    if (this.config.AI_DECK_EXECUTION_MODE === "sqs") {
      throw new Error("AI Deck SQS transport is not implemented yet.");
    }
    if (
      this.config.AI_DECK_WORKER_QUEUE !== "all" &&
      this.config.AI_DECK_WORKER_QUEUE !== "reference-extract"
    ) {
      throw new Error(
        `AI Deck worker role ${this.config.AI_DECK_WORKER_QUEUE} is not implemented in 338-1.`,
      );
    }
    if (
      this.config.AI_DECK_WORKER_QUEUE === "reference-extract" &&
      this.config.AI_DECK_EXECUTION_MODE !== "bullmq"
    ) {
      throw new Error(
        "AI Deck reference-extract worker role is not implemented outside bullmq execution mode.",
      );
    }

    this.queueNames =
      this.config.AI_DECK_WORKER_QUEUE === "reference-extract"
        ? [generateDeckQueueName, referenceExtractQueueName]
        : this.allQueueNames;
    const storage = workerStorage();
    const reconcileDeletions = () => {
      void reconcileStorageDeletionOutbox(this.dataSource, storage).catch(
        (error) => {
          this.logger.error(
            {
              event: "storage_deletion.reconcile_failed",
              error: serializeLogError(error),
            },
            "Storage deletion reconciliation failed.",
          );
        },
      );
    };
    if (this.config.AI_DECK_WORKER_QUEUE === "all") {
      reconcileDeletions();
      this.storageDeletionTimer = setInterval(reconcileDeletions, 30_000);
      this.transcriptCache = new RedisRehearsalTranscriptCache(
        this.config.PRIVATE_EVIDENCE_REDIS_URL,
      );
      this.challengeQnaEvidenceCache = new ChallengeQnaEvidenceCache(
        this.config.PRIVATE_EVIDENCE_REDIS_URL,
      );
    }

    const registrations: Array<{
      queueName: string;
      handler: (job: BullMqJob) => Promise<OrbitJob | void>;
    }> = [
      {
        queueName: referenceExtractQueueName,
        handler: (job) => {
          if (job.name === referenceExtractJobName) {
            return processReferenceExtractJob(
              this.dataSource,
              this.config.PYTHON_WORKER_URL,
              job.data,
            );
          }
          if (job.name === "reference-extract-file") {
            return processAiDeckReferenceExtractionStage(
              this.dataSource,
              storage,
              this.config.PYTHON_WORKER_URL,
              this.workerId,
              job.data,
            );
          }
          throw new Error(`Unsupported BullMQ job name: ${job.name}`);
        },
      },
      {
        queueName: rehearsalSttQueueName,
        handler: (job) =>
          processRehearsalSttJob(
            this.dataSource,
            storage,
            this.config.PYTHON_WORKER_URL,
            job.data,
            this.transcriptCache ?? undefined,
            (event) => {
              const level = event.event.endsWith(".partial") ? "warn" : "info";
              this.logger[level](
                event,
                "Rehearsal semantic evaluation updated.",
              );
            },
          ),
      },
      {
        queueName: rehearsalSemanticEvaluationQueueName,
        handler: (job) =>
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
                "Rehearsal semantic evaluation retry updated.",
              );
            },
          ),
      },
      {
        queueName: generateDeckQueueName,
        handler: (job) => {
          if (job.name === generateDeckJobName) {
            return processGenerateDeckJob(
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
            );
          }
          if (job.name === generateDeckStagedCoordinatorJobName) {
            return processAiDeckStagedCoordinatorJob(this.dataSource, job.data);
          }
          throw new Error(`Unsupported BullMQ job name: ${job.name}`);
        },
      },
      {
        queueName: deckExportQueueName,
        handler: (job) =>
          processDeckExportJob(
            this.dataSource,
            storage,
            this.config.PYTHON_WORKER_URL,
            job.data,
          ),
      },
      {
        queueName: semanticCueExtractionQueueName,
        handler: (job) =>
          processSemanticCueExtractionJob(
            this.dataSource,
            this.config.PYTHON_WORKER_URL,
            job.data,
          ),
      },
      {
        queueName: speakerNotesSuggestionQueueName,
        handler: (job) =>
          processSpeakerNotesSuggestionJob(
            this.dataSource,
            this.config.PYTHON_WORKER_URL,
            job.data,
          ),
      },
      {
        queueName: pptxOoxmlGenerationQueueName,
        handler: (job) =>
          processPptxOoxmlGenerationJob(
            this.dataSource,
            storage,
            this.config.PYTHON_WORKER_URL,
            job.data,
          ),
      },
      {
        queueName: pptxOoxmlSyncQueueName,
        handler: (job) =>
          processPptxOoxmlSyncJob(
            this.dataSource,
            storage,
            this.config.PYTHON_WORKER_URL,
            job.data,
          ),
      },
      {
        queueName: workerHealthCheckQueueName,
        handler: (job) =>
          processWorkerHealthCheckJob(
            this.dataSource,
            this.config.PYTHON_WORKER_URL,
            job.data,
          ),
      },
      {
        queueName: focusedPracticeAnalysisQueueName,
        handler: (job) =>
          processFocusedPracticeAnalysisJob(
            this.dataSource,
            storage,
            this.config.PYTHON_WORKER_URL,
            job.data,
          ),
      },
      {
        queueName: challengeQnaGenerationQueueName,
        handler: (job) =>
          processChallengeQnaGenerationJob(
            this.dataSource,
            this.config.PYTHON_WORKER_URL,
            job.data,
          ),
      },
      {
        queueName: challengeQnaAnswerAnalysisQueueName,
        handler: (job) =>
          processChallengeQnaAnswerJob(
            this.dataSource,
            storage,
            this.challengeQnaEvidenceCache!,
            this.config.PYTHON_WORKER_URL,
            job.data,
          ),
      },
    ];
    const selectedQueues = new Set(this.queueNames);
    this.workers = registrations
      .filter(({ queueName }) => selectedQueues.has(queueName))
      .map(({ queueName, handler }) => this.createWorker(queueName, handler));

    if (this.config.AI_DECK_EXECUTION_MODE === "bullmq") {
      const maintainAiDeckStages = () => {
        this.scheduleAiDeckStageMaintenance();
      };
      maintainAiDeckStages();
      this.aiDeckMaintenanceTimer = setInterval(maintainAiDeckStages, 5_000);
    }

    this.logger.info(
      {
        event: "worker.ready",
        driver: this.config.JOB_QUEUE_DRIVER,
        aiDeckExecutionMode: this.config.AI_DECK_EXECUTION_MODE,
        aiDeckWorkerQueue: this.config.AI_DECK_WORKER_QUEUE,
        queueNames: this.queueNames,
      },
      "Worker ready.",
    );
  }

  async onModuleDestroy() {
    if (this.storageDeletionTimer) clearInterval(this.storageDeletionTimer);
    if (this.aiDeckMaintenanceTimer) clearInterval(this.aiDeckMaintenanceTimer);
    await Promise.all(this.workers.map((worker) => worker.close()));
    await this.aiDeckMaintenanceInFlight;
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
    handler: (job: BullMqJob) => Promise<OrbitJob | void>,
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
    handler: () => Promise<OrbitJob | void>,
  ): Promise<OrbitJob | void> {
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
      if (
        !result ||
        result.status === "queued" ||
        result.status === "running"
      ) {
        this.logger.info(
          {
            event: "job.progressed",
            ...baseFields,
            jobId: result?.jobId,
            jobType: result?.type,
            projectId: result?.projectId,
            status: result?.status,
            durationMs,
          },
          "Job progressed.",
        );
        return result;
      }
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
          result.status === "succeeded"
            ? "info"
            : versionConflict
              ? "warn"
              : "error";
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
      await this.recoverAiDeckTransportFailure(queueName, job);
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

  private async recoverAiDeckTransportFailure(
    queueName: string,
    job: BullMqJob,
  ): Promise<void> {
    if (!isFinalBullMqAttempt(job)) return;
    try {
      const result = await recoverAiDeckBullMqFinalFailure(this.dataSource, {
        queueName,
        jobName: job.name,
        data: job.data,
      });
      if (result === "ignored") return;
      this.logger.warn(
        {
          event: "ai_deck.transport_failure.recovered",
          queueName,
          bullJobId: job.id,
          attemptsMade: job.attemptsMade,
          recovery: result,
          ...jobPayloadFields(job.data),
        },
        "AI deck transport failure recovered.",
      );
    } catch (error) {
      this.logger.error(
        {
          event: "ai_deck.transport_failure.recovery_failed",
          queueName,
          bullJobId: job.id,
          attemptsMade: job.attemptsMade,
          ...jobPayloadFields(job.data),
          error: serializeLogError(error),
        },
        "AI deck transport failure recovery failed.",
      );
    }
  }

  private scheduleAiDeckStageMaintenance(): void {
    if (this.aiDeckMaintenanceInFlight) return;
    const task = this.runAiDeckStageMaintenance();
    this.aiDeckMaintenanceInFlight = task;
    void task.finally(() => {
      if (this.aiDeckMaintenanceInFlight === task) {
        this.aiDeckMaintenanceInFlight = null;
      }
    });
  }

  private async runAiDeckStageMaintenance(): Promise<void> {
    const repository = new AiDeckGenerationStageCheckpointRepository(
      this.dataSource,
    );
    try {
      await dispatchAiDeckGenerationStages(repository, {
        driver: "bullmq",
        redisUrl: this.config.REDIS_URL,
        onError: (error, message) =>
          this.logger.error(
            {
              event: "ai_deck.stage.dispatch_failed",
              pipelineJobId: message.pipelineJobId,
              projectId: message.projectId,
              stage: message.stage,
              shardKey: message.shardKey,
              error: serializeLogError(error),
            },
            "AI deck stage dispatch failed.",
          ),
      });
    } catch (error) {
      this.logger.error(
        {
          event: "ai_deck.stage.dispatch_scan_failed",
          error: serializeLogError(error),
        },
        "AI deck stage dispatch scan failed.",
      );
    }
    try {
      await reconcileExpiredAiDeckStageLeases(this.dataSource, {
        onError: (error, message) =>
          this.logger.error(
            {
              event: "ai_deck.stage.reconcile_failed",
              pipelineJobId: message.pipelineJobId,
              projectId: message.projectId,
              stage: message.stage,
              shardKey: message.shardKey,
              error: serializeLogError(error),
            },
            "AI deck stage reconciliation failed.",
          ),
      });
    } catch (error) {
      this.logger.error(
        {
          event: "ai_deck.stage.reconcile_scan_failed",
          error: serializeLogError(error),
        },
        "AI deck stage reconciliation scan failed.",
      );
    }
  }
}

function isFinalBullMqAttempt(job: BullMqJob): boolean {
  const configuredAttempts =
    typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
  return job.attemptsMade + 1 >= Math.max(1, configuredAttempts);
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
    pipelineJobId: readString(payload, "pipelineJobId"),
    stage: readString(payload, "stage"),
    shardKey: readString(payload, "shardKey"),
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
  return typeof candidate === "number" && candidate >= 0
    ? candidate
    : undefined;
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
