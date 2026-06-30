import { randomUUID } from "node:crypto";
import { applyDeckPatch } from "@orbit/editor-core";
import type { ApplyDeckPatchError } from "@orbit/editor-core";
import {
  appendDeckPatchRequestSchema,
  appendDeckPatchResponseSchema,
  deckApiErrorSchema,
  deckSchema,
  deckSnapshotIdSchema,
  deckSnapshotReasonSchema,
  deckSnapshotSchema,
  getDeckResponseSchema,
  listDeckSnapshotsResponseSchema,
  putDeckRequestSchema,
  putDeckResponseSchema,
  restoreDeckSnapshotResponseSchema
} from "@orbit/shared";
import type {
  AppendDeckPatchRequest,
  AppendDeckPatchResponse,
  Deck,
  DeckApiError,
  DeckApiErrorCode,
  DeckChangeRecord,
  DeckSnapshot,
  DeckSnapshotReason,
  GetDeckResponse,
  ListDeckSnapshotsResponse,
  PutDeckRequest,
  PutDeckResponse,
  RestoreDeckSnapshotResponse
} from "@orbit/shared";
import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { ZodError } from "zod";

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

type QueryExecutor = DataSource | EntityManager;

@Injectable()
export class DecksService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getDeck(projectId: string): Promise<GetDeckResponse> {
    const deckRow = await this.findDeckRow(this.dataSource, projectId);

    if (!deckRow) {
      throwDeckApiException(
        "DECK_NOT_FOUND",
        HttpStatus.NOT_FOUND,
        `Deck not found for project: ${projectId}`
      );
    }

    return getDeckResponseSchema.parse({
      projectId,
      deck: parseDeckRow(deckRow),
      updatedAt: toIso(deckRow.updated_at)
    });
  }

  async putDeck(projectId: string, body: unknown): Promise<PutDeckResponse> {
    const request = parsePutDeckRequest(body);

    if (request.deck.projectId !== projectId) {
      throwDeckApiException(
        "PROJECT_MISMATCH",
        HttpStatus.BAD_REQUEST,
        "URL projectId must match deck.projectId",
        [`projectId=${projectId}`, `deck.projectId=${request.deck.projectId}`]
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const updatedAt = nowIso();
      const deck = await this.upsertDeck(manager, request.deck, updatedAt);
      const snapshot = await this.createSnapshot(
        manager,
        deck,
        request.snapshotReason ?? "deck-replaced",
        updatedAt
      );

      return putDeckResponseSchema.parse({
        deck,
        snapshot,
        updatedAt
      });
    });
  }

  async appendPatch(
    projectId: string,
    body: unknown
  ): Promise<AppendDeckPatchResponse> {
    const request = parseAppendDeckPatchRequest(body);

    return this.dataSource.transaction(async (manager) => {
      const deckRow = await this.findDeckRowForUpdate(
        manager,
        projectId,
        request.patch.deckId
      );

      if (!deckRow) {
        throwDeckApiException(
          "DECK_NOT_FOUND",
          HttpStatus.NOT_FOUND,
          `Deck not found for project: ${projectId}`
        );
      }

      const currentDeck = parseDeckRow(deckRow);

      if (currentDeck.projectId !== projectId) {
        throwDeckApiException(
          "PROJECT_MISMATCH",
          HttpStatus.BAD_REQUEST,
          "Stored deck projectId must match URL projectId",
          [
            `projectId=${projectId}`,
            `deck.projectId=${currentDeck.projectId}`
          ]
        );
      }

      const updatedAt = nowIso();
      const applyResult = applyDeckPatch(currentDeck, request.patch, {
        createdAt: updatedAt
      });

      if (!applyResult.ok) {
        throwApplyPatchException(applyResult.error);
      }

      const deck = await this.upsertDeck(manager, applyResult.deck, updatedAt);
      await this.insertPatchLog(manager, projectId, applyResult.changeRecord);

      const snapshot = await this.createSnapshot(
        manager,
        deck,
        request.snapshotReason ?? "patch-applied",
        updatedAt
      );

      return appendDeckPatchResponseSchema.parse({
        deck,
        changeRecord: applyResult.changeRecord,
        snapshot,
        updatedAt
      });
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
      [projectId]
    );

    return listDeckSnapshotsResponseSchema.parse({
      projectId,
      snapshots: rows.map(parseSnapshotRow)
    });
  }

  async restoreSnapshot(
    projectId: string,
    snapshotId: string
  ): Promise<RestoreDeckSnapshotResponse> {
    return this.dataSource.transaction(async (manager) => {
      const snapshotRow = await this.findSnapshotRow(manager, snapshotId);

      if (!snapshotRow) {
        throwDeckApiException(
          "SNAPSHOT_NOT_FOUND",
          HttpStatus.NOT_FOUND,
          `Snapshot not found: ${snapshotId}`
        );
      }

      if (snapshotRow.project_id !== projectId) {
        throwDeckApiException(
          "SNAPSHOT_PROJECT_MISMATCH",
          HttpStatus.BAD_REQUEST,
          "Snapshot does not belong to the requested project",
          [
            `projectId=${projectId}`,
            `snapshot.projectId=${snapshotRow.project_id}`
          ]
        );
      }

      const restoredSnapshot = parseSnapshotRow(snapshotRow);
      const deck = parseDeckJson(snapshotRow.deck_json);
      const updatedAt = nowIso();
      await this.upsertDeck(manager, deck, updatedAt);

      return restoreDeckSnapshotResponseSchema.parse({
        deck,
        restoredSnapshot,
        updatedAt
      });
    });
  }

  private async findDeckRow(
    executor: QueryExecutor,
    projectId: string
  ): Promise<DeckRow | undefined> {
    const rows = await executor.query<DeckRow[]>(
      `
        SELECT project_id, deck_id, deck_json, version, updated_at
        FROM decks
        WHERE project_id = $1
      `,
      [projectId]
    );

    return rows[0];
  }

  private async findDeckRowForUpdate(
    manager: EntityManager,
    projectId: string,
    deckId: string
  ): Promise<DeckRow | undefined> {
    const rows = await manager.query<DeckRow[]>(
      `
        SELECT project_id, deck_id, deck_json, version, updated_at
        FROM decks
        WHERE project_id = $1 AND deck_id = $2
        FOR UPDATE
      `,
      [projectId, deckId]
    );

    return rows[0];
  }

  private async upsertDeck(
    executor: QueryExecutor,
    deck: Deck,
    updatedAt: string
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
      [deck.projectId, deck.deckId, deck, deck.version, updatedAt]
    );

    return parseDeckRow(rows[0]);
  }

  private async insertPatchLog(
    manager: EntityManager,
    projectId: string,
    changeRecord: DeckChangeRecord
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
        changeRecord.createdAt
      ]
    );
  }

  private async createSnapshot(
    executor: QueryExecutor,
    deck: Deck,
    reason: DeckSnapshotReason,
    createdAt: string
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
        createdAt
      ]
    );

    return parseSnapshotRow(rows[0]);
  }

  private async findSnapshotRow(
    manager: EntityManager,
    snapshotId: string
  ): Promise<DeckSnapshotRow | undefined> {
    const rows = await manager.query<DeckSnapshotRow[]>(
      `
        SELECT snapshot_id, project_id, deck_id, deck_json, version, reason, created_at
        FROM deck_snapshots
        WHERE snapshot_id = $1
        FOR UPDATE
      `,
      [snapshotId]
    );

    return rows[0];
  }
}

function parsePutDeckRequest(body: unknown): PutDeckRequest {
  const result = putDeckRequestSchema.safeParse(body);

  if (!result.success) {
    throwDeckApiException(
      "DECK_VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      "Deck payload is invalid",
      formatZodError(result.error)
    );
  }

  return result.data;
}

function parseAppendDeckPatchRequest(body: unknown): AppendDeckPatchRequest {
  const result = appendDeckPatchRequestSchema.safeParse(body);

  if (!result.success) {
    throwDeckApiException(
      "PATCH_VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      "Deck patch payload is invalid",
      formatZodError(result.error)
    );
  }

  return result.data;
}

function parseDeckRow(row: DeckRow | undefined): Deck {
  if (!row) {
    throwDeckApiException(
      "DECK_NOT_FOUND",
      HttpStatus.NOT_FOUND,
      "Deck row was not returned"
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

function normalizeStoredDeckRowIdentity(row: DeckRow): unknown {
  if (!isRecord(row.deck_json)) {
    return row.deck_json;
  }

  return {
    ...row.deck_json,
    projectId: row.project_id,
    deckId: row.deck_id
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
        keywords: normalizeLegacySlideKeywords(slide.keywords)
      };
    })
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
        existingKeyword
      );
      existingKeyword.abbreviations = appendLegacyKeywordTerms(
        existingKeyword.abbreviations,
        keyword.abbreviations,
        keywordByTerm,
        existingKeyword
      );
      continue;
    }

    const normalizedKeyword: Record<string, unknown> = {
      ...keyword,
      keywordId: normalizeLegacyKeywordId(keyword.keywordId, index),
      text,
      synonyms: [],
      abbreviations: []
    };

    keywordByTerm.set(textKey, normalizedKeyword);
    normalizedKeyword.synonyms = appendLegacyKeywordTerms(
      normalizedKeyword.synonyms,
      keyword.synonyms,
      keywordByTerm,
      normalizedKeyword
    );
    normalizedKeyword.abbreviations = appendLegacyKeywordTerms(
      normalizedKeyword.abbreviations,
      keyword.abbreviations,
      keywordByTerm,
      normalizedKeyword
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
      ? String(value).trim().replace(/[^A-Za-z0-9_-]/g, "_")
      : "";

  return `kw_legacy_${normalizedValue || index + 1}`;
}

function appendLegacyKeywordTerms(
  current: unknown,
  incoming: unknown,
  keywordByTerm: Map<string, Record<string, unknown>>,
  ownerKeyword: Record<string, unknown>
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
    createdAt: toIso(row.created_at)
  });
}

function throwApplyPatchException(error: ApplyDeckPatchError): never {
  if (error.code === "BASE_VERSION_MISMATCH") {
    throwDeckApiException(
      "STALE_BASE_VERSION",
      HttpStatus.CONFLICT,
      error.message,
      error.details ?? []
    );
  }

  if (error.code === "PATCH_VALIDATION_FAILED") {
    throwDeckApiException(
      "PATCH_VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      error.message,
      error.details ?? []
    );
  }

  if (error.code === "DECK_VALIDATION_FAILED") {
    throwDeckApiException(
      "DECK_VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      error.message,
      error.details ?? []
    );
  }

  throwDeckApiException(
    "PATCH_APPLY_FAILED",
    HttpStatus.BAD_REQUEST,
    error.message,
    error.details ?? []
  );
}

function throwDeckApiException(
  code: DeckApiErrorCode,
  status: HttpStatus,
  message: string,
  details: string[] = []
): never {
  const error = deckApiErrorSchema.parse({
    code,
    message,
    details
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
