import { HttpException, HttpStatus } from "@nestjs/common";
import {
  deckApiErrorSchema,
  deckSchema,
  createKeywordOccurrenceId,
  jobSchema,
  type Deck,
  type DeckApiError,
  type DeckPatch,
  type DeckSnapshotReason,
} from "@orbit/shared";
import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DecksService } from "./decks.service";

type StoredDeckRow = {
  project_id: string;
  deck_id: string;
  deck_json: unknown;
  version: number;
  updated_at: string;
};

type StoredPatchRow = {
  change_id: string;
  project_id: string;
  deck_id: string;
  before_version: number;
  after_version: number;
  source: string;
  actor_user_id: string | null;
  operations: DeckPatch["operations"];
  created_at: string;
};

type StoredSnapshotRow = {
  snapshot_id: string;
  project_id: string;
  deck_id: string;
  deck_json: unknown;
  version: number;
  reason: DeckSnapshotReason;
  created_at: string;
};

type StoredTemplateBlueprintRow = {
  template_id: string;
  project_id: string;
  deck_id: string;
  blueprint_json: unknown;
};

class InMemoryDeckDataSource {
  readonly decks = new Map<string, StoredDeckRow>();
  readonly patchRows: StoredPatchRow[] = [];
  readonly snapshotRows: StoredSnapshotRow[] = [];
  readonly templateBlueprintRows: StoredTemplateBlueprintRow[] = [];
  readonly executedQueries: string[] = [];

  async transaction<T>(
    run: (manager: InMemoryDeckDataSource) => Promise<T>,
  ): Promise<T> {
    return run(this);
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
    const query = normalizeSql(sql);
    this.executedQueries.push(query);

    if (
      query.startsWith("SELECT project_id, deck_id, deck_json, version") &&
      query.includes("WHERE project_id = $1 AND deck_id = $2")
    ) {
      const [projectId, deckId] = params as [string, string];
      const row = this.decks.get(projectId);
      return (row && row.deck_id === deckId ? [cloneDeckRow(row)] : []) as T;
    }

    if (
      query.startsWith("SELECT project_id, deck_id, deck_json, version") &&
      query.includes("WHERE project_id = $1")
    ) {
      const [projectId] = params as [string];
      const row = this.decks.get(projectId);
      return (row ? [cloneDeckRow(row)] : []) as T;
    }

    if (
      query.startsWith("SELECT change_id, project_id, deck_id") &&
      query.includes(
        "WHERE project_id = $1 AND deck_id = $2 AND after_version > $3",
      )
    ) {
      const [projectId, deckId, version] = params as [string, string, number];
      return this.patchRows
        .filter(
          (row) =>
            row.project_id === projectId &&
            row.deck_id === deckId &&
            row.after_version > version,
        )
        .sort((left, right) =>
          left.after_version !== right.after_version
            ? left.after_version - right.after_version
            : left.created_at.localeCompare(right.created_at),
        )
        .map(clonePatchRow) as T;
    }

    if (query.startsWith("INSERT INTO decks")) {
      const [projectId, deckId, deck, version, updatedAt] = params as [
        string,
        string,
        Deck,
        number,
        string,
      ];
      const row: StoredDeckRow = {
        project_id: projectId,
        deck_id: deckId,
        deck_json: cloneJson(deck),
        version,
        updated_at: updatedAt,
      };

      this.decks.set(projectId, row);
      return [cloneDeckRow(row)] as T;
    }

    if (query.startsWith("INSERT INTO deck_patches")) {
      const [
        changeId,
        projectId,
        deckId,
        beforeVersion,
        afterVersion,
        source,
        actorUserId,
        operations,
        createdAt,
      ] = params as [
        string,
        string,
        string,
        number,
        number,
        string,
        string | null,
        DeckPatch["operations"] | string,
        string,
      ];
      const normalizedOperations =
        typeof operations === "string"
          ? (JSON.parse(operations) as DeckPatch["operations"])
          : operations;

      this.patchRows.push({
        change_id: changeId,
        project_id: projectId,
        deck_id: deckId,
        before_version: beforeVersion,
        after_version: afterVersion,
        source,
        actor_user_id: actorUserId,
        operations: cloneJson(normalizedOperations),
        created_at: createdAt,
      });
      return [] as T;
    }

    if (query.startsWith("INSERT INTO deck_snapshots")) {
      const [snapshotId, projectId, deckId, deck, version, reason, createdAt] =
        params as [
          string,
          string,
          string,
          Deck,
          number,
          DeckSnapshotReason,
          string,
        ];
      const row: StoredSnapshotRow = {
        snapshot_id: snapshotId,
        project_id: projectId,
        deck_id: deckId,
        deck_json: cloneJson(deck),
        version,
        reason,
        created_at: createdAt,
      };

      this.snapshotRows.push(row);
      return [cloneSnapshotRow(row)] as T;
    }

    if (
      query.startsWith("DELETE FROM deck_patches") &&
      query.includes(
        "WHERE project_id = $1 AND deck_id = $2 AND after_version > $3",
      )
    ) {
      const [projectId, deckId, version] = params as [string, string, number];
      for (let index = this.patchRows.length - 1; index >= 0; index -= 1) {
        const row = this.patchRows[index];
        if (
          row?.project_id === projectId &&
          row.deck_id === deckId &&
          row.after_version > version
        ) {
          this.patchRows.splice(index, 1);
        }
      }
      return [] as T;
    }

    if (
      query.startsWith("DELETE FROM deck_patches") &&
      query.includes(
        "WHERE project_id = $1 AND deck_id = $2 AND after_version <= $3",
      )
    ) {
      const [projectId, deckId, version] = params as [string, string, number];
      for (let index = this.patchRows.length - 1; index >= 0; index -= 1) {
        const row = this.patchRows[index];
        if (
          row?.project_id === projectId &&
          row.deck_id === deckId &&
          row.after_version <= version
        ) {
          this.patchRows.splice(index, 1);
        }
      }
      return [] as T;
    }

    if (
      query.startsWith("SELECT snapshot_id, project_id, deck_id") &&
      query.includes("WHERE project_id = $1")
    ) {
      const [projectId] = params as [string];
      const rows = this.snapshotRows
        .filter((row) => row.project_id === projectId)
        .sort(compareSnapshotRows)
        .map(cloneSnapshotRow);
      return rows as T;
    }

    if (
      query.startsWith("SELECT template_id, blueprint_json") &&
      query.includes("FROM template_blueprints")
    ) {
      const [projectId, deckId] = params as [string, string];
      return this.templateBlueprintRows
        .filter((row) => row.project_id === projectId && row.deck_id === deckId)
        .map((row) => ({
          template_id: row.template_id,
          blueprint_json: cloneJson(row.blueprint_json),
        })) as T;
    }

    if (
      query.startsWith("SELECT snapshot_id, project_id, deck_id") &&
      query.includes("WHERE snapshot_id = $1")
    ) {
      const [snapshotId] = params as [string];
      const row = this.snapshotRows.find(
        (snapshot) => snapshot.snapshot_id === snapshotId,
      );
      return (row ? [cloneSnapshotRow(row)] : []) as T;
    }

    throw new Error(`Unhandled test query: ${query}`);
  }
}

function createService() {
  const dataSource = new InMemoryDeckDataSource();
  const service = new DecksService(dataSource as unknown as DataSource);

  return { dataSource, service };
}

function createJob(jobId = "job_sync_1") {
  return jobSchema.parse({
    jobId,
    projectId: "project_demo_1",
    type: "pptx-ooxml-sync",
    status: "queued",
    progress: 0,
    message: "Job queued",
    result: null,
    error: null,
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z",
  });
}

function stubOrbitEnv() {
  const values = {
    NODE_ENV: "test",
    APP_ENV: "local",
    WEB_PORT: "5173",
    API_PORT: "3000",
    WORKER_PORT: "3001",
    PYTHON_WORKER_PORT: "8000",
    WEB_ORIGIN: "http://localhost:5173",
    API_BASE_URL: "http://localhost:3000",
    PYTHON_WORKER_URL: "http://localhost:8000",
    DATABASE_URL: "postgres://orbit:orbit@localhost:5432/orbit",
    REDIS_URL: "redis://localhost:6379",
    SESSION_SECRET: "local-session-secret-change-me",
    COOKIE_SECRET: "local-cookie-secret-change-me",
    STORAGE_DRIVER: "minio",
    S3_ENDPOINT: "http://localhost:9000",
    S3_PUBLIC_ENDPOINT: "http://localhost:9000",
    S3_BUCKET: "orbit-local",
    S3_REGION: "ap-northeast-2",
    S3_ACCESS_KEY_ID: "orbit",
    S3_SECRET_ACCESS_KEY: "orbit-password",
    S3_FORCE_PATH_STYLE: "true",
    JOB_QUEUE_DRIVER: "bullmq",
    LIVE_STT_PROVIDER: "web-speech",
    REPORT_STT_PROVIDER: "openai",
    OCR_PROVIDER: "python",
    LLM_PROVIDER: "openai",
    OPENAI_API_KEY: "",
    OPENAI_MODEL: "gpt-4.1-mini",
    OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-transcribe",
    OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
    AWS_REGION: "ap-northeast-2",
    AWS_ACCESS_KEY_ID: "",
    AWS_SECRET_ACCESS_KEY: "",
    TRANSCRIBE_LANGUAGE_CODE: "ko-KR",
    TEXTRACT_ENABLED: "false",
    LOG_LEVEL: "debug",
    LOG_PRETTY: "false",
    DEMO_USER_ID: "user_demo_1",
    DEMO_WORKSPACE_ID: "workspace_demo_1",
    DEMO_PROJECT_ID: "project_demo_1",
    DEMO_DECK_ID: "deck_demo_1",
    DEMO_SESSION_ID: "session_demo_1",
  };

  for (const [key, value] of Object.entries(values)) {
    vi.stubEnv(key, value);
  }
}

function createDeck(): Deck {
  return deckSchema.parse({
    deckId: "deck_demo_1",
    projectId: "project_demo_1",
    title: "ORBIT Demo Deck",
    version: 1,
    metadata: {
      language: "ko",
      locale: "ko-KR",
    },
    canvas: {
      preset: "wide-16-9",
      width: 1920,
      height: 1080,
      aspectRatio: "16:9",
    },
    slides: [
      {
        slideId: "slide_intro",
        order: 1,
        title: "소개",
      },
    ],
  });
}

function createRepeatedKeywordDeck(): Deck {
  const deck = createDeck();

  return deckSchema.parse({
    ...deck,
    slides: [
      {
        ...deck.slides[0],
        speakerNotes: "ORBIT 흐름은 ORBIT 대본으로 설명합니다.",
        keywords: [
          {
            keywordId: "kw_orbit",
            text: "ORBIT",
            synonyms: [],
            abbreviations: [],
            required: true,
          },
        ],
      },
    ],
  });
}

function createLegacyKeywordDeck(deck: Deck): Deck {
  const legacyDeck = cloneJson(deck);

  legacyDeck.slides[0].keywords = [
    {
      keywordId: "kw_one",
      text: " ORBIT ",
      synonyms: ["발표 도우미", "", "발표 도우미"],
      abbreviations: ["OD", "od", " "],
      required: true
    },
    {
      keywordId: "kw_two",
      text: "orbit",
      synonyms: ["ORBIT", "리허설"],
      abbreviations: ["발표 도우미", "STT"],
      required: true
    }
  ];

  return legacyDeck;
}

function createNormalizedLegacyKeywords(): Deck["slides"][number]["keywords"] {
  return [
    {
      keywordId: "kw_one",
      text: "ORBIT",
      synonyms: ["발표 도우미", "리허설"],
      abbreviations: ["OD", "STT"],
      required: true
    }
  ];
}

function seedStoredDeck(
  dataSource: InMemoryDeckDataSource,
  deck: Deck,
  deckJson: unknown,
): void {
  dataSource.decks.set(deck.projectId, {
    project_id: deck.projectId,
    deck_id: deck.deckId,
    deck_json: cloneJson(deckJson),
    version: deck.version,
    updated_at: "2026-06-29T00:00:00.000Z",
  });
}

function createUpdateTitlePatch(
  deck: Deck,
  title: string,
  baseVersion = deck.version,
): DeckPatch {
  return {
    deckId: deck.deckId,
    baseVersion,
    source: "user",
    operations: [
      {
        type: "update_deck",
        title,
      },
    ],
  };
}

function createAddOccurrenceNextSlideActionPatch(
  deck: Deck,
  occurrenceId: string,
): DeckPatch {
  const slide = deck.slides[0]!;

  return {
    deckId: deck.deckId,
    baseVersion: deck.version,
    source: "user",
    operations: [
      {
        type: "add_slide_action",
        slideId: slide.slideId,
        action: {
          actionId: "act_second_orbit_next",
          trigger: {
            kind: "keyword-occurrence",
            keywordId: "kw_orbit",
            occurrenceId,
          },
          effect: {
            kind: "go-to-next-slide",
          },
        },
      },
    ],
  };
}

async function expectDeckApiError(
  action: () => Promise<unknown>,
  status: HttpStatus,
  code: DeckApiError["code"],
): Promise<DeckApiError> {
  try {
    await action();
  } catch (error) {
    if (!(error instanceof HttpException)) {
      throw error;
    }

    const body = deckApiErrorSchema.parse(error.getResponse());
    expect(error.getStatus()).toBe(status);
    expect(body.code).toBe(code);
    return body;
  }

  throw new Error(`Expected Deck API error: ${code}`);
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function cloneDeckRow(row: StoredDeckRow): StoredDeckRow {
  return {
    ...row,
    deck_json: cloneJson(row.deck_json),
  };
}

function cloneSnapshotRow(row: StoredSnapshotRow): StoredSnapshotRow {
  return {
    ...row,
    deck_json: cloneJson(row.deck_json),
  };
}

function clonePatchRow(row: StoredPatchRow): StoredPatchRow {
  return {
    ...row,
    operations: cloneJson(row.operations),
  };
}

function compareSnapshotRows(
  a: StoredSnapshotRow,
  b: StoredSnapshotRow,
): number {
  const createdAtOrder = b.created_at.localeCompare(a.created_at);
  if (createdAtOrder !== 0) {
    return createdAtOrder;
  }

  const versionOrder = b.version - a.version;
  return versionOrder === 0
    ? b.snapshot_id.localeCompare(a.snapshot_id)
    : versionOrder;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("DecksService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stores and reads a current deck with an automatic snapshot", async () => {
    const { service } = createService();
    const deck = createDeck();

    const putResponse = await service.putDeck(deck.projectId, { deck });
    const getResponse = await service.getDeck(deck.projectId);
    const snapshotResponse = await service.listSnapshots(deck.projectId);

    expect(putResponse.deck).toMatchObject({
      deckId: deck.deckId,
      projectId: deck.projectId,
      title: deck.title,
      version: 1,
    });
    expect(putResponse.snapshot).toMatchObject({
      projectId: deck.projectId,
      deckId: deck.deckId,
      version: 1,
      reason: "deck-replaced",
    });
    expect(putResponse.snapshot.snapshotId).toMatch(/^snapshot_/);
    expect(getResponse.deck.title).toBe(deck.title);
    expect(snapshotResponse.snapshots).toHaveLength(1);
    expect(snapshotResponse.snapshots[0]?.snapshotId).toBe(
      putResponse.snapshot.snapshotId,
    );
  });

  it("normalizes legacy keyword terms when reading stored deck JSON", async () => {
    const { dataSource, service } = createService();
    const deck = createDeck();

    seedStoredDeck(dataSource, deck, createLegacyKeywordDeck(deck));

    const response = await service.getDeck(deck.projectId);

    expect(response.deck.slides[0].keywords).toEqual(
      createNormalizedLegacyKeywords(),
    );
  });

  it("normalizes legacy numeric keyword IDs when reading stored deck JSON", async () => {
    const { dataSource, service } = createService();
    const deck = createDeck();
    const legacyDeck = createLegacyKeywordDeck(deck);
    legacyDeck.slides[0].keywords[0].keywordId = 1 as unknown as string;

    seedStoredDeck(dataSource, deck, legacyDeck);

    const response = await service.getDeck(deck.projectId);

    expect(response.deck.slides[0].keywords[0]?.keywordId).toBe("kw_legacy_1");
  });

  it("uses stored deck row IDs when legacy deck JSON identity is stale", async () => {
    const { dataSource, service } = createService();
    const deck = createDeck();
    const staleDeck = {
      ...deck,
      projectId: "project_stale",
      deckId: "deck_stale",
    };

    seedStoredDeck(dataSource, deck, staleDeck);

    const response = await service.getDeck(deck.projectId);

    expect(response.deck.projectId).toBe(deck.projectId);
    expect(response.deck.deckId).toBe(deck.deckId);
  });

  it("normalizes legacy keyword terms before applying patches", async () => {
    const { dataSource, service } = createService();
    const deck = createDeck();

    seedStoredDeck(dataSource, deck, createLegacyKeywordDeck(deck));

    const response = await service.appendPatch(deck.projectId, {
      patch: createUpdateTitlePatch(deck, "수정된 덱"),
    });
    const getResponse = await service.getDeck(deck.projectId);

    expect(response.deck.title).toBe("수정된 덱");
    expect(response.deck.slides[0].keywords).toEqual(
      createNormalizedLegacyKeywords(),
    );
    expect(getResponse.deck).toMatchObject({
      title: "수정된 덱",
      slides: [
        {
          keywords: createNormalizedLegacyKeywords(),
        },
      ],
    });
  });

  it("applies a patch, increments the deck version, and stores change history", async () => {
    const { dataSource, service } = createService();
    const deck = createDeck();
    await service.putDeck(deck.projectId, { deck });

    const patchResponse = await service.appendPatch(deck.projectId, {
      patch: createUpdateTitlePatch(deck, "수정된 덱"),
    });
    const getResponse = await service.getDeck(deck.projectId);
    const snapshotResponse = await service.listSnapshots(deck.projectId);

    expect(patchResponse.deck.title).toBe("수정된 덱");
    expect(patchResponse.deck.version).toBe(2);
    expect(patchResponse.changeRecord).toMatchObject({
      deckId: deck.deckId,
      beforeVersion: 1,
      afterVersion: 2,
      source: "user",
    });
    expect(patchResponse.snapshot).toBeNull();
    expect(dataSource.patchRows).toHaveLength(1);
    expect(dataSource.patchRows[0]).toMatchObject({
      deck_id: deck.deckId,
      before_version: 1,
      after_version: 2,
    });
    expect(dataSource.decks.get(deck.projectId)?.version).toBe(1);
    expect(getResponse.deck.version).toBe(2);
    expect(getResponse.deck.title).toBe("수정된 덱");
    expect(
      snapshotResponse.snapshots.map((snapshot) => snapshot.version).sort(),
    ).toEqual([1]);
  });

  it("persists keyword occurrence action triggers in checkpointed deck JSON", async () => {
    const { dataSource, service } = createService();
    const deck = createRepeatedKeywordDeck();
    const occurrenceId = createKeywordOccurrenceId(
      deck.slides[0]!.slideId,
      "kw_orbit",
      10,
      15,
    );
    await service.putDeck(deck.projectId, { deck });

    expect(deck.slides[0]!.actions).toEqual([]);

    const response = await service.appendPatch(deck.projectId, {
      patch: createAddOccurrenceNextSlideActionPatch(deck, occurrenceId),
      snapshotReason: "patch-applied",
    });
    const persistedDeck = deckSchema.parse(
      dataSource.decks.get(deck.projectId)?.deck_json,
    );

    expect(response.deck.slides[0]!.actions).toHaveLength(1);
    expect(response.deck.slides[0]!.actions[0]?.trigger).toEqual({
      kind: "keyword-occurrence",
      keywordId: "kw_orbit",
      occurrenceId,
    });
    expect(persistedDeck.slides[0]!.actions[0]?.trigger).toEqual({
      kind: "keyword-occurrence",
      keywordId: "kw_orbit",
      occurrenceId,
    });
  });

  it("enqueues OOXML sync after patching an OOXML-backed deck", async () => {
    stubOrbitEnv();
    const dataSource = new InMemoryDeckDataSource();
    const deck = createDeck();
    const syncJob = createJob();
    const jobsService = {
      create: vi.fn(async () => syncJob),
      update: vi.fn(),
    };
    const enqueueSyncJob = vi.fn(async () => undefined);
    const service = new DecksService(
      dataSource as unknown as DataSource,
      jobsService as never,
      enqueueSyncJob,
    );

    await service.putDeck(deck.projectId, { deck });
    dataSource.templateBlueprintRows.push({
      template_id: "template_file_1",
      project_id: deck.projectId,
      deck_id: deck.deckId,
      blueprint_json: {
        templateId: "template_file_1",
        sourceFileId: "file_1",
        currentPackageFileId: "file_current",
        slides: [{ slideIndex: 1, sourceSlideIndex: 1, slots: [] }],
      },
    });

    const response = await service.appendPatch(deck.projectId, {
      patch: {
        deckId: deck.deckId,
        baseVersion: deck.version,
        source: "user",
        operations: [
          {
            type: "add_element",
            slideId: deck.slides[0]!.slideId,
            element: {
              elementId: "el_sync_text",
              type: "text",
              role: "body",
              x: 120,
              y: 140,
              width: 520,
              height: 120,
              rotation: 0,
              opacity: 1,
              zIndex: 1,
              locked: false,
              visible: true,
              props: {
                text: "OOXML sync target",
                fontSize: 32,
              },
            },
          },
        ],
      },
    });

    expect(response.ooxmlSyncJob?.jobId).toBe(syncJob.jobId);
    expect(jobsService.create).toHaveBeenCalledWith({
      projectId: deck.projectId,
      type: "pptx-ooxml-sync",
      payload: {
        deckId: deck.deckId,
        changeId: response.changeRecord.changeId,
        targetDeckVersion: 2,
      },
    });
    expect(enqueueSyncJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: syncJob.jobId,
        projectId: deck.projectId,
        deckId: deck.deckId,
        targetDeckVersion: 2,
      }),
    );
  });

  it("does not enqueue OOXML sync for thumbnail-only system patches", async () => {
    stubOrbitEnv();
    const dataSource = new InMemoryDeckDataSource();
    const deck = createDeck();
    const jobsService = {
      create: vi.fn(async () => createJob()),
      update: vi.fn(),
    };
    const enqueueSyncJob = vi.fn(async () => undefined);
    const service = new DecksService(
      dataSource as unknown as DataSource,
      jobsService as never,
      enqueueSyncJob,
    );

    await service.putDeck(deck.projectId, { deck });
    dataSource.templateBlueprintRows.push({
      template_id: "template_file_1",
      project_id: deck.projectId,
      deck_id: deck.deckId,
      blueprint_json: {
        templateId: "template_file_1",
        sourceFileId: "file_1",
        currentPackageFileId: "file_current",
        slides: [{ slideIndex: 1, sourceSlideIndex: 1, slots: [] }],
      },
    });

    const response = await service.appendPatch(deck.projectId, {
      patch: {
        deckId: deck.deckId,
        baseVersion: deck.version,
        source: "system",
        operations: [
          {
            type: "update_slide",
            slideId: deck.slides[0]!.slideId,
            thumbnailUrl: "/api/v1/projects/project_demo_1/assets/file_thumb/content",
          },
          {
            type: "update_deck",
            metadata: {
              thumbnailSource: "canvas",
            },
          },
        ],
      },
    });

    expect(response.ooxmlSyncJob).toBeUndefined();
    expect(response.deck.version).toBe(2);
    expect(jobsService.create).not.toHaveBeenCalled();
    expect(enqueueSyncJob).not.toHaveBeenCalled();
  });

  it("restores a snapshot into the current deck", async () => {
    const { dataSource, service } = createService();
    const deck = createDeck();
    const putResponse = await service.putDeck(deck.projectId, { deck });
    await service.appendPatch(deck.projectId, {
      patch: createUpdateTitlePatch(deck, "수정된 덱"),
    });

    const restoreResponse = await service.restoreSnapshot(
      deck.projectId,
      putResponse.snapshot.snapshotId,
    );
    const getResponse = await service.getDeck(deck.projectId);

    expect(restoreResponse.restoredSnapshot.snapshotId).toBe(
      putResponse.snapshot.snapshotId,
    );
    expect(restoreResponse.deck).toMatchObject({
      title: deck.title,
      version: 1,
    });
    expect(getResponse.deck).toMatchObject({
      title: deck.title,
      version: 1,
    });
    expect(dataSource.patchRows).toHaveLength(0);
    expect(
      dataSource.executedQueries.some((query) =>
        query.includes("WHERE project_id = $1 AND deck_id = $2 FOR UPDATE"),
      ),
    ).toBe(true);
  });

  it("compacts stored patch rows after a full deck checkpoint save", async () => {
    const { dataSource, service } = createService();
    const deck = createDeck();
    await service.putDeck(deck.projectId, { deck });

    const patched = await service.appendPatch(deck.projectId, {
      patch: createUpdateTitlePatch(deck, "수정된 덱"),
    });

    expect(dataSource.patchRows).toHaveLength(1);

    await service.putDeck(deck.projectId, { deck: patched.deck });

    expect(dataSource.patchRows).toHaveLength(0);
    expect(dataSource.decks.get(deck.projectId)?.version).toBe(2);
  });

  it("rejects stale full deck saves before deleting newer patch rows", async () => {
    const { dataSource, service } = createService();
    const deck = createDeck();
    await service.putDeck(deck.projectId, { deck });

    await service.appendPatch(deck.projectId, {
      patch: createUpdateTitlePatch(deck, "Updated deck"),
    });

    const error = await expectDeckApiError(
      () => service.putDeck(deck.projectId, { deck }),
      HttpStatus.CONFLICT,
      "STALE_BASE_VERSION",
    );
    const getResponse = await service.getDeck(deck.projectId);

    expect(error.details).toEqual([
      "deck.version=2",
      "request.baseVersion=1",
    ]);
    expect(dataSource.patchRows).toHaveLength(1);
    expect(getResponse.deck).toMatchObject({
      title: "Updated deck",
      version: 2,
    });
  });

  it("rejects full deck saves that try to replace the project deck id", async () => {
    const { service } = createService();
    const deck = createDeck();
    await service.putDeck(deck.projectId, { deck });

    const error = await expectDeckApiError(
      () =>
        service.putDeck(deck.projectId, {
          baseVersion: deck.version,
          deck: {
            ...deck,
            deckId: "deck_other_1",
          },
        }),
      HttpStatus.CONFLICT,
      "DECK_MISMATCH",
    );

    expect(error.details).toEqual([
      "deck.deckId=deck_demo_1",
      "request.deckId=deck_other_1",
    ]);
  });

  it("allows explicit full deck version rewind when baseVersion matches", async () => {
    const { dataSource, service } = createService();
    const deck = createDeck();
    await service.putDeck(deck.projectId, { deck });

    await service.appendPatch(deck.projectId, {
      patch: createUpdateTitlePatch(deck, "Updated deck"),
    });

    await service.putDeck(deck.projectId, { deck, baseVersion: 2 });
    const getResponse = await service.getDeck(deck.projectId);

    expect(dataSource.patchRows).toHaveLength(0);
    expect(getResponse.deck).toMatchObject({
      title: deck.title,
      version: 1,
    });

    const nextPatchResponse = await service.appendPatch(deck.projectId, {
      patch: createUpdateTitlePatch(deck, "Saved after undo"),
    });

    expect(nextPatchResponse.deck).toMatchObject({
      title: "Saved after undo",
      version: 2,
    });
  });

  it("normalizes legacy keyword terms when restoring snapshots", async () => {
    const { dataSource, service } = createService();
    const deck = createDeck();

    dataSource.snapshotRows.push({
      snapshot_id: "snapshot_legacy_keywords",
      project_id: deck.projectId,
      deck_id: deck.deckId,
      deck_json: createLegacyKeywordDeck(deck),
      version: deck.version,
      reason: "deck-replaced",
      created_at: "2026-06-29T00:00:00.000Z",
    });

    const response = await service.restoreSnapshot(
      deck.projectId,
      "snapshot_legacy_keywords",
    );

    expect(response.deck.slides[0].keywords).toEqual(
      createNormalizedLegacyKeywords(),
    );
    expect(dataSource.decks.get(deck.projectId)?.deck_json).toMatchObject({
      slides: [
        {
          keywords: createNormalizedLegacyKeywords(),
        },
      ],
    });
  });

  it("rejects stale patch baseVersion", async () => {
    const { service } = createService();
    const deck = createDeck();
    await service.putDeck(deck.projectId, { deck });

    const error = await expectDeckApiError(
      () =>
        service.appendPatch(deck.projectId, {
          patch: createUpdateTitlePatch(deck, "수정된 덱", 2),
        }),
      HttpStatus.CONFLICT,
      "STALE_BASE_VERSION",
    );

    expect(error.details).toEqual(["deck.version=1", "patch.baseVersion=2"]);
  });

  it("rejects reads when stored patch chain does not start from the checkpoint version", async () => {
    const { dataSource, service } = createService();
    const deck = createDeck();
    seedStoredDeck(dataSource, deck, deck);
    dataSource.patchRows.push({
      change_id: "change_gap_from_checkpoint",
      project_id: deck.projectId,
      deck_id: deck.deckId,
      before_version: 2,
      after_version: 3,
      source: "user",
      actor_user_id: null,
      operations: createUpdateTitlePatch(deck, "수정된 덱", 2).operations,
      created_at: "2026-06-30T00:00:00.000Z",
    });

    const error = await expectDeckApiError(
      () => service.getDeck(deck.projectId),
      HttpStatus.CONFLICT,
      "PATCH_CHAIN_CHECKPOINT_MISMATCH",
    );

    expect(error.details).toContain("checkpoint.version=1");
    expect(error.details).toContain("expected.beforeVersion=1");
  });

  it("rejects reads when stored patch chain contains a version gap", async () => {
    const { dataSource, service } = createService();
    const deck = createDeck();
    seedStoredDeck(dataSource, deck, { ...deck, version: 2, title: "중간 덱" });
    dataSource.patchRows.push({
      change_id: "change_gap_middle_start",
      project_id: deck.projectId,
      deck_id: deck.deckId,
      before_version: 2,
      after_version: 3,
      source: "user",
      actor_user_id: null,
      operations: createUpdateTitlePatch(
        { ...deck, version: 2 },
        "세 번째 덱",
        2,
      ).operations,
      created_at: "2026-06-30T00:00:00.000Z",
    });
    dataSource.patchRows.push({
      change_id: "change_gap_middle",
      project_id: deck.projectId,
      deck_id: deck.deckId,
      before_version: 4,
      after_version: 5,
      source: "user",
      actor_user_id: null,
      operations: createUpdateTitlePatch(
        { ...deck, version: 4 },
        "수정된 덱",
        4,
      ).operations,
      created_at: "2026-06-30T00:00:01.000Z",
    });

    const error = await expectDeckApiError(
      () => service.getDeck(deck.projectId),
      HttpStatus.CONFLICT,
      "PATCH_CHAIN_INVALID",
    );

    expect(error.details).toContain("expected.beforeVersion=3");
    expect(error.details).toContain("patch.beforeVersion=4");
  });

  it("rejects reads when stored patch row has a non-sequential version transition", async () => {
    const { dataSource, service } = createService();
    const deck = createDeck();
    seedStoredDeck(dataSource, deck, deck);
    dataSource.patchRows.push({
      change_id: "change_duplicate_after_version",
      project_id: deck.projectId,
      deck_id: deck.deckId,
      before_version: 1,
      after_version: 3,
      source: "user",
      actor_user_id: null,
      operations: createUpdateTitlePatch(deck, "수정된 덱").operations,
      created_at: "2026-06-30T00:00:00.000Z",
    });

    const error = await expectDeckApiError(
      () => service.getDeck(deck.projectId),
      HttpStatus.CONFLICT,
      "PATCH_CHAIN_INVALID",
    );

    expect(error.details).toContain("patch.beforeVersion=1");
    expect(error.details).toContain("patch.afterVersion=3");
  });

  it("rejects reads when the current deck does not exist", async () => {
    const { service } = createService();

    await expectDeckApiError(
      () => service.getDeck("project_demo_1"),
      HttpStatus.NOT_FOUND,
      "DECK_NOT_FOUND",
    );
  });

  it("rejects patch append when the current deck does not exist", async () => {
    const { service } = createService();
    const deck = createDeck();

    await expectDeckApiError(
      () =>
        service.appendPatch(deck.projectId, {
          patch: createUpdateTitlePatch(deck, "수정된 덱"),
        }),
      HttpStatus.NOT_FOUND,
      "DECK_NOT_FOUND",
    );
  });

  it("rejects invalid DeckPatch payloads", async () => {
    const { service } = createService();
    const deck = createDeck();
    await service.putDeck(deck.projectId, { deck });

    const error = await expectDeckApiError(
      () =>
        service.appendPatch(deck.projectId, {
          patch: {
            deckId: deck.deckId,
            baseVersion: deck.version,
            source: "user",
            operations: [],
          },
        }),
      HttpStatus.BAD_REQUEST,
      "PATCH_VALIDATION_FAILED",
    );

    expect(error.details.join("\n")).toContain("operations");
  });

  it("rejects invalid keyword replacement patch payloads", async () => {
    const { service } = createService();
    const deck = createDeck();
    await service.putDeck(deck.projectId, { deck });

    const error = await expectDeckApiError(
      () =>
        service.appendPatch(deck.projectId, {
          patch: {
            deckId: deck.deckId,
            baseVersion: deck.version,
            source: "user",
            operations: [
              {
                type: "replace_keywords",
                slideId: "slide_intro",
                keywords: [
                  {
                    keywordId: "kw_one",
                    text: "ORBIT",
                    synonyms: [""],
                    abbreviations: [],
                    required: true
                  },
                  {
                    keywordId: "kw_two",
                    text: "orbit",
                    synonyms: [],
                    abbreviations: [],
                    required: true
                  }
                ]
              }
            ]
          }
        }),
      HttpStatus.BAD_REQUEST,
      "PATCH_VALIDATION_FAILED",
    );

    expect(error.details.join("\n")).toContain("keywords");
  });

  it("rejects invalid DeckSchema payloads", async () => {
    const { service } = createService();
    const invalidDeck = {
      ...createDeck(),
      metadata: {
        language: "en",
        locale: "ko-KR",
      },
    };

    const error = await expectDeckApiError(
      () => service.putDeck("project_demo_1", { deck: invalidDeck }),
      HttpStatus.BAD_REQUEST,
      "DECK_VALIDATION_FAILED",
    );

    expect(error.details.join("\n")).toContain("metadata.language");
  });

  it("rejects restore when the snapshot does not exist", async () => {
    const { service } = createService();

    await expectDeckApiError(
      () => service.restoreSnapshot("project_demo_1", "snapshot_missing_1"),
      HttpStatus.NOT_FOUND,
      "SNAPSHOT_NOT_FOUND",
    );
  });

  it("rejects restore when the snapshot belongs to another project", async () => {
    const { service } = createService();
    const deck = createDeck();
    const putResponse = await service.putDeck(deck.projectId, { deck });

    const error = await expectDeckApiError(
      () =>
        service.restoreSnapshot(
          "project_other_1",
          putResponse.snapshot.snapshotId,
        ),
      HttpStatus.BAD_REQUEST,
      "SNAPSHOT_PROJECT_MISMATCH",
    );

    expect(error.details).toEqual([
      "projectId=project_other_1",
      "snapshot.projectId=project_demo_1",
    ]);
  });

  it("rejects deck writes outside the requested project boundary", async () => {
    const { service } = createService();
    const deck = createDeck();

    const error = await expectDeckApiError(
      () => service.putDeck("project_other_1", { deck }),
      HttpStatus.BAD_REQUEST,
      "PROJECT_MISMATCH",
    );

    expect(error.details).toEqual([
      "projectId=project_other_1",
      "deck.projectId=project_demo_1",
    ]);
  });
});
