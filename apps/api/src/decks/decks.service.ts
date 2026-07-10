import { randomUUID } from "node:crypto";
import { applyDeckPatch } from "@orbit/editor-core";
import type { ApplyDeckPatchError } from "@orbit/editor-core";
import { loadOrbitConfig } from "@orbit/config";
import {
  enqueueDeckExportJob,
  enqueuePptxOoxmlSyncJob,
  type EnqueueDeckExportJobInput,
  type EnqueuePptxOoxmlSyncJobInput,
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
  DeckPatchOperation,
  DeckSnapshot,
  DeckSnapshotReason,
  GetDeckResponse,
  ListDeckSnapshotsResponse,
  PutDeckRequest,
  PutDeckResponse,
  RestoreDeckSnapshotResponse,
} from "@orbit/shared";
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { ZodError } from "zod";
import { JobsService } from "../jobs/jobs.service";

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
            error instanceof Error ? error.message : "Deck export enqueue failed.",
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

    return this.dataSource.transaction(async (manager) => {
      const updatedAt = nowIso();
      const deckRow = await this.findProjectDeckRowForUpdate(manager, projectId);

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

        const currentDeck = (
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
      }

      const deck = await this.upsertDeck(manager, request.deck, updatedAt);
      await this.deletePatchRowsAfterVersion(
        manager,
        projectId,
        deck.deckId,
        deck.version,
      );
      await this.deletePatchRowsUpToVersion(
        manager,
        projectId,
        deck.deckId,
        deck.version,
      );
      const snapshot = await this.createSnapshot(
        manager,
        deck,
        request.snapshotReason ?? "deck-replaced",
        updatedAt,
      );

      return putDeckResponseSchema.parse({
        deck,
        snapshot,
        updatedAt,
      });
    });
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
      const applyResult = applyDeckPatch(currentDeck, request.patch, {
        createdAt: updatedAt,
      });

      if (!applyResult.ok) {
        throwApplyPatchException(applyResult.error);
      }

      await this.insertPatchLog(manager, projectId, applyResult.changeRecord);
      const shouldCheckpoint =
        Boolean(request.snapshotReason) ||
        applyResult.deck.version - checkpointVersion >=
          deckCheckpointPatchInterval;
      const deck = shouldCheckpoint
        ? await this.writeDeckCheckpoint(manager, applyResult.deck, updatedAt)
        : applyResult.deck;

      const snapshot = request.snapshotReason
        ? await this.createSnapshot(
            manager,
            deck,
            request.snapshotReason,
            updatedAt,
          )
        : null;
      const templateBlueprint = await this.findOoxmlTemplateBlueprint(
        manager,
        projectId,
        deck.deckId,
      );

      if (
        templateBlueprint &&
        hasOoxmlSyncableOperation(applyResult.changeRecord.operations)
      ) {
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
    return this.dataSource.transaction(async (manager) => {
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
      const deck = parseDeckJson(snapshotRow.deck_json);
      await this.findDeckRowForUpdate(manager, projectId, deck.deckId);
      const updatedAt = nowIso();
      await this.deletePatchRowsAfterVersion(
        manager,
        projectId,
        deck.deckId,
        deck.version,
      );
      await this.writeDeckCheckpoint(manager, deck, updatedAt);

      return restoreDeckSnapshotResponseSchema.parse({
        deck,
        restoredSnapshot,
        updatedAt,
      });
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
        deck: checkpointDeck,
        updatedAt: checkpointUpdatedAt,
      };
    }

    const deck = replayPatchRows(checkpointDeck, patchRows);
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
  ): Promise<Deck> {
    const checkpointDeck = await this.upsertDeck(executor, deck, updatedAt);
    await this.deletePatchRowsUpToVersion(
      executor,
      checkpointDeck.projectId,
      checkpointDeck.deckId,
      checkpointDeck.version,
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
  ): Promise<TemplateBlueprintRow | undefined> {
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

    if (!row || !isRecord(row.blueprint_json)) {
      return undefined;
    }

    return typeof row.blueprint_json.currentPackageFileId === "string" ||
      typeof row.blueprint_json.sourcePackageFileId === "string"
      ? row
      : undefined;
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
      return queuedJob;
    } catch (error) {
      return (
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
        })) ?? queuedJob
      );
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

function hasOoxmlSyncableOperation(
  operations: DeckPatchOperation[],
): boolean {
  return operations.some((operation) =>
    [
      "add_element",
      "update_element_frame",
      "update_element_props",
      "delete_element",
    ].includes(operation.type),
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
