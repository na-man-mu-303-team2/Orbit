import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  applyDeckPatch,
  removeLegacyAiGeneratedTitleAnimations,
} from "@orbit/editor-core";
import type { ApplyDeckPatchError } from "@orbit/editor-core";
import { loadOrbitConfig } from "@orbit/config";
import {
  enqueueDeckExportJob,
  enqueuePptxOoxmlSyncJob,
  enqueueSemanticCueExtractionJob,
  enqueueSpeakerNotesSuggestionJob,
  type EnqueueDeckExportJobInput,
  type EnqueuePptxOoxmlSyncJobInput,
  type EnqueueSemanticCueExtractionJobInput,
  type EnqueueSpeakerNotesSuggestionJobInput,
} from "@orbit/job-queue";
import {
  appendDeckPatchAckResponseSchema,
  appendDeckPatchRequestSchema,
  appendDeckPatchResponseSchema,
  deckApiErrorSchema,
  deckExportRequestSchema,
  deckSchema,
  deckSnapshotIdSchema,
  deckSnapshotReasonSchema,
  deckSnapshotSchema,
  getDeckResponseSchema,
  jobSchema,
  listDeckSnapshotsResponseSchema,
  putDeckRequestSchema,
  putDeckResponseSchema,
  restoreDeckSnapshotResponseSchema,
  createSemanticCueExtractionJobResponseSchema,
  semanticCueExtractionJobPayloadSchema,
  semanticCueExtractionRequestSchema,
  createSpeakerNotesSuggestionJobResponseSchema,
  speakerNotesSuggestionJobPayloadSchema,
  speakerNotesSuggestionRequestSchema,
  templateBlueprintSchema,
} from "@orbit/shared";
import type {
  AppendDeckPatchAckRequest,
  AppendDeckPatchAckResponse,
  AppendDeckPatchFullRequest,
  AppendDeckPatchRequest,
  AppendDeckPatchResponse,
  Deck,
  DeckApiError,
  DeckApiErrorCode,
  DeckChangeRecord,
  DeckElement,
  DeckPatch,
  DeckPatchOperation,
  ElementFramePatch,
  DeckSnapshot,
  DeckSnapshotReason,
  GetDeckResponse,
  ListDeckSnapshotsResponse,
  PutDeckRequest,
  PutDeckResponse,
  RestoreDeckSnapshotResponse,
  CreateSemanticCueExtractionJobResponse,
  CreateSpeakerNotesSuggestionJobResponse,
  TemplateBlueprint,
} from "@orbit/shared";
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { DataSource, EntityManager } from "typeorm";
import { ZodError } from "zod";
import { JobsService } from "../jobs/jobs.service";
import { serializeLogError } from "../logging";

type DeckRow = {
  project_id: string;
  deck_id: string;
  deck_json: unknown;
  version: number;
  updated_at: Date | string;
};

type DeckSnapshotRow = {
  snapshot_id: string;
  project_id: string;
  deck_id: string;
  deck_json: unknown;
  version: number;
  reason: DeckSnapshotReason;
  created_at: Date | string;
};

type DeckPatchRow = {
  change_id: string;
  project_id: string;
  deck_id: string;
  before_version: number;
  after_version: number;
  source: AppendDeckPatchRequest["patch"]["source"];
  actor_user_id: string | null;
  operations: AppendDeckPatchRequest["patch"]["operations"];
  created_at: Date | string;
};

type TemplateBlueprintRow = {
  template_id: string;
  blueprint_json: unknown;
};

type OoxmlTemplateBlueprint = TemplateBlueprintRow & {
  blueprint: TemplateBlueprint;
};

type PptxOoxmlSyncJobInput = {
  deckId: string;
  changeId: string;
  targetDeckVersion: number;
};

type DeckExportEnqueueJob = (input: EnqueueDeckExportJobInput) => Promise<void>;
type QueryExecutor = DataSource | EntityManager;
const deckCheckpointPatchInterval = 20;
export type PptxOoxmlSyncEnqueueJob = (
  input: EnqueuePptxOoxmlSyncJobInput,
) => Promise<void>;
export const PPTX_OOXML_SYNC_ENQUEUE_JOB = "PPTX_OOXML_SYNC_ENQUEUE_JOB";
export const DECK_EXPORT_ENQUEUE_JOB = "DECK_EXPORT_ENQUEUE_JOB";
export type SemanticCueExtractionEnqueueJob = (
  input: EnqueueSemanticCueExtractionJobInput,
) => Promise<void>;
export const SEMANTIC_CUE_EXTRACTION_ENQUEUE_JOB =
  "SEMANTIC_CUE_EXTRACTION_ENQUEUE_JOB";
export type SpeakerNotesSuggestionEnqueueJob = (
  input: EnqueueSpeakerNotesSuggestionJobInput,
) => Promise<void>;
export const SPEAKER_NOTES_SUGGESTION_ENQUEUE_JOB =
  "SPEAKER_NOTES_SUGGESTION_ENQUEUE_JOB";

@Injectable()
export class DecksService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() private readonly jobsService?: JobsService,
    @Optional()
    @Inject(PPTX_OOXML_SYNC_ENQUEUE_JOB)
    private readonly enqueueSyncJob: PptxOoxmlSyncEnqueueJob = enqueuePptxOoxmlSyncJob,
    @Optional()
    @Inject(DECK_EXPORT_ENQUEUE_JOB)
    private readonly enqueueDeckExport: DeckExportEnqueueJob = enqueueDeckExportJob,
    @Optional()
    @Inject(SEMANTIC_CUE_EXTRACTION_ENQUEUE_JOB)
    private readonly enqueueSemanticCueJob: SemanticCueExtractionEnqueueJob = enqueueSemanticCueExtractionJob,
    @Optional()
    @InjectPinoLogger(DecksService.name)
    private readonly logger?: PinoLogger,
    @Optional()
    @Inject(SPEAKER_NOTES_SUGGESTION_ENQUEUE_JOB)
    private readonly enqueueSpeakerNotesSuggestion: SpeakerNotesSuggestionEnqueueJob = enqueueSpeakerNotesSuggestionJob,
  ) {}

  async getDeck(projectId: string): Promise<GetDeckResponse> {
    const deckRow = await this.findDeckRow(this.dataSource, projectId);

    if (!deckRow) {
      throwDeckApiException(
        "DECK_NOT_FOUND",
        HttpStatus.NOT_FOUND,
        `Deck not found for project: ${projectId}`,
      );
    }

    const deck = await this.readCurrentDeckState(
      this.dataSource,
      parseDeckRow(deckRow),
      projectId,
      deckRow.deck_id,
      toIso(deckRow.updated_at),
    );

    return getDeckResponseSchema.parse({
      projectId,
      deck: deck.deck,
      updatedAt: deck.updatedAt,
    });
  }

  async createExportJob(projectId: string, body: unknown) {
    if (!this.jobsService) {
      throw new HttpException(
        "Deck export job service is unavailable",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const request = deckExportRequestSchema.parse(body ?? {});
    const { deck } = await this.getDeck(projectId);
    const queuedJob = await this.jobsService.create({
      projectId,
      type: "deck-export",
      payload: {
        deckId: deck.deckId,
        format: request.format,
      },
    });

    try {
      const config = loadOrbitConfig(process.env, { service: "api" });
      await this.enqueueDeckExport({
        driver: config.JOB_QUEUE_DRIVER,
        redisUrl: config.REDIS_URL,
        jobId: queuedJob.jobId,
        projectId,
        deck,
        format: request.format,
      });
    } catch (error) {
      await this.jobsService.update(queuedJob.jobId, {
        status: "failed",
        progress: 0,
        message: "Deck export enqueue failed.",
        error: {
          code: "DECK_EXPORT_ENQUEUE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Deck export enqueue failed.",
        },
      });
      throw error;
    }

    return { job: jobSchema.parse(queuedJob) };
  }

  async putDeck(projectId: string, body: unknown): Promise<PutDeckResponse> {
    const request = parsePutDeckRequest(body);

    if (request.deck.projectId !== projectId) {
      throwDeckApiException(
        "PROJECT_MISMATCH",
        HttpStatus.BAD_REQUEST,
        "URL projectId must match deck.projectId",
        [`projectId=${projectId}`, `deck.projectId=${request.deck.projectId}`],
      );
    }

    let syncInput: PptxOoxmlSyncJobInput | null = null;
    const response = await this.dataSource.transaction(async (manager) => {
      const updatedAt = nowIso();
      const deckRow = await this.findProjectDeckRowForUpdate(
        manager,
        projectId,
      );
      let currentDeck: Deck | undefined;
      let templateBlueprint: OoxmlTemplateBlueprint | undefined;

      if (deckRow) {
        if (deckRow.deck_id !== request.deck.deckId) {
          throwDeckApiException(
            "DECK_MISMATCH",
            HttpStatus.CONFLICT,
            "Stored deckId must match deck.deckId",
            [
              `deck.deckId=${deckRow.deck_id}`,
              `request.deckId=${request.deck.deckId}`,
            ],
          );
        }

        currentDeck = (
          await this.readCurrentDeckState(
            manager,
            parseDeckRow(deckRow),
            projectId,
            deckRow.deck_id,
            toIso(deckRow.updated_at),
            true,
          )
        ).deck;
        const baseVersion = request.baseVersion ?? request.deck.version;

        if (currentDeck.version !== baseVersion) {
          throwDeckApiException(
            "STALE_BASE_VERSION",
            HttpStatus.CONFLICT,
            "Deck baseVersion does not match current deck version",
            [
              `deck.version=${currentDeck.version}`,
              `request.baseVersion=${baseVersion}`,
            ],
          );
        }

        templateBlueprint = await this.findOoxmlTemplateBlueprint(
          manager,
          projectId,
          currentDeck.deckId,
        );
      }

      const parsedRequestedDeck = removeLegacyAiGeneratedTitleAnimations(
        request.deck,
      );
      const isImportedDeck = currentDeck?.metadata.sourceType === "import";
      const requestedDeck =
        currentDeck && (templateBlueprint || isImportedDeck)
          ? normalizeOoxmlReplacementProvenance(
              currentDeck,
              parsedRequestedDeck,
            )
          : parsedRequestedDeck;
      const replacement =
        currentDeck && (templateBlueprint || isImportedDeck)
          ? createOoxmlReplacement(currentDeck, requestedDeck, updatedAt)
          : undefined;
      const nextDeck = replacement?.deck ?? requestedDeck;

      await this.deletePatchRowsAfterVersion(
        manager,
        projectId,
        nextDeck.deckId,
        nextDeck.version,
      );

      if (replacement) {
        await this.insertPatchLog(manager, projectId, replacement.changeRecord);
      }

      const deck = await this.writeDeckCheckpoint(
        manager,
        nextDeck,
        updatedAt,
        templateBlueprint ?? null,
      );
      const snapshot = await this.createSnapshot(
        manager,
        deck,
        request.snapshotReason ?? "deck-replaced",
        updatedAt,
      );

      if (replacement && templateBlueprint) {
        syncInput = {
          deckId: deck.deckId,
          changeId: replacement.changeRecord.changeId,
          targetDeckVersion: deck.version,
        };
      }

      return {
        deck,
        snapshot,
        updatedAt,
      };
    });

    const ooxmlSyncJob = syncInput
      ? await this.enqueueOoxmlSync(projectId, syncInput)
      : undefined;

    return putDeckResponseSchema.parse({ ...response, ooxmlSyncJob });
  }

  async appendPatch(
    projectId: string,
    body: AppendDeckPatchAckRequest,
  ): Promise<AppendDeckPatchAckResponse>;
  async appendPatch(
    projectId: string,
    body: AppendDeckPatchFullRequest,
  ): Promise<AppendDeckPatchResponse>;
  async appendPatch(
    projectId: string,
    body: unknown,
  ): Promise<AppendDeckPatchResponse | AppendDeckPatchAckResponse>;
  async appendPatch(
    projectId: string,
    body: unknown,
  ): Promise<AppendDeckPatchResponse | AppendDeckPatchAckResponse> {
    const request = parseAppendDeckPatchRequest(body);
    let syncInput: PptxOoxmlSyncJobInput | null = null;

    const response = await this.dataSource.transaction(async (manager) => {
      const deckRow = await this.findDeckRowForUpdate(
        manager,
        projectId,
        request.patch.deckId,
      );

      if (!deckRow) {
        throwDeckApiException(
          "DECK_NOT_FOUND",
          HttpStatus.NOT_FOUND,
          `Deck not found for project: ${projectId}`,
        );
      }

      const checkpointVersion = deckRow.version;
      const currentDeck = (
        await this.readCurrentDeckState(
          manager,
          parseDeckRow(deckRow),
          projectId,
          request.patch.deckId,
          toIso(deckRow.updated_at),
          true,
        )
      ).deck;

      if (currentDeck.projectId !== projectId) {
        throwDeckApiException(
          "PROJECT_MISMATCH",
          HttpStatus.BAD_REQUEST,
          "Stored deck projectId must match URL projectId",
          [`projectId=${projectId}`, `deck.projectId=${currentDeck.projectId}`],
        );
      }

      const updatedAt = nowIso();
      const templateBlueprint = await this.findOoxmlTemplateBlueprint(
        manager,
        projectId,
        currentDeck.deckId,
      );
      const patch =
        templateBlueprint || currentDeck.metadata.sourceType === "import"
          ? normalizeOoxmlPatchProvenance(request.patch)
          : request.patch;
      const applyResult = applyDeckPatch(currentDeck, patch, {
        createdAt: updatedAt,
      });

      if (!applyResult.ok) {
        throwApplyPatchException(applyResult.error);
      }
      if (currentDeck.metadata.sourceType === "import") {
        assertOoxmlPatchOperationsAreSupported(
          currentDeck,
          applyResult.deck,
          patch.operations,
        );
      }

      await this.insertPatchLog(manager, projectId, applyResult.changeRecord);
      const shouldCheckpoint =
        !templateBlueprint &&
        (Boolean(request.snapshotReason) ||
          applyResult.deck.version - checkpointVersion >=
            deckCheckpointPatchInterval);
      const deck =
        templateBlueprint || shouldCheckpoint
          ? await this.writeDeckCheckpoint(
              manager,
              applyResult.deck,
              updatedAt,
              templateBlueprint ?? null,
            )
          : applyResult.deck;

      const snapshot = request.snapshotReason
        ? await this.createSnapshot(
            manager,
            deck,
            request.snapshotReason,
            updatedAt,
          )
        : null;
      if (templateBlueprint) {
        syncInput = {
          deckId: deck.deckId,
          changeId: applyResult.changeRecord.changeId,
          targetDeckVersion: deck.version,
        };
      }

      return {
        deck,
        changeRecord: applyResult.changeRecord,
        snapshot,
        updatedAt,
      };
    });

    const ooxmlSyncJob = syncInput
      ? await this.enqueueOoxmlSync(projectId, syncInput)
      : undefined;

    if (request.responseMode === "ack") {
      return appendDeckPatchAckResponseSchema.parse({
        deckId: response.deck.deckId,
        version: response.deck.version,
        changeRecord: response.changeRecord,
        ...(response.snapshot ? { snapshot: response.snapshot } : {}),
        ooxmlSyncJob,
        updatedAt: response.updatedAt,
      });
    }

    return appendDeckPatchResponseSchema.parse({ ...response, ooxmlSyncJob });
  }

  async createSemanticCueExtractionJob(
    projectId: string,
    body: unknown,
  ): Promise<CreateSemanticCueExtractionJobResponse> {
    const request = semanticCueExtractionRequestSchema.parse(body ?? {});

    if (!this.jobsService) {
      throwDeckApiException(
        "DECK_VALIDATION_FAILED",
        HttpStatus.SERVICE_UNAVAILABLE,
        "Jobs service is not available",
      );
    }

    const preparedRequest = await this.dataSource.transaction(
      async (manager) => {
        const deckRow = await this.findProjectDeckRowForUpdate(
          manager,
          projectId,
        );

        if (!deckRow) {
          throwDeckApiException(
            "DECK_NOT_FOUND",
            HttpStatus.NOT_FOUND,
            `Deck not found for project: ${projectId}`,
          );
        }

        const requestedDeckId = request.deckId ?? deckRow.deck_id;
        if (requestedDeckId !== deckRow.deck_id) {
          throwDeckApiException(
            "DECK_MISMATCH",
            HttpStatus.BAD_REQUEST,
            "Requested deckId must match project deck",
            [
              `deck.deckId=${deckRow.deck_id}`,
              `request.deckId=${requestedDeckId}`,
            ],
          );
        }

        const materializedState = await this.readCurrentDeckState(
          manager,
          parseDeckRow(deckRow),
          projectId,
          deckRow.deck_id,
          toIso(deckRow.updated_at),
          true,
        );
        const deck = await this.writeDeckCheckpoint(
          manager,
          materializedState.deck,
          nowIso(),
        );

        return semanticCueExtractionJobPayloadSchema.shape.request.parse({
          deckId: deck.deckId,
          force: request.force,
          baseVersion: deck.version,
        });
      },
    );

    const queuedJob = await this.jobsService.create({
      projectId,
      type: "semantic-cue-extraction",
      payload: { request: preparedRequest },
    });

    try {
      const config = loadOrbitConfig(process.env, { service: "api" });
      await this.enqueueSemanticCueJob({
        driver: config.JOB_QUEUE_DRIVER,
        redisUrl: config.REDIS_URL,
        jobId: queuedJob.jobId,
        projectId,
        request: preparedRequest,
      });
      this.logger?.info(
        {
          event: "semantic_cue.extraction.queued",
          jobId: queuedJob.jobId,
          jobType: queuedJob.type,
          projectId,
          deckId: preparedRequest.deckId,
          deckVersion: preparedRequest.baseVersion,
          force: preparedRequest.force,
        },
        "Semantic cue extraction job enqueued.",
      );
    } catch (error) {
      await this.jobsService.update(queuedJob.jobId, {
        status: "failed",
        progress: 0,
        message: "Semantic cue extraction enqueue failed.",
        error: {
          code: "SEMANTIC_CUE_EXTRACTION_ENQUEUE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Semantic cue extraction enqueue failed.",
        },
      });
      this.logger?.error(
        {
          event: "semantic_cue.extraction.failed",
          jobId: queuedJob.jobId,
          jobType: queuedJob.type,
          projectId,
          deckId: preparedRequest.deckId,
          deckVersion: preparedRequest.baseVersion,
          reason: "enqueue_failed",
          error: serializeLogError(error),
        },
        "Semantic cue extraction enqueue failed.",
      );
      throw error;
    }

    return createSemanticCueExtractionJobResponseSchema.parse({
      job: queuedJob,
    });
  }

  async createSpeakerNotesSuggestionJob(
    projectId: string,
    body: unknown,
  ): Promise<CreateSpeakerNotesSuggestionJobResponse> {
    const request = speakerNotesSuggestionRequestSchema.parse(body);

    if (!this.jobsService) {
      throwDeckApiException(
        "DECK_VALIDATION_FAILED",
        HttpStatus.SERVICE_UNAVAILABLE,
        "Jobs service is not available",
      );
    }

    const preparedRequest = await this.dataSource.transaction(
      async (manager) => {
        const deckRow = await this.findProjectDeckRowForUpdate(
          manager,
          projectId,
        );
        if (!deckRow) {
          throwDeckApiException(
            "DECK_NOT_FOUND",
            HttpStatus.NOT_FOUND,
            `Deck not found for project: ${projectId}`,
          );
        }
        if (request.deckId !== deckRow.deck_id) {
          throwDeckApiException(
            "DECK_MISMATCH",
            HttpStatus.BAD_REQUEST,
            "Requested deckId must match project deck",
          );
        }

        const materializedState = await this.readCurrentDeckState(
          manager,
          parseDeckRow(deckRow),
          projectId,
          deckRow.deck_id,
          toIso(deckRow.updated_at),
          true,
        );
        if (materializedState.deck.version !== request.baseVersion) {
          throwDeckApiException(
            "STALE_BASE_VERSION",
            HttpStatus.CONFLICT,
            "Deck changed before the speaker notes suggestion started",
          );
        }
        const slide = materializedState.deck.slides.find(
          (candidate) => candidate.slideId === request.slideId,
        );
        if (!slide) {
          throwDeckApiException(
            "DECK_VALIDATION_FAILED",
            HttpStatus.BAD_REQUEST,
            "Requested slide does not exist in the deck",
          );
        }
        const hasNotes = slide.speakerNotes.trim().length > 0;
        if ((request.mode === "draft") === hasNotes) {
          throwDeckApiException(
            "DECK_VALIDATION_FAILED",
            HttpStatus.BAD_REQUEST,
            hasNotes
              ? "Draft mode is only available when speaker notes are empty"
              : "Refinement modes require existing speaker notes",
          );
        }

        const deck = await this.writeDeckCheckpoint(
          manager,
          materializedState.deck,
          nowIso(),
        );
        return speakerNotesSuggestionJobPayloadSchema.shape.request.parse({
          ...request,
          baseVersion: deck.version,
        });
      },
    );

    const queuedJob = await this.jobsService.create({
      projectId,
      type: "speaker-notes-suggestion",
      payload: { request: preparedRequest },
    });

    try {
      const config = loadOrbitConfig(process.env, { service: "api" });
      await this.enqueueSpeakerNotesSuggestion({
        driver: config.JOB_QUEUE_DRIVER,
        redisUrl: config.REDIS_URL,
        jobId: queuedJob.jobId,
        projectId,
        request: preparedRequest,
      });
      this.logger?.info(
        {
          event: "speaker_notes.suggestion.queued",
          jobId: queuedJob.jobId,
          jobType: queuedJob.type,
          projectId,
          deckId: preparedRequest.deckId,
          slideId: preparedRequest.slideId,
          deckVersion: preparedRequest.baseVersion,
          mode: preparedRequest.mode,
        },
        "Speaker notes suggestion job enqueued.",
      );
    } catch (error) {
      await this.jobsService.update(queuedJob.jobId, {
        status: "failed",
        progress: 0,
        message: "Speaker notes suggestion enqueue failed.",
        error: {
          code: "SPEAKER_NOTES_SUGGESTION_ENQUEUE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Speaker notes suggestion enqueue failed.",
        },
      });
      this.logger?.error(
        {
          event: "speaker_notes.suggestion.failed",
          jobId: queuedJob.jobId,
          jobType: queuedJob.type,
          projectId,
          deckId: preparedRequest.deckId,
          slideId: preparedRequest.slideId,
          deckVersion: preparedRequest.baseVersion,
          mode: preparedRequest.mode,
          reason: "enqueue_failed",
          error: serializeLogError(error),
        },
        "Speaker notes suggestion enqueue failed.",
      );
      throw error;
    }

    return createSpeakerNotesSuggestionJobResponseSchema.parse({
      job: queuedJob,
    });
  }

  async listSnapshots(projectId: string): Promise<ListDeckSnapshotsResponse> {
    const rows = await this.dataSource.query<DeckSnapshotRow[]>(
      `
        SELECT snapshot_id, project_id, deck_id, deck_json, version, reason, created_at
        FROM deck_snapshots
        WHERE project_id = $1
        ORDER BY created_at DESC, version DESC, snapshot_id DESC
      `,
      [projectId],
    );

    return listDeckSnapshotsResponseSchema.parse({
      projectId,
      snapshots: rows.map(parseSnapshotRow),
    });
  }

  async restoreSnapshot(
    projectId: string,
    snapshotId: string,
  ): Promise<RestoreDeckSnapshotResponse> {
    let syncInput: PptxOoxmlSyncJobInput | null = null;
    const response = await this.dataSource.transaction(async (manager) => {
      const snapshotRow = await this.findSnapshotRow(manager, snapshotId);

      if (!snapshotRow) {
        throwDeckApiException(
          "SNAPSHOT_NOT_FOUND",
          HttpStatus.NOT_FOUND,
          `Snapshot not found: ${snapshotId}`,
        );
      }

      if (snapshotRow.project_id !== projectId) {
        throwDeckApiException(
          "SNAPSHOT_PROJECT_MISMATCH",
          HttpStatus.BAD_REQUEST,
          "Snapshot does not belong to the requested project",
          [
            `projectId=${projectId}`,
            `snapshot.projectId=${snapshotRow.project_id}`,
          ],
        );
      }

      const restoredSnapshot = parseSnapshotRow(snapshotRow);
      const snapshotDeck = removeLegacyAiGeneratedTitleAnimations(
        parseDeckJson(snapshotRow.deck_json),
      );
      const updatedAt = nowIso();
      let currentDeck: Deck | undefined;
      let templateBlueprint: OoxmlTemplateBlueprint | undefined;
      const currentRow = await this.findDeckRowForUpdate(
        manager,
        projectId,
        snapshotDeck.deckId,
      );
      if (currentRow) {
        const currentState = await this.readCurrentDeckState(
          manager,
          parseDeckJson(currentRow.deck_json),
          projectId,
          snapshotDeck.deckId,
          toIso(currentRow.updated_at),
          true,
        );
        currentDeck = currentState.deck;
        templateBlueprint = await this.findOoxmlTemplateBlueprint(
          manager,
          projectId,
          currentDeck.deckId,
        );
        await this.createSnapshot(
          manager,
          currentDeck,
          "snapshot-restore",
          updatedAt,
        );
      }

      if (
        currentDeck &&
        (templateBlueprint || currentDeck.metadata.sourceType === "import")
      ) {
        const normalizedSnapshotDeck = normalizeOoxmlReplacementProvenance(
          currentDeck,
          snapshotDeck,
        );
        const replacement = createOoxmlReplacement(
          currentDeck,
          normalizedSnapshotDeck,
          updatedAt,
          "snapshot-restore",
        );
        await this.insertPatchLog(manager, projectId, replacement.changeRecord);
        const restoredDeck = await this.writeDeckCheckpoint(
          manager,
          replacement.deck,
          updatedAt,
          templateBlueprint ?? null,
        );
        if (templateBlueprint) {
          syncInput = {
            deckId: restoredDeck.deckId,
            changeId: replacement.changeRecord.changeId,
            targetDeckVersion: restoredDeck.version,
          };
        }

        return { deck: restoredDeck, restoredSnapshot, updatedAt };
      }

      await this.deletePatchRowsAfterVersion(
        manager,
        projectId,
        snapshotDeck.deckId,
        snapshotDeck.version,
      );
      await this.writeDeckCheckpoint(manager, snapshotDeck, updatedAt);

      return { deck: snapshotDeck, restoredSnapshot, updatedAt };
    });

    const ooxmlSyncJob = syncInput
      ? await this.enqueueOoxmlSync(projectId, syncInput)
      : undefined;

    return restoreDeckSnapshotResponseSchema.parse({
      ...response,
      ooxmlSyncJob,
    });
  }

  private async readCurrentDeckState(
    executor: QueryExecutor,
    checkpointDeck: Deck,
    projectId: string,
    deckId: string,
    checkpointUpdatedAt: string,
    lockRows = false,
  ): Promise<{ deck: Deck; updatedAt: string }> {
    const patchRows = await this.findPatchRowsAfterVersion(
      executor,
      projectId,
      deckId,
      checkpointDeck.version,
      lockRows,
    );

    if (patchRows.length === 0) {
      return {
        deck: removeLegacyAiGeneratedTitleAnimations(checkpointDeck),
        updatedAt: checkpointUpdatedAt,
      };
    }

    const deck = removeLegacyAiGeneratedTitleAnimations(
      replayPatchRows(checkpointDeck, patchRows),
    );
    return {
      deck,
      updatedAt: toIso(patchRows.at(-1)?.created_at ?? nowIso()),
    };
  }

  private async findDeckRow(
    executor: QueryExecutor,
    projectId: string,
  ): Promise<DeckRow | undefined> {
    const rows = await executor.query<DeckRow[]>(
      `
        SELECT project_id, deck_id, deck_json, version, updated_at
        FROM decks
        WHERE project_id = $1
      `,
      [projectId],
    );

    return rows[0];
  }

  private async findProjectDeckRowForUpdate(
    manager: EntityManager,
    projectId: string,
  ): Promise<DeckRow | undefined> {
    const rows = await manager.query<DeckRow[]>(
      `
        SELECT project_id, deck_id, deck_json, version, updated_at
        FROM decks
        WHERE project_id = $1
        FOR UPDATE
      `,
      [projectId],
    );

    return rows[0];
  }

  private async findDeckRowForUpdate(
    manager: EntityManager,
    projectId: string,
    deckId: string,
  ): Promise<DeckRow | undefined> {
    const rows = await manager.query<DeckRow[]>(
      `
        SELECT project_id, deck_id, deck_json, version, updated_at
        FROM decks
        WHERE project_id = $1 AND deck_id = $2
        FOR UPDATE
      `,
      [projectId, deckId],
    );

    return rows[0];
  }

  private async findPatchRowsAfterVersion(
    executor: QueryExecutor,
    projectId: string,
    deckId: string,
    version: number,
    lockRows = false,
  ): Promise<DeckPatchRow[]> {
    const rows = await executor.query<DeckPatchRow[]>(
      `
        SELECT
          change_id,
          project_id,
          deck_id,
          before_version,
          after_version,
          source,
          actor_user_id,
          operations,
          created_at
        FROM deck_patches
        WHERE project_id = $1 AND deck_id = $2 AND after_version > $3
        ORDER BY after_version ASC, created_at ASC, change_id ASC
        ${lockRows ? "FOR UPDATE" : ""}
      `,
      [projectId, deckId, version],
    );

    return rows;
  }

  private async upsertDeck(
    executor: QueryExecutor,
    deck: Deck,
    updatedAt: string,
  ): Promise<Deck> {
    const rows = await executor.query<DeckRow[]>(
      `
        INSERT INTO decks (project_id, deck_id, deck_json, version, updated_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (project_id)
        DO UPDATE SET
          deck_id = EXCLUDED.deck_id,
          deck_json = EXCLUDED.deck_json,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at
        RETURNING project_id, deck_id, deck_json, version, updated_at
      `,
      [deck.projectId, deck.deckId, deck, deck.version, updatedAt],
    );

    return parseDeckRow(rows[0]);
  }

  private async writeDeckCheckpoint(
    executor: QueryExecutor,
    deck: Deck,
    updatedAt: string,
    knownTemplateBlueprint?: OoxmlTemplateBlueprint | null,
  ): Promise<Deck> {
    const templateBlueprint =
      knownTemplateBlueprint === undefined
        ? await this.findOoxmlTemplateBlueprint(
            executor,
            deck.projectId,
            deck.deckId,
          )
        : (knownTemplateBlueprint ?? undefined);
    const checkpointDeck = await this.upsertDeck(executor, deck, updatedAt);
    await this.deletePatchRowsUpToVersion(
      executor,
      checkpointDeck.projectId,
      checkpointDeck.deckId,
      templateBlueprint
        ? Math.min(
            templateBlueprint.blueprint.ooxmlSyncedDeckVersion ?? 1,
            checkpointDeck.version,
          )
        : checkpointDeck.version,
    );
    return checkpointDeck;
  }

  private async insertPatchLog(
    manager: EntityManager,
    projectId: string,
    changeRecord: DeckChangeRecord,
  ): Promise<void> {
    await manager.query(
      `
        INSERT INTO deck_patches (
          change_id,
          project_id,
          deck_id,
          before_version,
          after_version,
          source,
          actor_user_id,
          operations,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        changeRecord.changeId,
        projectId,
        changeRecord.deckId,
        changeRecord.beforeVersion,
        changeRecord.afterVersion,
        changeRecord.source,
        changeRecord.actorUserId ?? null,
        JSON.stringify(changeRecord.operations),
        changeRecord.createdAt,
      ],
    );
  }

  private async createSnapshot(
    executor: QueryExecutor,
    deck: Deck,
    reason: DeckSnapshotReason,
    createdAt: string,
  ): Promise<DeckSnapshot> {
    const snapshotId = deckSnapshotIdSchema.parse(`snapshot_${randomUUID()}`);
    const snapshotReason = deckSnapshotReasonSchema.parse(reason);

    const rows = await executor.query<DeckSnapshotRow[]>(
      `
        INSERT INTO deck_snapshots (
          snapshot_id,
          project_id,
          deck_id,
          deck_json,
          version,
          reason,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING snapshot_id, project_id, deck_id, deck_json, version, reason, created_at
      `,
      [
        snapshotId,
        deck.projectId,
        deck.deckId,
        deck,
        deck.version,
        snapshotReason,
        createdAt,
      ],
    );

    return parseSnapshotRow(rows[0]);
  }

  private async deletePatchRowsAfterVersion(
    executor: QueryExecutor,
    projectId: string,
    deckId: string,
    version: number,
  ): Promise<void> {
    await executor.query(
      `
        DELETE FROM deck_patches
        WHERE project_id = $1 AND deck_id = $2 AND after_version > $3
      `,
      [projectId, deckId, version],
    );
  }

  private async deletePatchRowsUpToVersion(
    executor: QueryExecutor,
    projectId: string,
    deckId: string,
    version: number,
  ): Promise<void> {
    await executor.query(
      `
        DELETE FROM deck_patches
        WHERE project_id = $1 AND deck_id = $2 AND after_version <= $3
      `,
      [projectId, deckId, version],
    );
  }

  private async findSnapshotRow(
    manager: EntityManager,
    snapshotId: string,
  ): Promise<DeckSnapshotRow | undefined> {
    const rows = await manager.query<DeckSnapshotRow[]>(
      `
        SELECT snapshot_id, project_id, deck_id, deck_json, version, reason, created_at
        FROM deck_snapshots
        WHERE snapshot_id = $1
        FOR UPDATE
      `,
      [snapshotId],
    );

    return rows[0];
  }

  private async findOoxmlTemplateBlueprint(
    executor: QueryExecutor,
    projectId: string,
    deckId: string,
  ): Promise<OoxmlTemplateBlueprint | undefined> {
    const rows = await executor.query<TemplateBlueprintRow[]>(
      `
        SELECT template_id, blueprint_json
        FROM template_blueprints
        WHERE project_id = $1 AND deck_id = $2
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      `,
      [projectId, deckId],
    );
    const row = rows[0];

    if (!row) {
      return undefined;
    }

    const parsed = templateBlueprintSchema.safeParse(row.blueprint_json);
    if (
      !parsed.success ||
      (!parsed.data.currentPackageFileId && !parsed.data.sourcePackageFileId)
    ) {
      return undefined;
    }

    return { ...row, blueprint: parsed.data };
  }

  private async enqueueOoxmlSync(
    projectId: string,
    input: PptxOoxmlSyncJobInput,
  ) {
    if (!this.jobsService) {
      return undefined;
    }

    const queuedJob = await this.jobsService.create({
      projectId,
      type: "pptx-ooxml-sync",
      payload: input,
    });

    try {
      const config = loadOrbitConfig(process.env, { service: "api" });
      await this.enqueueSyncJob({
        driver: config.JOB_QUEUE_DRIVER,
        redisUrl: config.REDIS_URL,
        jobId: queuedJob.jobId,
        projectId,
        ...input,
      });
      this.logger?.info(
        {
          event: "pptx_ooxml.sync.queued",
          jobId: queuedJob.jobId,
          projectId,
          deckId: input.deckId,
          targetDeckVersion: input.targetDeckVersion,
        },
        "PPTX OOXML sync job enqueued.",
      );
      return queuedJob;
    } catch (error) {
      const failedJob =
        (await this.jobsService.update(queuedJob.jobId, {
          status: "failed",
          progress: 0,
          message: "PPTX OOXML sync enqueue failed.",
          error: {
            code: "PPTX_OOXML_SYNC_ENQUEUE_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "PPTX OOXML sync enqueue failed.",
          },
        })) ?? queuedJob;
      this.logger?.error(
        {
          event: "pptx_ooxml.sync.enqueue_failed",
          jobId: queuedJob.jobId,
          projectId,
          deckId: input.deckId,
          targetDeckVersion: input.targetDeckVersion,
        },
        "PPTX OOXML sync job enqueue failed.",
      );
      return failedJob;
    }
  }
}

function parsePutDeckRequest(body: unknown): PutDeckRequest {
  const result = putDeckRequestSchema.safeParse(body);

  if (!result.success) {
    throwDeckApiException(
      "DECK_VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      "Deck payload is invalid",
      formatZodError(result.error),
    );
  }

  return result.data;
}

function createOoxmlReplacement(
  currentDeck: Deck,
  requestedDeck: Deck,
  createdAt: string,
  structurePolicy: "full-put" | "snapshot-restore" = "full-put",
): { deck: Deck; changeRecord: DeckChangeRecord } {
  assertOoxmlReplacementStructureIsSupported(
    currentDeck,
    requestedDeck,
    structurePolicy,
  );
  const deck = deckSchema.parse({
    ...requestedDeck,
    version: currentDeck.version + 1,
  });
  const neutralDiff = createOoxmlNeutralDiff(currentDeck, deck);
  const elementOperations = createOoxmlElementDiff(currentDeck, deck);
  for (const operation of elementOperations) {
    if (
      operation.type === "update_element_props" ||
      operation.type === "delete_element"
    ) {
      neutralDiff.semanticCueReplaySlideIds.add(operation.slideId);
    }
  }
  const operations = [
    ...neutralDiff.operations,
    ...elementOperations,
    ...createOoxmlSemanticCueReplayOperations(
      deck,
      neutralDiff.semanticCueReplaySlideIds,
    ),
  ];
  if (currentDeck.metadata.sourceType === "import") {
    assertOoxmlPatchOperationsAreSupported(currentDeck, deck, operations);
  }

  return {
    deck,
    changeRecord: {
      changeId: `change_${deck.deckId}_${deck.version}_put`,
      deckId: deck.deckId,
      beforeVersion: currentDeck.version,
      afterVersion: deck.version,
      source: "user",
      createdAt,
      operations:
        operations.length > 0
          ? operations
          : [{ type: "update_deck", title: deck.title }],
    },
  };
}

function normalizeOoxmlReplacementProvenance(
  currentDeck: Deck,
  requestedDeck: Deck,
): Deck {
  const currentSlides = new Map(
    currentDeck.slides.map((slide) => [slide.slideId, slide]),
  );
  const metadata = { ...requestedDeck.metadata };
  if (currentDeck.metadata.sourceType === undefined) {
    delete metadata.sourceType;
  } else {
    metadata.sourceType = currentDeck.metadata.sourceType;
  }

  return deckSchema.parse({
    ...requestedDeck,
    metadata,
    slides: requestedDeck.slides.map((slide) => {
      const currentSlide = currentSlides.get(slide.slideId);
      if (!currentSlide) return authoredOoxmlSlide(slide);

      const currentElements = new Map(
        currentSlide.elements.map((element) => [element.elementId, element]),
      );
      const normalizedSlide = {
        ...slide,
        ooxmlOrigin: currentSlide.ooxmlOrigin,
        ooxmlMotionCapabilities: currentSlide.ooxmlMotionCapabilities,
        elements: slide.elements.map((element) => {
          const currentElement = currentElements.get(element.elementId);
          if (currentElement?.type !== element.type) {
            return authoredOoxmlElement(element);
          }
          const normalizedElement = {
            ...element,
            ooxmlOrigin: currentElement.ooxmlOrigin,
            ooxmlEditCapabilities: currentElement.ooxmlEditCapabilities,
          };
          if (currentElement.ooxmlOrigin === undefined) {
            delete normalizedElement.ooxmlOrigin;
          }
          if (currentElement.ooxmlEditCapabilities === undefined) {
            delete normalizedElement.ooxmlEditCapabilities;
          }
          return normalizedElement;
        }),
      };
      if (currentSlide.ooxmlOrigin === undefined) {
        delete normalizedSlide.ooxmlOrigin;
      }
      if (currentSlide.ooxmlMotionCapabilities === undefined) {
        delete normalizedSlide.ooxmlMotionCapabilities;
      }
      return normalizedSlide;
    }),
  });
}

function normalizeOoxmlPatchProvenance(patch: DeckPatch): DeckPatch {
  return {
    ...patch,
    operations: patch.operations.map((operation) => {
      if (operation.type === "add_element") {
        return {
          ...operation,
          element: authoredOoxmlElement(operation.element),
        };
      }
      if (operation.type === "add_slide") {
        return {
          ...operation,
          slide: authoredOoxmlSlide(operation.slide),
        };
      }
      return operation;
    }),
  };
}

function authoredOoxmlElement(element: DeckElement): DeckElement {
  const authored = {
    ...element,
    ooxmlOrigin: "authored" as const,
  };
  delete authored.ooxmlEditCapabilities;
  return authored;
}

function authoredOoxmlSlide(slide: Deck["slides"][number]) {
  const authored = {
    ...slide,
    ooxmlOrigin: "authored" as const,
    elements: slide.elements.map(authoredOoxmlElement),
  };
  delete authored.ooxmlMotionCapabilities;
  return authored;
}

function assertOoxmlReplacementStructureIsSupported(
  currentDeck: Deck,
  requestedDeck: Deck,
  structurePolicy: "full-put" | "snapshot-restore",
): void {
  const comparableStructure =
    structurePolicy === "snapshot-restore"
      ? ooxmlSnapshotRestorePackageStructure
      : ooxmlFullPutStructure;

  if (
    isDeepStrictEqual(
      comparableStructure(currentDeck),
      comparableStructure(requestedDeck),
    )
  ) {
    return;
  }

  throwDeckApiException(
    "OOXML_CHANGE_UNSUPPORTED",
    HttpStatus.BAD_REQUEST,
    "Imported Deck full replacement contains an unsupported OOXML change",
    [
      structurePolicy === "snapshot-restore"
        ? "Snapshot restore may change package-neutral Deck and slide fields plus supported element content; slide structure, canvas, theme, style, and animations must remain unchanged."
        : "Only the Deck title and element add, delete, frame, or property changes are supported by this endpoint.",
    ],
  );
}

function ooxmlFullPutStructure(deck: Deck) {
  return ooxmlSnapshotRestorePackageStructure(deck);
}

function ooxmlSnapshotRestorePackageStructure(deck: Deck) {
  const {
    title: _title,
    version: _version,
    metadata: _metadata,
    targetDurationMinutes: _targetDurationMinutes,
    slides,
    ...packageStructure
  } = deck;
  return {
    ...packageStructure,
    slides: slides.map(
      ({
        title: _title,
        thumbnailUrl: _thumbnailUrl,
        estimatedSeconds: _estimatedSeconds,
        speakerNotes: _speakerNotes,
        elements: _elements,
        keywords: _keywords,
        semanticCues: _semanticCues,
        actions: _actions,
        aiNotes: _aiNotes,
        ...slidePackageStructure
      }) => slidePackageStructure,
    ),
  };
}

function createOoxmlNeutralDiff(
  currentDeck: Deck,
  nextDeck: Deck,
): {
  operations: DeckPatchOperation[];
  semanticCueReplaySlideIds: Set<string>;
} {
  const operations: DeckPatchOperation[] = [];
  const semanticCueReplaySlideIds = new Set<string>();
  const updateDeck: Extract<DeckPatchOperation, { type: "update_deck" }> = {
    type: "update_deck",
  };

  if (currentDeck.title !== nextDeck.title) updateDeck.title = nextDeck.title;
  if (currentDeck.targetDurationMinutes !== nextDeck.targetDurationMinutes) {
    updateDeck.targetDurationMinutes = nextDeck.targetDurationMinutes;
  }
  const metadata = ooxmlDeckMetadataPatch(currentDeck, nextDeck);
  if (Object.keys(metadata).length > 0) updateDeck.metadata = metadata;
  if (Object.keys(updateDeck).length > 1) operations.push(updateDeck);

  const nextSlides = new Map(
    nextDeck.slides.map((slide) => [slide.slideId, slide]),
  );
  for (const currentSlide of currentDeck.slides) {
    const nextSlide = nextSlides.get(currentSlide.slideId);
    if (!nextSlide) continue;

    const resetActions =
      !isDeepStrictEqual(currentSlide.actions, nextSlide.actions) ||
      !isDeepStrictEqual(currentSlide.keywords, nextSlide.keywords);
    if (resetActions) {
      for (const action of currentSlide.actions) {
        operations.push({
          type: "delete_slide_action",
          slideId: currentSlide.slideId,
          actionId: action.actionId,
        });
      }
      semanticCueReplaySlideIds.add(currentSlide.slideId);
    }

    const updateSlide: Extract<DeckPatchOperation, { type: "update_slide" }> = {
      type: "update_slide",
      slideId: currentSlide.slideId,
    };
    if (currentSlide.title !== nextSlide.title)
      updateSlide.title = nextSlide.title;
    if (currentSlide.thumbnailUrl !== nextSlide.thumbnailUrl) {
      updateSlide.thumbnailUrl = nextSlide.thumbnailUrl;
    }
    if (currentSlide.estimatedSeconds !== nextSlide.estimatedSeconds) {
      updateSlide.estimatedSeconds = nextSlide.estimatedSeconds ?? null;
    }
    if (!isDeepStrictEqual(currentSlide.aiNotes, nextSlide.aiNotes)) {
      updateSlide.aiNotes = nextSlide.aiNotes ?? null;
    }
    if (Object.keys(updateSlide).length > 2) operations.push(updateSlide);

    if (currentSlide.speakerNotes !== nextSlide.speakerNotes) {
      operations.push({
        type: "update_speaker_notes",
        slideId: currentSlide.slideId,
        speakerNotes: nextSlide.speakerNotes,
      });
      semanticCueReplaySlideIds.add(currentSlide.slideId);
    }
    if (!isDeepStrictEqual(currentSlide.keywords, nextSlide.keywords)) {
      operations.push({
        type: "replace_keywords",
        slideId: currentSlide.slideId,
        keywords: nextSlide.keywords,
      });
      semanticCueReplaySlideIds.add(currentSlide.slideId);
    }
    if (resetActions) {
      for (const action of nextSlide.actions) {
        operations.push({
          type: "add_slide_action",
          slideId: currentSlide.slideId,
          action,
        });
      }
    }
    if (!isDeepStrictEqual(currentSlide.semanticCues, nextSlide.semanticCues)) {
      semanticCueReplaySlideIds.add(currentSlide.slideId);
    }
  }

  return { operations, semanticCueReplaySlideIds };
}

function ooxmlDeckMetadataPatch(
  currentDeck: Deck,
  nextDeck: Deck,
): NonNullable<
  Extract<DeckPatchOperation, { type: "update_deck" }>["metadata"]
> {
  const patch: Record<string, unknown> = {};
  const mutableKeys = [
    "thumbnailSource",
    "generatedBy",
    "audience",
    "purpose",
    "tone",
    "presentationProfile",
    "designPackSnapshot",
    "designProgramSnapshot",
    "createdFrom",
  ] as const;
  for (const key of mutableKeys) {
    if (isDeepStrictEqual(currentDeck.metadata[key], nextDeck.metadata[key])) {
      continue;
    }
    patch[key] = nextDeck.metadata[key] ?? null;
  }
  return patch as NonNullable<
    Extract<DeckPatchOperation, { type: "update_deck" }>["metadata"]
  >;
}

function createOoxmlSemanticCueReplayOperations(
  nextDeck: Deck,
  slideIds: Set<string>,
): DeckPatchOperation[] {
  return nextDeck.slides.flatMap((slide) =>
    slideIds.has(slide.slideId)
      ? [
          {
            type: "replace_semantic_cues" as const,
            slideId: slide.slideId,
            semanticCues: slide.semanticCues,
          },
        ]
      : [],
  );
}

function createOoxmlElementDiff(
  currentDeck: Deck,
  nextDeck: Deck,
): DeckPatchOperation[] {
  const currentElements = indexDeckElements(currentDeck);
  const nextElements = indexDeckElements(nextDeck);
  const operations: DeckPatchOperation[] = [];

  for (const [elementKey, current] of currentElements) {
    const next = nextElements.get(elementKey);
    if (
      !next ||
      next.slideId !== current.slideId ||
      next.element.type !== current.element.type
    ) {
      operations.push({
        type: "delete_element",
        slideId: current.slideId,
        elementId: current.element.elementId,
      });
    }
  }

  for (const [elementKey, next] of nextElements) {
    const current = currentElements.get(elementKey);
    if (
      !current ||
      current.slideId !== next.slideId ||
      current.element.type !== next.element.type
    ) {
      operations.push({
        type: "add_element",
        slideId: next.slideId,
        element: next.element,
      });
      continue;
    }

    const frame = ooxmlElementFramePatch(current.element, next.element);
    if (Object.keys(frame).length > 0) {
      operations.push({
        type: "update_element_frame",
        slideId: next.slideId,
        elementId: next.element.elementId,
        frame,
      });
    }
    const props = ooxmlElementPropsPatch(current.element, next.element);
    if (Object.keys(props).length > 0) {
      operations.push({
        type: "update_element_props",
        slideId: next.slideId,
        elementId: next.element.elementId,
        props,
      });
    }
  }

  return operations;
}

function indexDeckElements(deck: Deck) {
  const elements = new Map<
    string,
    { slideId: Deck["slides"][number]["slideId"]; element: DeckElement }
  >();
  for (const slide of deck.slides) {
    for (const element of slide.elements) {
      elements.set(`${slide.slideId}\0${element.elementId}`, {
        slideId: slide.slideId,
        element,
      });
    }
  }
  return elements;
}

function ooxmlElementFramePatch(
  current: DeckElement,
  next: DeckElement,
): ElementFramePatch {
  const frame: ElementFramePatch = {};
  const currentGeometry = {
    x: current.x,
    y: current.y,
    width: current.width,
    height: current.height,
    rotation: current.rotation,
  };
  const nextGeometry = {
    x: next.x,
    y: next.y,
    width: next.width,
    height: next.height,
    rotation: next.rotation,
  };
  if (!isDeepStrictEqual(currentGeometry, nextGeometry)) {
    Object.assign(frame, nextGeometry);
  }
  if (current.role !== next.role) frame.role = next.role ?? null;
  if (current.opacity !== next.opacity) frame.opacity = next.opacity;
  if (current.zIndex !== next.zIndex) frame.zIndex = next.zIndex;
  if (current.locked !== next.locked) frame.locked = next.locked;
  if (current.visible !== next.visible) frame.visible = next.visible;
  return frame;
}

function ooxmlElementPropsPatch(
  current: DeckElement,
  next: DeckElement,
): Record<string, unknown> {
  const currentProps = current.props as Record<string, unknown>;
  const nextProps = next.props as Record<string, unknown>;
  const changed: Record<string, unknown> = {};
  const keys = new Set([
    ...Object.keys(currentProps),
    ...Object.keys(nextProps),
  ]);

  for (const key of keys) {
    if (isDeepStrictEqual(currentProps[key], nextProps[key])) continue;
    changed[key] = Object.prototype.hasOwnProperty.call(nextProps, key)
      ? nextProps[key]
      : null;
  }
  return changed;
}

const ooxmlPackageNeutralOperationTypes = new Set<string>([
  "update_deck",
  "update_slide",
  "update_speaker_notes",
  "replace_keywords",
  "replace_semantic_cues",
  "add_slide_action",
  "update_slide_action",
  "delete_slide_action",
]);

const ooxmlSupportedFrameFields = new Set([
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "zIndex",
]);

function assertOoxmlPatchOperationsAreSupported(
  currentDeck: Deck,
  nextDeck: Deck,
  operations: DeckPatchOperation[],
): void {
  for (const operation of operations) {
    const reasonCode = ooxmlUnsupportedOperationReason(
      currentDeck,
      nextDeck,
      operation,
    );
    if (!reasonCode) continue;

    const details = [
      `operationType=${operation.type}`,
      `reasonCode=${reasonCode}`,
    ];
    if ("slideId" in operation) details.push(`slideId=${operation.slideId}`);
    if ("elementId" in operation) {
      details.push(`elementId=${operation.elementId}`);
    } else if (operation.type === "add_element") {
      details.push(`elementId=${operation.element.elementId}`);
    }
    throwDeckApiException(
      "OOXML_CHANGE_UNSUPPORTED",
      HttpStatus.BAD_REQUEST,
      "Imported Deck change is not supported by the current OOXML serializer",
      details,
    );
  }
}

function ooxmlUnsupportedOperationReason(
  currentDeck: Deck,
  nextDeck: Deck,
  operation: DeckPatchOperation,
): string | null {
  if (ooxmlPackageNeutralOperationTypes.has(operation.type)) return null;

  if (operation.type === "add_element") {
    const targetSlide =
      currentDeck.slides.find((slide) => slide.slideId === operation.slideId) ??
      nextDeck.slides.find((slide) => slide.slideId === operation.slideId);
    if (targetSlide?.ooxmlOrigin !== "imported") {
      return "SLIDE_PROVENANCE_UNSAFE";
    }
    if (
      operation.element.ooxmlOrigin !== "authored" ||
      !authoredOoxmlSerializerSupportsElement(operation.element)
    ) {
      return "ADD_ELEMENT_SERIALIZER_UNSUPPORTED";
    }
    return null;
  }

  if (
    operation.type === "update_element_frame" ||
    operation.type === "update_element_props" ||
    operation.type === "delete_element"
  ) {
    const element =
      findOoxmlElement(currentDeck, operation.slideId, operation.elementId) ??
      findOoxmlElement(nextDeck, operation.slideId, operation.elementId);
    if (!element?.ooxmlOrigin) return "ELEMENT_PROVENANCE_MISSING";
    if (element.ooxmlOrigin === "imported" && !element.ooxmlEditCapabilities) {
      return "ELEMENT_CAPABILITY_MISSING";
    }

    if (operation.type === "update_element_frame") {
      const fields = Object.keys(operation.frame);
      if (
        fields.length === 0 ||
        fields.some((field) => !ooxmlSupportedFrameFields.has(field))
      ) {
        return "FRAME_FIELDS_UNSUPPORTED";
      }
      const hasGeometry = fields.some((field) => field !== "zIndex");
      if (
        hasGeometry &&
        !["x", "y", "width", "height"].every((field) =>
          Object.prototype.hasOwnProperty.call(operation.frame, field),
        )
      ) {
        return "FRAME_FIELDS_UNSUPPORTED";
      }
      if (element.ooxmlOrigin === "imported") {
        return element.ooxmlEditCapabilities?.frame === true
          ? null
          : "FRAME_CAPABILITY_UNSAFE";
      }
      return authoredOoxmlSerializerSupportsElement(element)
        ? null
        : "AUTHORED_ELEMENT_SERIALIZER_UNSUPPORTED";
    }

    if (operation.type === "delete_element") {
      if (element.ooxmlOrigin === "imported") {
        return element.ooxmlEditCapabilities?.delete === true
          ? null
          : "DELETE_CAPABILITY_UNSAFE";
      }
      return authoredOoxmlSerializerSupportsElement(element)
        ? null
        : "AUTHORED_ELEMENT_SERIALIZER_UNSUPPORTED";
    }

    return ooxmlElementPropsUnsupportedReason(element, operation.props);
  }

  return "OPERATION_TYPE_UNSUPPORTED";
}

function ooxmlElementPropsUnsupportedReason(
  element: DeckElement,
  props: Record<string, unknown>,
): string | null {
  const fields = Object.keys(props);
  if (fields.length === 0) return "PROPS_FIELDS_UNSUPPORTED";
  const capabilities = element.ooxmlEditCapabilities;

  if (element.type === "text") {
    if (element.ooxmlOrigin === "imported") {
      if (fields.includes("text") && capabilities?.richText !== "full") {
        return "RICH_TEXT_CAPABILITY_UNSAFE";
      }
      if (!fields.includes("text") && capabilities?.richText === "none") {
        return "RICH_TEXT_CAPABILITY_UNSAFE";
      }
    } else if (!authoredOoxmlSerializerSupportsElement(element)) {
      return "AUTHORED_ELEMENT_SERIALIZER_UNSUPPORTED";
    }
    return fields.length === 1 && fields[0] === "text"
      ? null
      : "PROPS_FIELDS_UNSUPPORTED";
  }

  if (element.type === "image") {
    if (
      fields.includes("crop") &&
      element.ooxmlOrigin === "imported" &&
      capabilities?.crop === "none"
    ) {
      return "CROP_CAPABILITY_UNSAFE";
    }
    if (fields.every((field) => field === "src" || field === "alt")) {
      if (
        element.ooxmlOrigin === "imported" &&
        capabilities?.imageSource !== true
      ) {
        return "IMAGE_SOURCE_CAPABILITY_UNSAFE";
      }
      return element.ooxmlOrigin === "authored" &&
        !authoredOoxmlSerializerSupportsElement(element)
        ? "AUTHORED_ELEMENT_SERIALIZER_UNSUPPORTED"
        : null;
    }
    return "PROPS_FIELDS_UNSUPPORTED";
  }

  if (element.type === "table" && element.ooxmlOrigin === "imported") {
    if (!capabilities?.tableCellText) return "TABLE_CELL_CAPABILITY_UNSAFE";
  }
  return "PROPS_FIELDS_UNSUPPORTED";
}

function findOoxmlElement(
  deck: Deck,
  slideId: string,
  elementId: string,
): DeckElement | undefined {
  return deck.slides
    .find((slide) => slide.slideId === slideId)
    ?.elements.find((element) => element.elementId === elementId);
}

function authoredOoxmlSerializerSupportsElement(element: DeckElement): boolean {
  if (element.opacity !== 1 || element.locked || !element.visible) return false;

  if (element.type === "text") {
    const supportedProps = new Set([
      "text",
      "bodyInset",
      "fontFamily",
      "fontSize",
      "fontWeight",
      "italic",
      "underline",
      "color",
      "align",
      "verticalAlign",
      "lineHeight",
    ]);
    return (
      Object.keys(element.props).every((key) => supportedProps.has(key)) &&
      (element.props.fontWeight === "normal" ||
        element.props.fontWeight === "bold")
    );
  }

  if (element.type === "image") {
    return (
      element.props.crop === undefined &&
      element.props.fit === "contain" &&
      element.props.focusX === 0.5 &&
      element.props.focusY === 0.5
    );
  }

  if (element.type !== "rect") return false;
  return (
    Object.keys(element.props).every((key) =>
      ["fill", "stroke", "strokeWidth", "borderRadius"].includes(key),
    ) &&
    typeof element.props.fill === "string" &&
    (element.props.fill === "transparent" ||
      /^#[0-9a-f]{6}$/i.test(element.props.fill)) &&
    element.props.stroke === "transparent" &&
    element.props.strokeWidth === 0 &&
    element.props.borderRadius === 0
  );
}

function parseAppendDeckPatchRequest(body: unknown): AppendDeckPatchRequest {
  const result = appendDeckPatchRequestSchema.safeParse(body);

  if (!result.success) {
    throwDeckApiException(
      "PATCH_VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      "Deck patch payload is invalid",
      formatZodError(result.error),
    );
  }

  return result.data;
}

function parseDeckRow(row: DeckRow | undefined): Deck {
  if (!row) {
    throwDeckApiException(
      "DECK_NOT_FOUND",
      HttpStatus.NOT_FOUND,
      "Deck row was not returned",
    );
  }

  return parseDeckJson(normalizeStoredDeckRowIdentity(row));
}

function parseDeckJson(deckJson: unknown): Deck {
  const result = deckSchema.safeParse(deckJson);

  if (result.success) {
    return result.data;
  }

  return deckSchema.parse(normalizeLegacyDeckKeywords(deckJson));
}

function replayPatchRows(
  checkpointDeck: Deck,
  patchRows: DeckPatchRow[],
): Deck {
  let workingDeck = checkpointDeck;
  let expectedBeforeVersion = checkpointDeck.version;

  for (const patchRow of patchRows) {
    if (
      patchRow.project_id !== checkpointDeck.projectId ||
      patchRow.deck_id !== checkpointDeck.deckId
    ) {
      throwDeckApiException(
        "PATCH_CHAIN_INVALID",
        HttpStatus.CONFLICT,
        "Stored patch history does not belong to the checkpoint deck",
        [
          `deck.projectId=${checkpointDeck.projectId}`,
          `patch.projectId=${patchRow.project_id}`,
          `deck.deckId=${checkpointDeck.deckId}`,
          `patch.deckId=${patchRow.deck_id}`,
          `patch.changeId=${patchRow.change_id}`,
        ],
      );
    }

    if (patchRow.before_version !== expectedBeforeVersion) {
      throwDeckApiException(
        expectedBeforeVersion === checkpointDeck.version
          ? "PATCH_CHAIN_CHECKPOINT_MISMATCH"
          : "PATCH_CHAIN_INVALID",
        HttpStatus.CONFLICT,
        expectedBeforeVersion === checkpointDeck.version
          ? "Stored patch chain does not start from the checkpoint version"
          : "Stored patch chain has a version gap or duplicate transition",
        [
          `checkpoint.version=${checkpointDeck.version}`,
          `expected.beforeVersion=${expectedBeforeVersion}`,
          `patch.beforeVersion=${patchRow.before_version}`,
          `patch.changeId=${patchRow.change_id}`,
        ],
      );
    }

    if (patchRow.after_version !== patchRow.before_version + 1) {
      throwDeckApiException(
        "PATCH_CHAIN_INVALID",
        HttpStatus.CONFLICT,
        "Stored patch history has a non-sequential version transition",
        [
          `patch.beforeVersion=${patchRow.before_version}`,
          `patch.afterVersion=${patchRow.after_version}`,
          `patch.changeId=${patchRow.change_id}`,
        ],
      );
    }

    const patch = appendDeckPatchRequestSchema.shape.patch.parse({
      deckId: patchRow.deck_id,
      baseVersion: patchRow.before_version,
      source: patchRow.source,
      operations: patchRow.operations,
    });
    const result = applyDeckPatch(workingDeck, patch, {
      createdAt: toIso(patchRow.created_at),
    });

    if (!result.ok) {
      throwApplyPatchException(result.error);
    }

    if (result.deck.version !== patchRow.after_version) {
      throwDeckApiException(
        "PATCH_CHAIN_INVALID",
        HttpStatus.CONFLICT,
        "Stored patch history has an unexpected version transition",
        [
          `deck.version=${result.deck.version}`,
          `patch.afterVersion=${patchRow.after_version}`,
          `patch.changeId=${patchRow.change_id}`,
        ],
      );
    }

    workingDeck = result.deck;
    expectedBeforeVersion = patchRow.after_version;
  }

  return workingDeck;
}

function normalizeStoredDeckRowIdentity(row: DeckRow): unknown {
  if (!isRecord(row.deck_json)) {
    return row.deck_json;
  }

  return {
    ...row.deck_json,
    projectId: row.project_id,
    deckId: row.deck_id,
  };
}

function normalizeLegacyDeckKeywords(deckJson: unknown): unknown {
  if (!isRecord(deckJson) || !Array.isArray(deckJson.slides)) {
    return deckJson;
  }

  return {
    ...deckJson,
    slides: deckJson.slides.map((slide) => {
      if (!isRecord(slide) || !Array.isArray(slide.keywords)) {
        return slide;
      }

      return {
        ...slide,
        keywords: normalizeLegacySlideKeywords(slide.keywords),
      };
    }),
  };
}

function normalizeLegacySlideKeywords(keywords: unknown[]): unknown[] {
  const normalizedKeywords: unknown[] = [];
  const keywordByTerm = new Map<string, Record<string, unknown>>();

  for (const [index, keyword] of keywords.entries()) {
    if (!isRecord(keyword)) {
      normalizedKeywords.push(keyword);
      continue;
    }

    const text = normalizeLegacyKeywordTerm(keyword.text);

    if (!text) {
      if (typeof keyword.text !== "string") {
        normalizedKeywords.push(keyword);
      }
      continue;
    }

    const textKey = normalizeLegacyKeywordTermKey(text);
    const existingKeyword = keywordByTerm.get(textKey);

    if (existingKeyword) {
      existingKeyword.synonyms = appendLegacyKeywordTerms(
        existingKeyword.synonyms,
        keyword.synonyms,
        keywordByTerm,
        existingKeyword,
      );
      existingKeyword.abbreviations = appendLegacyKeywordTerms(
        existingKeyword.abbreviations,
        keyword.abbreviations,
        keywordByTerm,
        existingKeyword,
      );
      continue;
    }

    const normalizedKeyword: Record<string, unknown> = {
      ...keyword,
      keywordId: normalizeLegacyKeywordId(keyword.keywordId, index),
      text,
      synonyms: [],
      abbreviations: [],
    };

    keywordByTerm.set(textKey, normalizedKeyword);
    normalizedKeyword.synonyms = appendLegacyKeywordTerms(
      normalizedKeyword.synonyms,
      keyword.synonyms,
      keywordByTerm,
      normalizedKeyword,
    );
    normalizedKeyword.abbreviations = appendLegacyKeywordTerms(
      normalizedKeyword.abbreviations,
      keyword.abbreviations,
      keywordByTerm,
      normalizedKeyword,
    );
    normalizedKeywords.push(normalizedKeyword);
  }

  return normalizedKeywords;
}

function normalizeLegacyKeywordId(value: unknown, index: number): string {
  if (typeof value === "string" && /^kw_[A-Za-z0-9_-]+$/.test(value)) {
    return value;
  }

  const normalizedValue =
    typeof value === "string" || typeof value === "number"
      ? String(value)
          .trim()
          .replace(/[^A-Za-z0-9_-]/g, "_")
      : "";

  return `kw_legacy_${normalizedValue || index + 1}`;
}

function appendLegacyKeywordTerms(
  current: unknown,
  incoming: unknown,
  keywordByTerm: Map<string, Record<string, unknown>>,
  ownerKeyword: Record<string, unknown>,
): unknown {
  if (incoming === undefined) {
    return current;
  }

  if (!Array.isArray(incoming)) {
    return incoming;
  }

  const terms = Array.isArray(current) ? [...current] : [];

  for (const term of incoming) {
    const normalizedTerm = normalizeLegacyKeywordTerm(term);

    if (!normalizedTerm) {
      if (typeof term !== "string") {
        terms.push(term);
      }
      continue;
    }

    const termKey = normalizeLegacyKeywordTermKey(normalizedTerm);

    if (keywordByTerm.has(termKey)) {
      continue;
    }

    keywordByTerm.set(termKey, ownerKeyword);
    terms.push(normalizedTerm);
  }

  return terms;
}

function normalizeLegacyKeywordTerm(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const term = value.trim();
  return term.length > 0 ? term : undefined;
}

function normalizeLegacyKeywordTermKey(value: string): string {
  return value.toLocaleLowerCase("ko-KR");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSnapshotRow(row: DeckSnapshotRow): DeckSnapshot {
  return deckSnapshotSchema.parse({
    snapshotId: row.snapshot_id,
    projectId: row.project_id,
    deckId: row.deck_id,
    version: row.version,
    reason: row.reason,
    createdAt: toIso(row.created_at),
  });
}

function throwApplyPatchException(error: ApplyDeckPatchError): never {
  if (error.code === "BASE_VERSION_MISMATCH") {
    throwDeckApiException(
      "STALE_BASE_VERSION",
      HttpStatus.CONFLICT,
      error.message,
      error.details ?? [],
    );
  }

  if (error.code === "PATCH_VALIDATION_FAILED") {
    throwDeckApiException(
      "PATCH_VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      error.message,
      error.details ?? [],
    );
  }

  if (error.code === "DECK_VALIDATION_FAILED") {
    throwDeckApiException(
      "DECK_VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      error.message,
      error.details ?? [],
    );
  }

  throwDeckApiException(
    "PATCH_APPLY_FAILED",
    HttpStatus.BAD_REQUEST,
    error.message,
    error.details ?? [],
  );
}

function throwDeckApiException(
  code: DeckApiErrorCode,
  status: HttpStatus,
  message: string,
  details: string[] = [],
): never {
  const error = deckApiErrorSchema.parse({
    code,
    message,
    details,
  } satisfies DeckApiError);

  throw new HttpException(error, status);
}

function formatZodError(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue.message}`;
  });
}

function toIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function nowIso(): string {
  return new Date().toISOString();
}
