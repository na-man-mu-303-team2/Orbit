import type {
  EnqueueRehearsalSemanticEvaluationJobInput,
  EnqueueRehearsalSttJobInput
} from "@orbit/job-queue";
import { loadOrbitConfig } from "@orbit/config";
import {
  completeRehearsalAudioUploadRequestSchema,
  completeRehearsalAudioUploadResponseSchema,
  cancelRehearsalRunResponseSchema,
  createRehearsalEvaluationSnapshot,
  createAssetUploadUrlRequestSchema,
  createRehearsalAudioUploadUrlRequestSchema,
  createRehearsalAudioUploadUrlResponseSchema,
  createRehearsalRunRequestSchema,
  createRehearsalRunResponseSchema,
  getRehearsalRunComparisonResponseSchema,
  getRehearsalProjectSummaryResponseSchema,
  getRehearsalReportResponseSchema,
  getRehearsalRunResponseSchema,
  rehearsalFocusProfileSchema,
  rehearsalReportSchema,
  retryRehearsalSemanticEvaluationResponseSchema,
  updateRehearsalRunMetaRequestSchema,
  updateRehearsalRunMetaResponseSchema,
  type RehearsalEvaluationSnapshot,
  type RehearsalFocusProfile,
  type RehearsalRun
} from "@orbit/shared";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { LessThan, Not, Repository } from "typeorm";
import { ZodError } from "zod";
import { parseRequest } from "../common/zod-request";
import { DecksService } from "../decks/decks.service";
import {
  FilesService,
  rehearsalSlideSnapshotContentPath,
} from "../files/files.service";
import { JobsService } from "../jobs/jobs.service";
import { serializeLogError } from "../logging";
import { ProjectEntity } from "../projects/project.entity";
import { ProjectsService } from "../projects/projects.service";
import { PresentationBriefsService } from "../presentation-briefs/presentation-briefs.service";
import {
  assertFrozenRehearsalEvaluationSources,
  buildRehearsalEvaluationPlan,
  createRehearsalFocusProfileSnapshot,
  deckContentHash,
} from "../practice-goals/evaluation-plan";
import { RehearsalRunEntity } from "./rehearsal-run.entity";
import { RedisRehearsalTranscriptCache } from "./rehearsal-transcript-cache";
import { buildRehearsalRunComparison } from "./rehearsal-run-comparison";

export type RehearsalSttEnqueueJob = (input: EnqueueRehearsalSttJobInput) => Promise<void>;
export type RehearsalSemanticEvaluationEnqueueJob = (
  input: EnqueueRehearsalSemanticEvaluationJobInput
) => Promise<void>;

export const REHEARSAL_STT_ENQUEUE_JOB = "REHEARSAL_STT_ENQUEUE_JOB";
export const REHEARSAL_SEMANTIC_EVALUATION_ENQUEUE_JOB =
  "REHEARSAL_SEMANTIC_EVALUATION_ENQUEUE_JOB";

@Injectable()
export class RehearsalsService {
  private readonly config = loadOrbitConfig(process.env, { service: "api" });
  private readonly rehearsalAudioUploadRequestSchema = createAssetUploadUrlRequestSchema({
    maxRehearsalAudioUploadSizeBytes: this.config.REHEARSAL_AUDIO_MAX_BYTES,
    allowedPrivatePurpose: "rehearsal-audio"
  });

  constructor(
    @InjectRepository(RehearsalRunEntity)
    private readonly rehearsalRuns: Repository<RehearsalRunEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    private readonly decksService: DecksService,
    private readonly projectsService: ProjectsService,
    private readonly presentationBriefs: PresentationBriefsService,
    private readonly filesService: FilesService,
    private readonly jobsService: JobsService,
    @Inject(REHEARSAL_STT_ENQUEUE_JOB)
    private readonly enqueueJob: RehearsalSttEnqueueJob,
    @Inject(REHEARSAL_SEMANTIC_EVALUATION_ENQUEUE_JOB)
    private readonly enqueueSemanticEvaluationJob: RehearsalSemanticEvaluationEnqueueJob,
    private readonly transcriptCache: RedisRehearsalTranscriptCache,
    @InjectPinoLogger(RehearsalsService.name)
    private readonly logger: PinoLogger
  ) {}

  async createRun(projectId: string, actorUserId: string, body: unknown) {
    const request = parseRequest(createRehearsalRunRequestSchema, body);
    const deckResponse = await this.decksService.getDeck(projectId);
    if (deckResponse.deck.deckId !== request.deckId) {
      throw new BadRequestException("deckId does not match the project deck.");
    }

    if (
      request.semanticEvaluationMode === "full" &&
      request.expectedDeckVersion !== undefined &&
      request.expectedDeckVersion !== deckResponse.deck.version
    ) {
      throw new ConflictException({
        code: "REHEARSAL_DECK_VERSION_MISMATCH",
        message: "The expected deck version does not match the server deck version.",
        expectedDeckVersion: request.expectedDeckVersion,
        actualDeckVersion: deckResponse.deck.version
      });
    }

    const now = new Date();
    const adaptiveBrief = request.briefRef
      ? await this.resolveAdaptiveBrief(projectId, request.briefRef, request.evaluatorLensRef)
      : undefined;
    const focusProfile = request.briefRef
      ? await this.resolveFocusProfile(projectId)
      : null;
    const sourceGoalSetRef = request.briefRef
      ? await this.resolveSourceGoalSetRef(projectId, request.sourceGoalSetId ?? null)
      : null;
    const evaluationPlan = request.briefRef
      ? buildRehearsalEvaluationPlan({
          deck: deckResponse.deck,
          brief: adaptiveBrief ?? null,
          sourceGoalSetRef
        })
      : null;
    const slideThumbnailUrls = await this.resolveSlideSnapshotUrls(
      projectId,
      actorUserId,
      deckResponse.deck.slides.map((slide) => slide.slideId),
      request.slideSnapshots
    );
    let evaluationSnapshot: RehearsalEvaluationSnapshot | null = null;
    if (request.semanticEvaluationMode === "full") {
      try {
        evaluationSnapshot = createRehearsalEvaluationSnapshot(
          deckResponse.deck,
          now.toISOString(),
          {
            deckContentHash: evaluationPlan ? deckContentHash(deckResponse.deck) : null,
            evaluationPlan,
            focusProfileSnapshot: createRehearsalFocusProfileSnapshot(focusProfile),
            slideThumbnailUrls
          }
        );
        if (evaluationPlan) {
          assertFrozenRehearsalEvaluationSources({
            snapshot: evaluationSnapshot,
            brief: adaptiveBrief ?? null,
            focusProfile
          });
        }
      } catch (error) {
        if (!(error instanceof ZodError)) {
          throw error;
        }

        this.logger.error(
          {
            event: "rehearsal.evaluation_snapshot.validation_failed",
            projectId,
            deckId: request.deckId,
            issues: error.issues.map((issue) => ({
              code: issue.code,
              path: issue.path
            }))
          },
          "Rehearsal evaluation snapshot validation failed."
        );
        throw new UnprocessableEntityException({
          code: "REHEARSAL_DECK_INVALID",
          message: "The presentation could not be prepared for rehearsal."
        });
      }
    }
    const run = await this.rehearsalRuns.save(
      this.rehearsalRuns.create({
        runId: `run_${randomUUID()}`,
        projectId,
        createdByUserId: actorUserId,
        deckId: request.deckId,
        audioFileId: null,
        jobId: null,
        deckVersion: evaluationSnapshot?.deckVersion ?? null,
        evaluationSnapshot,
        semanticEvaluationMode: request.semanticEvaluationMode,
        analysisRevision: 0,
        analysisFinalizedAt: null,
        status: "created",
        error: null,
        rehearsalReport: null,
        metaJson: {},
        transcriptRetained: false,
        rawAudioDeletedAt: null,
        createdAt: now,
        updatedAt: now
      })
    );

    if (evaluationSnapshot) {
      this.logger.info(
        {
          event: "rehearsal.evaluation_snapshot.created",
          projectId,
          deckId: run.deckId,
          deckVersion: evaluationSnapshot.deckVersion,
          runId: run.runId,
          slideCount: evaluationSnapshot.slides.length,
          cueCount: evaluationSnapshot.slides.reduce(
            (count, slide) => count + slide.semanticCues.length,
            0
          )
        },
        "Rehearsal evaluation snapshot created."
      );
    }

    return createRehearsalRunResponseSchema.parse({ run: toRehearsalRun(run) });
  }

  private async resolveFocusProfile(
    projectId: string
  ): Promise<RehearsalFocusProfile | null> {
    const rows = await this.rehearsalRuns.query(
      `SELECT profile_id, project_id, revision, items_json,
              created_by, updated_by, created_at, updated_at
       FROM rehearsal_focus_profiles
       WHERE project_id = $1
       LIMIT 1`,
      [projectId]
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || typeof row !== "object") return null;
    const value = row as Record<string, unknown>;
    return rehearsalFocusProfileSchema.parse({
      profileId: value.profile_id,
      projectId: value.project_id,
      revision: value.revision,
      items: value.items_json,
      createdBy: value.created_by,
      updatedBy: value.updated_by,
      createdAt: databaseDateToIso(value.created_at),
      updatedAt: databaseDateToIso(value.updated_at)
    });
  }

  private async resolveSlideSnapshotUrls(
    projectId: string,
    actorUserId: string,
    deckSlideIds: readonly string[],
    snapshots: readonly { slideId: string; fileId: string }[] | undefined
  ) {
    const urls = new Map<string, string>();
    if (!snapshots?.length) {
      return urls;
    }

    const validSlideIds = new Set(deckSlideIds);
    for (const snapshot of snapshots) {
      if (!validSlideIds.has(snapshot.slideId)) {
        throw new BadRequestException(
          `slideSnapshots references an unknown slideId: ${snapshot.slideId}`
        );
      }

      const asset = await this.filesService.getUploadedAsset(
        projectId,
        snapshot.fileId,
        "rehearsal-slide-snapshot",
        actorUserId
      );
      if (!asset.mimeType.startsWith("image/")) {
        throw new BadRequestException("Rehearsal slide snapshots must be image assets.");
      }

      urls.set(
        snapshot.slideId,
        rehearsalSlideSnapshotContentPath(projectId, snapshot.fileId)
      );
    }

    return urls;
  }

  async readSlideSnapshotContent(
    projectId: string,
    fileId: string,
    actorUserId: string
  ) {
    return this.filesService.readRehearsalSlideSnapshotContent(
      projectId,
      fileId,
      actorUserId
    );
  }

  private async resolveAdaptiveBrief(
    projectId: string,
    briefRef: { mode: "generic" } | { mode: "briefed"; briefId: string; expectedRevision: number },
    evaluatorLensRef:
      | { lensId: "general-novice" | "decision-maker" | "strict-reviewer"; revision: 1 }
      | undefined
  ) {
    if (!evaluatorLensRef) {
      throw new BadRequestException("Evaluator Lens is required for adaptive rehearsal.");
    }
    if (briefRef.mode === "generic") {
      if (evaluatorLensRef.lensId !== "general-novice") {
        throw new ConflictException({
          code: "SOURCE_INCOMPATIBLE",
          message: "Generic rehearsal must use the general novice evaluator lens."
        });
      }
      return null;
    }

    const brief = await this.presentationBriefs.getCurrent(projectId);
    if (
      !brief ||
      brief.briefId !== briefRef.briefId ||
      brief.revision !== briefRef.expectedRevision ||
      brief.evaluatorLensRef.lensId !== evaluatorLensRef.lensId ||
      brief.evaluatorLensRef.revision !== evaluatorLensRef.revision
    ) {
      throw new ConflictException({
        code: "SOURCE_INCOMPATIBLE",
        message: "Brief or evaluator lens revision is no longer current."
      });
    }
    return brief;
  }

  private async resolveSourceGoalSetRef(projectId: string, goalSetId: string | null) {
    if (!goalSetId) return null;
    const rows = await this.rehearsalRuns.manager.query(
      `
        SELECT sets.goal_set_id, sets.revision
        FROM practice_goal_sets sets
        JOIN practice_goal_heads heads
          ON heads.project_id = sets.project_id
         AND heads.current_goal_set_id = sets.goal_set_id
        WHERE sets.project_id = $1
          AND sets.goal_set_id = $2
          AND sets.analysis_state = 'final'
      `,
      [projectId, goalSetId]
    );
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row || typeof row.goal_set_id !== "string" || typeof row.revision !== "number") {
      throw new ConflictException({
        code: "SOURCE_INCOMPATIBLE",
        message: "The selected practice goal set is no longer current and final."
      });
    }
    return { goalSetId: row.goal_set_id, revision: row.revision };
  }

  async createAudioUploadUrl(runId: string, actorUserId: string, body: unknown) {
    const request = parseRequest(createRehearsalAudioUploadUrlRequestSchema, body);
    const run = await this.getOwnedRun(runId, actorUserId);

    if (!["created", "uploading"].includes(run.status)) {
      throw new BadRequestException("Rehearsal run is not accepting uploads.");
    }

    const upload = await this.filesService.createUploadUrl(
      run.projectId,
      parseRequest(this.rehearsalAudioUploadRequestSchema, {
        ...request,
        purpose: "rehearsal-audio"
      }),
      actorUserId
    );

    run.audioFileId = upload.fileId;
    run.status = "uploading";
    run.error = null;
    run.updatedAt = new Date();
    const savedRun = await this.rehearsalRuns.save(run);

    return createRehearsalAudioUploadUrlResponseSchema.parse({
      run: toRehearsalRun(savedRun),
      upload
    });
  }

  async completeAudioUpload(runId: string, actorUserId: string, body: unknown) {
    const request = parseRequest(completeRehearsalAudioUploadRequestSchema, body);
    const run = await this.getOwnedRun(runId, actorUserId);

    if (run.status !== "uploading") {
      throw new BadRequestException("Rehearsal run has no pending audio upload.");
    }

    if (run.audioFileId !== request.fileId) {
      throw new BadRequestException("fileId does not match the rehearsal run.");
    }

    await this.filesService.completeUpload(
      run.projectId,
      { fileId: request.fileId },
      actorUserId,
      "rehearsal-audio"
    );
    await this.filesService.getUploadedAsset(
      run.projectId,
      request.fileId,
      "rehearsal-audio",
      actorUserId
    );

    const claimedRun = await this.claimAudioUpload(run, request.fileId, actorUserId);
    if (!claimedRun) {
      throw new BadRequestException("Rehearsal run has no pending audio upload.");
    }

    const queuedJob = await this.jobsService.create({
      projectId: run.projectId,
      type: "rehearsal-stt",
      payload: {
        audioFileId: request.fileId,
        deckId: run.deckId,
        runId: run.runId
      }
    });

    claimedRun.jobId = queuedJob.jobId;
    claimedRun.updatedAt = new Date();
    await this.rehearsalRuns.save(claimedRun);

    try {
      await this.enqueueJob({
        driver: this.config.JOB_QUEUE_DRIVER,
        redisUrl: this.config.REDIS_URL,
        jobId: queuedJob.jobId,
        projectId: run.projectId,
        runId: run.runId,
        deckId: run.deckId,
        audioFileId: request.fileId
      });

      this.logger.info(
        {
          event: "job.enqueued",
          jobId: queuedJob.jobId,
          jobType: queuedJob.type,
          projectId: claimedRun.projectId,
          runId: claimedRun.runId,
          deckId: claimedRun.deckId,
          audioFileId: request.fileId,
          driver: this.config.JOB_QUEUE_DRIVER
        },
        "Rehearsal STT job enqueued."
      );

      return completeRehearsalAudioUploadResponseSchema.parse({
        run: toRehearsalRun(claimedRun),
        job: queuedJob
      });
    } catch (error) {
      const failure = await this.cleanupAfterEnqueueFailure(claimedRun, request.fileId, error);
      await this.jobsService.update(queuedJob.jobId, {
        status: "failed",
        progress: 0,
        message: failure.jobMessage,
        error: failure.error
      });
      claimedRun.status = "failed";
      claimedRun.error = failure.error;
      claimedRun.rawAudioDeletedAt = failure.rawAudioDeletedAt;
      claimedRun.updatedAt = new Date();
      await this.rehearsalRuns.save(claimedRun);
      this.logger.error(
        {
          event: "job.enqueue_failed",
          jobId: queuedJob.jobId,
          jobType: queuedJob.type,
          projectId: claimedRun.projectId,
          runId: claimedRun.runId,
          deckId: claimedRun.deckId,
          audioFileId: request.fileId,
          driver: this.config.JOB_QUEUE_DRIVER,
          cleanupError: failure.cleanupError ? serializeLogError(failure.cleanupError) : undefined,
          error: serializeLogError(error)
        },
        "Rehearsal STT enqueue failed."
      );
      throw error;
    }
  }

  async updateRunMeta(runId: string, actorUserId: string, body: unknown) {
    const request = parseRequest(updateRehearsalRunMetaRequestSchema, body);
    const run = await this.getOwnedRun(runId, actorUserId);

    if (!["created", "uploading"].includes(run.status)) {
      throw new BadRequestException("Rehearsal run is not accepting meta updates.");
    }

    run.metaJson = request;
    run.updatedAt = new Date();
    const savedRun = await this.rehearsalRuns.save(run);

    return updateRehearsalRunMetaResponseSchema.parse({ run: toRehearsalRun(savedRun) });
  }

  async cancelRun(runId: string, actorUserId: string) {
    const run = await this.getOwnedRun(runId, actorUserId);
    if (run.status === "cancelled") {
      return cancelRehearsalRunResponseSchema.parse({ run: toRehearsalRun(run) });
    }

    if (!["created", "uploading"].includes(run.status) || run.jobId !== null) {
      throw new BadRequestException(
        "Rehearsal run cannot be cancelled after audio processing starts."
      );
    }

    const result = await this.rehearsalRuns.update(
      {
        runId: run.runId,
        projectId: run.projectId,
        status: run.status
      },
      {
        status: "cancelled",
        error: null,
        updatedAt: new Date()
      }
    );

    if (!result.affected) {
      throw new BadRequestException(
        "Rehearsal run cannot be cancelled after audio processing starts."
      );
    }

    const cancelled = await this.getOwnedRun(run.runId, actorUserId);
    return cancelRehearsalRunResponseSchema.parse({ run: toRehearsalRun(cancelled) });
  }

  async listRuns(
    projectId: string,
    actorUserId: string,
    query: Record<string, string> = {}
  ) {
    await this.projectsService.getAccessibleProject(projectId);
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 50, 1), 100);
    const page = Math.max(Number(query.page) || 1, 1);
    const where: Record<string, unknown> = {
      projectId,
      createdByUserId: actorUserId,
      status: Not("cancelled")
    };
    if (query.status) {
      where["status"] = query.status;
    }
    const [runs, total] = await this.rehearsalRuns.findAndCount({
      where,
      order: { createdAt: "DESC" },
      take: pageSize,
      skip: (page - 1) * pageSize
    });
    return { runs: runs.map(toRehearsalRun), total, page, pageSize };
  }

  async getRun(runId: string, actorUserId: string) {
    const run = await this.getOwnedRun(runId, actorUserId);
    return getRehearsalRunResponseSchema.parse({ run: toRehearsalRun(run) });
  }

  async getReport(runId: string, actorUserId: string) {
    const run = await this.getOwnedRun(runId, actorUserId);
    const report =
      run.status === "succeeded" && run.rehearsalReport ? run.rehearsalReport : null;
    const responseReport = report
      ? {
          ...report,
          transcriptRetained: false,
          transcript: null
        }
      : null;

    return getRehearsalReportResponseSchema.parse({
      run: toRehearsalRun(run),
      report: responseReport
    });
  }

  async getComparison(projectId: string, runId: string, actorUserId: string) {
    await this.projectsService.getAccessibleProject(projectId);
    const currentRun = await this.getOwnedRun(runId, actorUserId);
    if (!currentRun || currentRun.projectId !== projectId) {
      throw new NotFoundException(`Rehearsal run not found: ${runId}`);
    }
    if (currentRun.status !== "succeeded" || currentRun.rehearsalReport === null) {
      throw new ConflictException({
        code: "REHEARSAL_COMPARISON_NOT_READY",
        message: "Rehearsal comparison is available after the report succeeds."
      });
    }

    const currentReport = rehearsalReportSchema.safeParse(
      currentRun.rehearsalReport
    );
    if (!currentReport.success) {
      throw new ConflictException({
        code: "REHEARSAL_COMPARISON_REPORT_INVALID",
        message: "The current rehearsal report cannot be compared."
      });
    }

    const previousRun = await this.rehearsalRuns.findOne({
      where: {
        projectId,
        createdByUserId: actorUserId,
        status: "succeeded",
        createdAt: LessThan(currentRun.createdAt)
      },
      order: { createdAt: "DESC" }
    });
    const previousReport = previousRun?.rehearsalReport
      ? rehearsalReportSchema.safeParse(previousRun.rehearsalReport)
      : null;
    const comparison = buildRehearsalRunComparison({
      currentReport: currentReport.data,
      currentRunId: currentRun.runId,
      previousReport: previousReport?.success ? previousReport.data : null,
      previousRunId: previousReport?.success ? previousRun?.runId ?? null : null
    });

    return getRehearsalRunComparisonResponseSchema.parse(comparison);
  }

  async retrySemanticEvaluation(runId: string, actorUserId: string) {
    const run = await this.getOwnedRun(runId, actorUserId);
    if (
      run.status !== "succeeded" ||
      run.rehearsalReport === null ||
      run.semanticEvaluationMode !== "full" ||
      run.evaluationSnapshot === null
    ) {
      throw new ConflictException({
        code: "REHEARSAL_SEMANTIC_EVALUATION_NOT_READY",
        message: "Rehearsal semantic evaluation is not ready for retry.",
        retryable: false
      });
    }

    const hasEvidence = await this.transcriptCache.hasSemanticEvidence(run.runId);
    if (!hasEvidence) {
      throw new ConflictException({
        code: "REHEARSAL_SEMANTIC_EVIDENCE_EXPIRED",
        message: "Rehearsal semantic evidence has expired.",
        retryable: false
      });
    }

    const report = rehearsalReportSchema.safeParse(run.rehearsalReport);
    if (!report.success || !report.data.semanticEvaluation.retryable) {
      throw new ConflictException({
        code: "REHEARSAL_SEMANTIC_EVALUATION_NOT_READY",
        message: "Rehearsal semantic evaluation is not retryable.",
        retryable: false
      });
    }

    const queuedJob = await this.jobsService.create({
      projectId: run.projectId,
      type: "rehearsal-semantic-evaluation",
      payload: { runId: run.runId }
    });

    try {
      await this.enqueueSemanticEvaluationJob({
        driver: this.config.JOB_QUEUE_DRIVER,
        redisUrl: this.config.REDIS_URL,
        jobId: queuedJob.jobId,
        projectId: run.projectId,
        runId: run.runId
      });
      this.logger.info(
        {
          event: "job.enqueued",
          jobId: queuedJob.jobId,
          jobType: queuedJob.type,
          projectId: run.projectId,
          runId: run.runId,
          deckId: run.deckId,
          driver: this.config.JOB_QUEUE_DRIVER
        },
        "Rehearsal semantic evaluation retry enqueued."
      );
    } catch (error) {
      const failure = {
        code: "REHEARSAL_SEMANTIC_EVALUATION_ENQUEUE_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Rehearsal semantic evaluation retry enqueue failed."
      };
      await this.jobsService.update(queuedJob.jobId, {
        status: "failed",
        progress: 0,
        message: "Rehearsal semantic evaluation retry enqueue failed.",
        error: failure
      });
      this.logger.error(
        {
          event: "rehearsal.semantic_evaluation.retry_failed",
          projectId: run.projectId,
          deckId: run.deckId,
          deckVersion: run.deckVersion ?? undefined,
          runId: run.runId,
          jobId: queuedJob.jobId,
          reason: failure.code
        },
        "Rehearsal semantic evaluation retry enqueue failed."
      );
      throw error;
    }

    return retryRehearsalSemanticEvaluationResponseSchema.parse({
      job: queuedJob
    });
  }

  private async getOwnedRun(runId: string, actorUserId: string) {
    const run = await this.rehearsalRuns.findOne({
      where: { runId, createdByUserId: actorUserId }
    });
    if (!run) {
      throw new NotFoundException(`Rehearsal run not found: ${runId}`);
    }

    await this.projectsService.assertCanReadProject(run.projectId, actorUserId);

    return run;
  }

  async getSummary(projectId: string, actorUserId: string) {
    await this.projectsService.getAccessibleProject(projectId);

    const [runs, project] = await Promise.all([
      this.rehearsalRuns.find({
        where: { projectId, createdByUserId: actorUserId, status: "succeeded" },
        order: { createdAt: "ASC" }
      }),
      this.projects.findOne({ where: { projectId } })
    ]);

    if (runs.length === 0) {
      return getRehearsalProjectSummaryResponseSchema.parse({ summary: null });
    }

    const runDurationSeries = runs.map((run) => ({
      runId: run.runId,
      createdAt: run.createdAt.toISOString(),
      durationSeconds: extractReportDurationSeconds(run.rehearsalReport)
    }));

    const slideAccum = new Map<string, { total: number; count: number }>();
    for (const run of runs) {
      for (const t of extractReportSlideTimings(run.rehearsalReport)) {
        const entry = slideAccum.get(t.slideId) ?? { total: 0, count: 0 };
        entry.total += t.actualSeconds;
        entry.count += 1;
        slideAccum.set(t.slideId, entry);
      }
    }
    const slideAvgTimings = Array.from(slideAccum.entries()).map(([slideId, { total, count }]) => ({
      slideId,
      avgSeconds: Math.round(total / count),
      sampleCount: count
    }));

    return getRehearsalProjectSummaryResponseSchema.parse({
      summary: {
        projectId,
        runCount: runs.length,
        runDurationSeries,
        slideAvgTimings,
        progressComment: project?.progressComment ?? null
      }
    });
  }

  private async claimAudioUpload(
    run: RehearsalRunEntity,
    fileId: string,
    actorUserId: string
  ) {
    const result = await this.rehearsalRuns.update(
      {
        runId: run.runId,
        projectId: run.projectId,
        audioFileId: fileId,
        status: "uploading"
      },
      {
        status: "processing",
        error: null,
        updatedAt: new Date()
      }
    );

    if (!result.affected) {
      return null;
    }

    return this.getOwnedRun(run.runId, actorUserId);
  }

  private async cleanupAfterEnqueueFailure(
    run: RehearsalRunEntity,
    fileId: string,
    enqueueError: unknown
  ): Promise<{
    error: { code: string; message: string };
    jobMessage: string;
    rawAudioDeletedAt: Date | null;
    cleanupError?: unknown;
  }> {
    try {
      const rawAudioDeletedAt = await this.filesService.deleteUploadedAsset(
        run.projectId,
        fileId,
        "rehearsal-audio",
        run.createdByUserId
      );

      return {
        error: {
          code: "REHEARSAL_STT_ENQUEUE_FAILED",
          message:
            enqueueError instanceof Error ? enqueueError.message : "Rehearsal STT enqueue failed."
        },
        jobMessage: "Rehearsal STT enqueue failed.",
        rawAudioDeletedAt: new Date(rawAudioDeletedAt)
      };
    } catch (cleanupError) {
      return {
        error: {
          code: "RAW_AUDIO_DELETE_FAILED",
          message:
            cleanupError instanceof Error ? cleanupError.message : "Raw audio deletion failed."
        },
        jobMessage: "Rehearsal raw audio cleanup failed.",
        rawAudioDeletedAt: run.rawAudioDeletedAt,
        cleanupError
      };
    }
  }
}

function toRehearsalRun(run: RehearsalRunEntity): RehearsalRun {
  return {
    runId: run.runId,
    projectId: run.projectId,
    createdByUserId: run.createdByUserId,
    deckId: run.deckId,
    audioFileId: run.audioFileId,
    jobId: run.jobId,
    deckVersion: run.deckVersion,
    evaluationSnapshot: run.evaluationSnapshot,
    semanticEvaluationMode: run.semanticEvaluationMode,
    analysisRevision: run.analysisRevision ?? 0,
    analysisFinalizedAt: run.analysisFinalizedAt?.toISOString() ?? null,
    status: run.status,
    error: run.error,
    rawAudioDeletedAt: run.rawAudioDeletedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString()
  };
}

function databaseDateToIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  throw new Error("Rehearsal focus profile date is invalid.");
}

type ReportJsonShape = {
  metrics?: { durationSeconds?: number };
  slideTimings?: { slideId: string; actualSeconds: number }[];
};

function extractReportDurationSeconds(report: Record<string, unknown> | null): number {
  const metrics = (report as ReportJsonShape | null)?.metrics;
  return typeof metrics?.durationSeconds === "number" ? metrics.durationSeconds : 0;
}

function extractReportSlideTimings(report: Record<string, unknown> | null): { slideId: string; actualSeconds: number }[] {
  return (report as ReportJsonShape | null)?.slideTimings ?? [];
}
