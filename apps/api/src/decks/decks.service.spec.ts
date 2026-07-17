import { HttpException, HttpStatus } from "@nestjs/common";
import { applyDeckPatch } from "@orbit/editor-core";
import {
  deckApiErrorSchema,
  deckSchema,
  createKeywordOccurrenceId,
  jobSchema,
  type Deck,
  type DeckApiError,
  type DeckElement,
  type DeckPatch,
  type DeckSnapshotReason,
  type TemplateElementSource,
} from "@orbit/shared";
import type { DataSource } from "typeorm";
import type { PinoLogger } from "nestjs-pino";
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
  readonly exportSessionIds = new Set<string>();

  async transaction<T>(
    run: (manager: InMemoryDeckDataSource) => Promise<T>,
  ): Promise<T> {
    return run(this);
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
    const query = normalizeSql(sql);
    this.executedQueries.push(query);

    if (query.includes("FROM presentation_sessions")) {
      const [projectId, deckId, sessionId] = params as [string, string, string];
      return (
        projectId === "project_demo_1" &&
        deckId === "deck_demo_1" &&
        this.exportSessionIds.has(sessionId)
          ? [{ session_id: sessionId }]
          : []
      ) as T;
    }

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

function createOoxmlSyncService(jobId: string) {
  stubOrbitEnv();
  const dataSource = new InMemoryDeckDataSource();
  const syncJob = createJob(jobId);
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

  return { dataSource, enqueueSyncJob, jobsService, service, syncJob };
}

function createJob(
  jobId = "job_sync_1",
  type:
    | "pptx-ooxml-sync"
    | "deck-export"
    | "semantic-cue-extraction"
    | "speaker-notes-suggestion" = "pptx-ooxml-sync",
) {
  return jobSchema.parse({
    jobId,
    projectId: "project_demo_1",
    type,
    status: "queued",
    progress: 0,
    message: "Job queued",
    result: null,
    error: null,
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z",
  });
}

function createLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
  } as unknown as PinoLogger;
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
    LIVE_STT_PROVIDER: "sherpa",
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

function createImportedDeck(
  capabilities: NonNullable<DeckElement["ooxmlEditCapabilities"]> = {
    richText: "full",
    crop: "none",
    tableCellText: false,
    frame: true,
    delete: true,
  },
): Deck {
  const deck = createDeck();
  return deckSchema.parse({
    ...deck,
    metadata: { ...deck.metadata, sourceType: "import" },
    slides: [
      {
        ...deck.slides[0]!,
        ooxmlOrigin: "imported",
        ooxmlSourceSlidePart: "ppt/slides/slide1.xml",
        ooxmlMotionCapabilities: {
          transitionWritable: false,
          importedMainSequenceCoverage: "absent",
        },
        elements: [
          {
            ...createTextElement("el_imported", "Imported text"),
            ooxmlOrigin: "imported",
            ooxmlEditCapabilities: capabilities,
          },
        ],
      },
    ],
  });
}

function createTextElement(
  elementId: string,
  text: string,
  x = 100,
): DeckElement {
  return {
    elementId,
    type: "text",
    role: "body",
    x,
    y: 120,
    width: 480,
    height: 120,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    locked: false,
    visible: true,
    props: {
      text,
      fontSize: 32,
      fontWeight: "normal",
      color: "#111827",
      align: "left",
      verticalAlign: "top",
      lineHeight: 1.2,
    },
  };
}

function createImageElement(
  elementId: string,
  x: number,
  capabilities: NonNullable<DeckElement["ooxmlEditCapabilities"]>,
): DeckElement {
  return {
    elementId,
    type: "image",
    ooxmlOrigin: "imported",
    ooxmlEditCapabilities: capabilities,
    x,
    y: 120,
    width: 320,
    height: 180,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    locked: false,
    visible: true,
    props: {
      src: "data:image/png;base64,AA==",
      alt: "",
      fit: "contain",
      focusX: 0.5,
      focusY: 0.5,
    },
  };
}

function createAuthoredImageElement(
  elementId: string,
  x: number,
  crop?: { left: number; top: number; right: number; bottom: number },
): DeckElement {
  return {
    elementId,
    type: "image",
    ooxmlOrigin: "authored",
    x,
    y: 120,
    width: 320,
    height: 180,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    locked: false,
    visible: true,
    props: {
      src: "data:image/png;base64,AA==",
      alt: "",
      fit: "contain",
      focusX: 0.5,
      focusY: 0.5,
      ...(crop ? { crop } : {}),
    },
  };
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
      required: true,
    },
    {
      keywordId: "kw_two",
      text: "orbit",
      synonyms: ["ORBIT", "리허설"],
      abbreviations: ["발표 도우미", "STT"],
      required: true,
    },
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
      required: true,
    },
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

function seedOoxmlBlueprint(
  dataSource: InMemoryDeckDataSource,
  deck: Deck,
  ooxmlSyncedDeckVersion = deck.version,
  elementSources: TemplateElementSource[] = [],
): void {
  dataSource.templateBlueprintRows.push({
    template_id: "template_file_1",
    project_id: deck.projectId,
    deck_id: deck.deckId,
    blueprint_json: {
      templateId: "template_file_1",
      sourceFileId: "file_1",
      currentPackageFileId: "file_current",
      ooxmlSyncedDeckVersion,
      slides: deck.slides.map((deckSlide, slideIndex) => ({
        slideIndex: slideIndex + 1,
        sourceSlideIndex: slideIndex + 1,
        sourceSlidePart: `ppt/slides/slide${slideIndex + 1}.xml`,
        ooxmlOrigin: deckSlide.ooxmlOrigin,
        ooxmlMotionCapabilities: deckSlide.ooxmlMotionCapabilities,
        elementSources: slideIndex === 0 ? elementSources : [],
        slots: [],
      })),
    },
  });
}

function createImageElementSource(
  element: DeckElement,
  crop: "none" | "picture" | "picture-fill",
): TemplateElementSource {
  return {
    elementId: element.elementId,
    elementType: "image",
    ooxmlOrigin: element.ooxmlOrigin,
    ooxmlEditCapabilities: {
      richText: "none",
      crop,
      tableCellText: false,
      frame: true,
      delete: true,
      imageSource: true,
    },
    slidePart: "ppt/slides/slide1.xml",
    shapeId: "7",
    relationshipId: "rId7",
    sourceType: crop === "picture-fill" ? "shape" : "image",
    writable: true,
  };
}

function createTextElementSource(
  element: DeckElement,
  richText: "none" | "style-only" | "full",
): TemplateElementSource {
  return {
    elementId: element.elementId,
    elementType: "text",
    ooxmlOrigin: element.ooxmlOrigin,
    ooxmlEditCapabilities: {
      richText,
      crop: "none",
      tableCellText: false,
      frame: true,
      delete: true,
      imageSource: false,
    },
    slidePart: "ppt/slides/slide1.xml",
    shapeId: "8",
    sourceType: "slide",
    writable: true,
  };
}

function createTableElement(
  elementId: string,
  ooxmlOrigin: "imported" | "authored",
  tableCellText = ooxmlOrigin === "imported",
): Extract<DeckElement, { type: "table" }> {
  return deckSchema.parse({
    ...createDeck(),
    slides: [
      {
        ...createDeck().slides[0]!,
        elements: [
          {
            elementId,
            type: "table",
            ooxmlOrigin,
            ...(ooxmlOrigin === "imported"
              ? {
                  ooxmlEditCapabilities: {
                    richText: "none",
                    crop: "none",
                    tableCellText,
                    frame: true,
                    delete: true,
                    imageSource: false,
                  },
                }
              : {}),
            x: 100,
            y: 120,
            width: 480,
            height: 120,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            locked: false,
            visible: true,
            props: {
              rows: [
                [
                  { text: "A", fill: "#FFFFFF" },
                  { text: "B", fill: "#FFFFFF" },
                ],
                [
                  { text: "C", fill: "#FFFFFF" },
                  { text: "D", fill: "#FFFFFF" },
                ],
              ],
              columnWidths: [240, 240],
              rowHeights: [60, 60],
            },
          },
        ],
      },
    ],
  }).slides[0]!.elements[0] as Extract<DeckElement, { type: "table" }>;
}

function createTableElementSource(
  element: Extract<DeckElement, { type: "table" }>,
  locatorRows = element.props.rows.length,
  locatorColumns = element.props.rows[0]?.length ?? 0,
): TemplateElementSource {
  return {
    elementId: element.elementId,
    elementType: "table",
    ooxmlOrigin: element.ooxmlOrigin,
    ooxmlEditCapabilities: {
      richText: "none",
      crop: "none",
      tableCellText: true,
      frame: true,
      delete: true,
      imageSource: false,
    },
    slidePart: "ppt/slides/slide1.xml",
    shapeId: "9",
    sourceType: "table",
    writable: true,
    tableCellLocators: Array.from(
      { length: locatorRows * locatorColumns },
      (_, index) => ({
        rowIndex: Math.floor(index / locatorColumns),
        columnIndex: index % locatorColumns,
        fingerprint: index.toString(16).padStart(64, "0"),
      }),
    ),
  };
}

function createImportedTableDeck(): Deck {
  const base = createImportedDeck();
  return deckSchema.parse({
    ...base,
    slides: [
      {
        ...base.slides[0]!,
        elements: [createTableElement("el_imported_table", "imported")],
      },
    ],
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

  it("returns a lightweight acknowledgement when requested", async () => {
    const { service } = createService();
    const deck = createDeck();
    await service.putDeck(deck.projectId, { deck });

    const response = await service.appendPatch(deck.projectId, {
      patch: createUpdateTitlePatch(deck, "Ack title"),
      responseMode: "ack",
    });
    const persisted = await service.getDeck(deck.projectId);

    expect(response).not.toHaveProperty("deck");
    expect(response).toMatchObject({
      deckId: deck.deckId,
      version: 2,
      changeRecord: {
        beforeVersion: 1,
        afterVersion: 2,
      },
    });
    expect(response.snapshot).toBeUndefined();
    expect(persisted.deck).toMatchObject({ title: "Ack title", version: 2 });
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
    expect(dataSource.decks.get(deck.projectId)).toMatchObject({
      version: 2,
      deck_json: expect.objectContaining({
        version: 2,
        slides: [
          expect.objectContaining({
            elements: [expect.objectContaining({ elementId: "el_sync_text" })],
          }),
        ],
      }),
    });
  });

  it("normalizes an imported full save, records its OOXML diff, and enqueues sync", async () => {
    stubOrbitEnv();
    const dataSource = new InMemoryDeckDataSource();
    const syncJob = createJob("job_sync_put");
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
    const base = createDeck();
    const current = deckSchema.parse({
      ...base,
      version: 2,
      slides: [
        {
          ...base.slides[0],
          elements: [
            createTextElement("el_keep", "Before"),
            createTextElement("el_delete", "Delete", 700),
          ],
        },
      ],
    });
    await service.putDeck(current.projectId, { deck: current });
    dataSource.templateBlueprintRows.push({
      template_id: "template_file_1",
      project_id: current.projectId,
      deck_id: current.deckId,
      blueprint_json: {
        templateId: "template_file_1",
        sourceFileId: "file_1",
        sourcePackageFileId: "file_1",
        currentPackageFileId: "file_current",
        ooxmlSyncedDeckVersion: 2,
        slides: [{ slideIndex: 1, sourceSlideIndex: 1, slots: [] }],
      },
    });
    const requested = deckSchema.parse({
      ...current,
      version: 1,
      slides: [
        {
          ...current.slides[0],
          elements: [
            createTextElement("el_keep", "After", 180),
            createTextElement("el_add", "Add", 900),
          ],
        },
      ],
    });

    const response = await service.putDeck(current.projectId, {
      baseVersion: current.version,
      deck: requested,
    });

    expect(response.deck.version).toBe(3);
    expect(response.ooxmlSyncJob?.jobId).toBe(syncJob.jobId);
    expect(dataSource.patchRows).toHaveLength(1);
    expect(dataSource.patchRows[0]).toMatchObject({
      before_version: 2,
      after_version: 3,
      operations: expect.arrayContaining([
        expect.objectContaining({
          type: "delete_element",
          elementId: "el_delete",
        }),
        expect.objectContaining({
          type: "update_element_frame",
          elementId: "el_keep",
          frame: {
            x: 180,
            y: 120,
            width: 480,
            height: 120,
            rotation: 0,
          },
        }),
        expect.objectContaining({
          type: "update_element_props",
          elementId: "el_keep",
          props: { text: "After" },
        }),
        expect.objectContaining({
          type: "add_element",
          element: expect.objectContaining({ elementId: "el_add" }),
        }),
      ]),
    });
    expect(jobsService.create).toHaveBeenCalledWith({
      projectId: current.projectId,
      type: "pptx-ooxml-sync",
      payload: {
        deckId: current.deckId,
        changeId: "change_deck_demo_1_3_put",
        targetDeckVersion: 3,
      },
    });
    expect(enqueueSyncJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: syncJob.jobId,
        deckId: current.deckId,
        targetDeckVersion: 3,
      }),
    );
  });

  it("rejects unsupported structural changes in an imported full save before persistence", async () => {
    const { dataSource, service } = createService();
    const deck = createDeck();
    await service.putDeck(deck.projectId, { deck });
    dataSource.templateBlueprintRows.push({
      template_id: "template_file_1",
      project_id: deck.projectId,
      deck_id: deck.deckId,
      blueprint_json: {
        templateId: "template_file_1",
        sourceFileId: "file_1",
        currentPackageFileId: "file_current",
        ooxmlSyncedDeckVersion: 1,
        slides: [{ slideIndex: 1, sourceSlideIndex: 1, slots: [] }],
      },
    });

    await expectDeckApiError(
      () =>
        service.putDeck(deck.projectId, {
          baseVersion: deck.version,
          deck: {
            ...deck,
            slides: [
              {
                ...deck.slides[0]!,
                style: { backgroundColor: "#000000" },
              },
            ],
          },
        }),
      HttpStatus.BAD_REQUEST,
      "OOXML_CHANGE_UNSUPPORTED",
    );

    expect(dataSource.decks.get(deck.projectId)?.version).toBe(1);
    expect(dataSource.patchRows).toHaveLength(0);
  });

  it("does not persist a rejected imported patch before a supported patch", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_after_rejection",
    );
    const deck = createImportedDeck();
    const slide = deck.slides[0]!;
    const element = slide.elements[0]!;
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck);

    const error = await expectDeckApiError(
      () =>
        service.appendPatch(deck.projectId, {
          patch: {
            deckId: deck.deckId,
            baseVersion: deck.version,
            source: "user",
            operations: [
              {
                type: "update_element_frame",
                slideId: slide.slideId,
                elementId: element.elementId,
                frame: { opacity: 0.5 },
              },
            ],
          },
        }),
      HttpStatus.BAD_REQUEST,
      "OOXML_CHANGE_UNSUPPORTED",
    );

    expect(error.details).toContain("reasonCode=FRAME_FIELDS_UNSUPPORTED");
    expect(dataSource.patchRows).toHaveLength(0);
    expect(dataSource.decks.get(deck.projectId)).toMatchObject({ version: 1 });

    const response = await service.appendPatch(deck.projectId, {
      patch: {
        deckId: deck.deckId,
        baseVersion: deck.version,
        source: "user",
        operations: [
          {
            type: "update_element_frame",
            slideId: slide.slideId,
            elementId: element.elementId,
            frame: {
              x: 180,
              y: element.y,
              width: element.width,
              height: element.height,
              rotation: element.rotation,
            },
          },
        ],
      },
    });

    expect(response.deck).toMatchObject({ version: 2 });
    expect(response.deck.slides[0]!.elements[0]).toMatchObject({ x: 180 });
    expect(dataSource.patchRows).toHaveLength(1);
    expect(dataSource.patchRows[0]).toMatchObject({
      before_version: 1,
      after_version: 2,
    });
  });

  it("uses explicit image-source capability for grouped pictures and unsafe proxies", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_safe_image_source",
    );
    const base = createImportedDeck();
    const groupedPictureCapabilities = {
      richText: "none" as const,
      crop: "none" as const,
      tableCellText: false,
      frame: false,
      delete: false,
      imageSource: true,
    };
    const pictureFillCapabilities = {
      ...groupedPictureCapabilities,
      frame: true,
      delete: true,
      imageSource: false,
    };
    const lockedPictureCapabilities = {
      ...groupedPictureCapabilities,
      imageSource: false,
    };
    const deck = deckSchema.parse({
      ...base,
      slides: [
        {
          ...base.slides[0]!,
          elements: [
            createImageElement(
              "el_grouped_picture",
              100,
              groupedPictureCapabilities,
            ),
            createImageElement(
              "el_picture_fill_proxy",
              500,
              pictureFillCapabilities,
            ),
            createImageElement(
              "el_locked_picture",
              900,
              lockedPictureCapabilities,
            ),
          ],
        },
      ],
    });
    const slide = deck.slides[0]!;
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck);

    for (const elementId of ["el_picture_fill_proxy", "el_locked_picture"]) {
      const error = await expectDeckApiError(
        () =>
          service.appendPatch(deck.projectId, {
            patch: {
              deckId: deck.deckId,
              baseVersion: deck.version,
              source: "user",
              operations: [
                {
                  type: "update_element_props",
                  slideId: slide.slideId,
                  elementId,
                  props: {
                    src: "data:image/png;base64,AQ==",
                    alt: "Blocked replacement",
                  },
                },
              ],
            },
          }),
        HttpStatus.BAD_REQUEST,
        "OOXML_CHANGE_UNSUPPORTED",
      );
      expect(error.details).toContain(
        "reasonCode=IMAGE_SOURCE_CAPABILITY_UNSAFE",
      );
    }
    expect(dataSource.patchRows).toHaveLength(0);

    const response = await service.appendPatch(deck.projectId, {
      patch: {
        deckId: deck.deckId,
        baseVersion: deck.version,
        source: "user",
        operations: [
          {
            type: "update_element_props",
            slideId: slide.slideId,
            elementId: "el_grouped_picture",
            props: {
              src: "data:image/png;base64,Ag==",
              alt: "Safe replacement",
            },
          },
        ],
      },
    });

    expect(response.deck.version).toBe(2);
    expect(response.deck.slides[0]!.elements[0]).toMatchObject({
      elementId: "el_grouped_picture",
      props: {
        src: "data:image/png;base64,Ag==",
        alt: "Safe replacement",
      },
    });
    expect(dataSource.patchRows).toHaveLength(1);
  });

  it.each([
    ["picture", "image"],
    ["picture-fill", "shape"],
  ] as const)(
    "allows imported %s crop updates and crop:null reset from the authoritative source mapping",
    async (cropCapability, sourceType) => {
      const { dataSource, service } = createOoxmlSyncService(
        `job_sync_imported_crop_${cropCapability}`,
      );
      const base = createImportedDeck();
      const capabilities = {
        richText: "none" as const,
        crop: cropCapability,
        tableCellText: false,
        frame: true,
        delete: true,
        imageSource: true,
      };
      const image = createImageElement(
        `el_imported_crop_${cropCapability}`,
        100,
        capabilities,
      );
      const deck = deckSchema.parse({
        ...base,
        slides: [
          {
            ...base.slides[0]!,
            elements: [image],
          },
        ],
      });
      const source = {
        ...createImageElementSource(image, cropCapability),
        sourceType,
      };
      await service.putDeck(deck.projectId, { deck });
      seedOoxmlBlueprint(dataSource, deck, deck.version, [source]);

      const cropped = await service.appendPatch(deck.projectId, {
        patch: {
          deckId: deck.deckId,
          baseVersion: deck.version,
          source: "user",
          operations: [
            {
              type: "update_element_props",
              slideId: deck.slides[0]!.slideId,
              elementId: image.elementId,
              props: {
                crop: { left: 0.2, top: 0.1, right: 0.15, bottom: 0.05 },
              },
            },
          ],
        },
      });

      expect(cropped.deck.slides[0]!.elements[0]!.props).toMatchObject({
        crop: { left: 0.2, top: 0.1, right: 0.15, bottom: 0.05 },
      });

      const reset = await service.appendPatch(deck.projectId, {
        patch: {
          deckId: deck.deckId,
          baseVersion: cropped.deck.version,
          source: "user",
          operations: [
            {
              type: "update_element_props",
              slideId: deck.slides[0]!.slideId,
              elementId: image.elementId,
              props: { crop: null },
            },
          ],
        },
      });

      expect(reset.deck.slides[0]!.elements[0]!.props).not.toHaveProperty(
        "crop",
      );
    },
  );

  it.each(["missing-source", "missing-capability", "none"] as const)(
    "fails closed for imported crop when the authoritative source mapping is %s",
    async (sourceState) => {
      const { dataSource, service } = createOoxmlSyncService(
        `job_sync_unsafe_imported_crop_${sourceState}`,
      );
      const base = createImportedDeck();
      const image = createImageElement("el_imported_unsafe_crop", 100, {
        richText: "none",
        crop: "picture",
        tableCellText: false,
        frame: true,
        delete: true,
        imageSource: true,
      });
      const deck = deckSchema.parse({
        ...base,
        slides: [{ ...base.slides[0]!, elements: [image] }],
      });
      const pictureSource = createImageElementSource(image, "picture");
      const {
        ooxmlEditCapabilities: _capabilities,
        ...sourceWithoutCapability
      } = pictureSource;
      const sources =
        sourceState === "missing-source"
          ? []
          : sourceState === "missing-capability"
            ? [sourceWithoutCapability]
            : [createImageElementSource(image, "none")];
      await service.putDeck(deck.projectId, { deck });
      seedOoxmlBlueprint(dataSource, deck, deck.version, sources);

      const error = await expectDeckApiError(
        () =>
          service.appendPatch(deck.projectId, {
            patch: {
              deckId: deck.deckId,
              baseVersion: deck.version,
              source: "user",
              operations: [
                {
                  type: "update_element_props",
                  slideId: deck.slides[0]!.slideId,
                  elementId: image.elementId,
                  props: {
                    crop: { left: 0.1, top: 0, right: 0, bottom: 0 },
                  },
                },
              ],
            },
          }),
        HttpStatus.BAD_REQUEST,
        "OOXML_CHANGE_UNSUPPORTED",
      );

      expect(error.details).toContain("reasonCode=CROP_CAPABILITY_UNSAFE");
      expect(dataSource.patchRows).toHaveLength(0);
    },
  );

  it("allows authored image crop on add, in the same patch, and in a sequential unsynced patch", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_authored_crop_coalesced",
    );
    const deck = createImportedDeck();
    const slideId = deck.slides[0]!.slideId;
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck);

    const addAndCrop = await service.appendPatch(deck.projectId, {
      patch: {
        deckId: deck.deckId,
        baseVersion: deck.version,
        source: "user",
        operations: [
          {
            type: "add_element",
            slideId,
            element: createAuthoredImageElement("el_crop_on_add", 100, {
              left: 0.1,
              top: 0.05,
              right: 0.15,
              bottom: 0,
            }),
          },
          {
            type: "add_element",
            slideId,
            element: createAuthoredImageElement("el_crop_same_patch", 500),
          },
          {
            type: "update_element_props",
            slideId,
            elementId: "el_crop_same_patch",
            props: {
              crop: { left: 0, top: 0.1, right: 0.2, bottom: 0 },
            },
          },
        ],
      },
    });

    const added = await service.appendPatch(deck.projectId, {
      patch: {
        deckId: deck.deckId,
        baseVersion: addAndCrop.deck.version,
        source: "user",
        operations: [
          {
            type: "add_element",
            slideId,
            element: createAuthoredImageElement(
              "el_crop_sequential_patch",
              900,
            ),
          },
        ],
      },
    });
    const sequentialCrop = await service.appendPatch(deck.projectId, {
      patch: {
        deckId: deck.deckId,
        baseVersion: added.deck.version,
        source: "user",
        operations: [
          {
            type: "update_element_props",
            slideId,
            elementId: "el_crop_sequential_patch",
            props: {
              crop: { left: 0.05, top: 0, right: 0, bottom: 0.1 },
            },
          },
        ],
      },
    });

    expect(sequentialCrop.deck.slides[0]!.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          elementId: "el_crop_on_add",
          ooxmlOrigin: "authored",
          props: expect.objectContaining({
            crop: { left: 0.1, top: 0.05, right: 0.15, bottom: 0 },
          }),
        }),
        expect.objectContaining({
          elementId: "el_crop_same_patch",
          props: expect.objectContaining({
            crop: { left: 0, top: 0.1, right: 0.2, bottom: 0 },
          }),
        }),
        expect.objectContaining({
          elementId: "el_crop_sequential_patch",
          props: expect.objectContaining({
            crop: { left: 0.05, top: 0, right: 0, bottom: 0.1 },
          }),
        }),
      ]),
    );
    expect(dataSource.patchRows).toHaveLength(3);
  });

  it("keeps unsupported authored image fit fail-closed when crop is present", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_authored_crop_unsupported_fit",
    );
    const deck = createImportedDeck();
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck);
    const image = createAuthoredImageElement("el_crop_cover", 100, {
      left: 0.1,
      top: 0,
      right: 0,
      bottom: 0,
    });

    const error = await expectDeckApiError(
      () =>
        service.appendPatch(deck.projectId, {
          patch: {
            deckId: deck.deckId,
            baseVersion: deck.version,
            source: "user",
            operations: [
              {
                type: "add_element",
                slideId: deck.slides[0]!.slideId,
                element: {
                  ...image,
                  props: { ...image.props, fit: "cover" },
                },
              },
            ],
          },
        }),
      HttpStatus.BAD_REQUEST,
      "OOXML_CHANGE_UNSUPPORTED",
    );

    expect(error.details).toContain(
      "reasonCode=ADD_ELEMENT_SERIALIZER_UNSUPPORTED",
    );
    expect(dataSource.patchRows).toHaveLength(0);
  });

  it("allows crop for an already-synced authored image with a safe picture source mapping", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_authored_crop_safe_mapping",
    );
    const base = createImportedDeck();
    const image = createAuthoredImageElement("el_authored_mapped_safe", 100);
    const deck = deckSchema.parse({
      ...base,
      slides: [{ ...base.slides[0]!, elements: [image] }],
    });
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck, deck.version, [
      createImageElementSource(image, "picture"),
    ]);

    const response = await service.appendPatch(deck.projectId, {
      patch: {
        deckId: deck.deckId,
        baseVersion: deck.version,
        source: "user",
        operations: [
          {
            type: "update_element_props",
            slideId: deck.slides[0]!.slideId,
            elementId: image.elementId,
            props: { crop: { left: 0.1, top: 0, right: 0, bottom: 0 } },
          },
        ],
      },
    });

    expect(response.deck.slides[0]!.elements[0]!.props).toMatchObject({
      crop: { left: 0.1, top: 0, right: 0, bottom: 0 },
    });
  });

  it("fails closed for an already-synced authored image whose source mapping has no crop capability", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_authored_crop_unsafe_mapping",
    );
    const base = createImportedDeck();
    const image = createAuthoredImageElement("el_authored_mapped_unsafe", 100);
    const deck = deckSchema.parse({
      ...base,
      slides: [{ ...base.slides[0]!, elements: [image] }],
    });
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck, deck.version, [
      createImageElementSource(image, "none"),
    ]);

    const error = await expectDeckApiError(
      () =>
        service.appendPatch(deck.projectId, {
          patch: {
            deckId: deck.deckId,
            baseVersion: deck.version,
            source: "user",
            operations: [
              {
                type: "update_element_props",
                slideId: deck.slides[0]!.slideId,
                elementId: image.elementId,
                props: {
                  crop: { left: 0.1, top: 0, right: 0, bottom: 0 },
                },
              },
            ],
          },
        }),
      HttpStatus.BAD_REQUEST,
      "OOXML_CHANGE_UNSUPPORTED",
    );

    expect(error.details).toContain("reasonCode=CROP_CAPABILITY_UNSAFE");
    expect(dataSource.patchRows).toHaveLength(0);
  });

  it("allows imported canonical rich-text updates only with a matching authoritative source", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_imported_rich_text_full",
    );
    const deck = createImportedDeck({
      richText: "full",
      crop: "none",
      tableCellText: false,
      frame: true,
      delete: true,
    });
    const element = deck.slides[0]!.elements[0]!;
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck, deck.version, [
      createTextElementSource(element, "full"),
    ]);

    const response = await service.appendPatch(deck.projectId, {
      patch: {
        deckId: deck.deckId,
        baseVersion: deck.version,
        source: "user",
        operations: [
          {
            type: "update_element_props",
            slideId: deck.slides[0]!.slideId,
            elementId: element.elementId,
            props: {
              text: "Updated title\nSecond paragraph",
              writingMode: "vertical-270",
              paragraphs: [
                {
                  text: "Updated title",
                  runs: [
                    {
                      text: "Updated ",
                      fontWeight: "bold",
                      baseline: "normal",
                    },
                    {
                      text: "title",
                      italic: true,
                      underline: true,
                      baseline: "normal",
                    },
                  ],
                  align: "left",
                  lineHeight: 1.2,
                },
                {
                  text: "Second paragraph",
                  runs: [{ text: "Second paragraph", baseline: "normal" }],
                  align: "left",
                  lineHeight: 1.2,
                  bullet: { enabled: true, character: "•", indent: 24 },
                },
              ],
            },
          },
        ],
      },
    });

    expect(response.deck.version).toBe(2);
    expect(response.deck.slides[0]!.elements[0]!.props).toMatchObject({
      text: "Updated title\nSecond paragraph",
      writingMode: "vertical-270",
      paragraphs: [
        expect.objectContaining({
          runs: [
            expect.objectContaining({ fontWeight: "bold", text: "Updated " }),
            expect.objectContaining({ italic: true, text: "title" }),
          ],
        }),
        expect.objectContaining({
          bullet: expect.objectContaining({ enabled: true }),
        }),
      ],
    });

    const plainTextResponse = await service.appendPatch(deck.projectId, {
      patch: {
        deckId: deck.deckId,
        baseVersion: response.deck.version,
        source: "user",
        operations: [
          {
            type: "update_element_props",
            slideId: deck.slides[0]!.slideId,
            elementId: element.elementId,
            props: {
              text: "Plain text regression",
              paragraphs: [
                {
                  text: "Plain text regression",
                  runs: [{ text: "Plain text regression", baseline: "normal" }],
                  align: "left",
                  lineHeight: 1.2,
                },
              ],
            },
          },
        ],
      },
    });

    expect(plainTextResponse.deck).toMatchObject({ version: 3 });
    expect(plainTextResponse.deck.slides[0]!.elements[0]!.props).toMatchObject({
      text: "Plain text regression",
    });

    for (const inconsistentProps of [
      { text: "Text-only divergence" },
      {
        runs: [
          {
            text: "Runs-only divergence",
            baseline: "normal" as const,
          },
        ],
      },
      {
        paragraphs: [
          {
            text: "Paragraph-only divergence",
            runs: [
              {
                text: "Paragraph-only divergence",
                baseline: "normal" as const,
              },
            ],
          },
        ],
      },
    ]) {
      const inconsistent = await expectDeckApiError(
        () =>
          service.appendPatch(deck.projectId, {
            patch: {
              deckId: deck.deckId,
              baseVersion: plainTextResponse.deck.version,
              source: "user",
              operations: [
                {
                  type: "update_element_props",
                  slideId: deck.slides[0]!.slideId,
                  elementId: element.elementId,
                  props: inconsistentProps,
                },
              ],
            },
          }),
        HttpStatus.BAD_REQUEST,
        "OOXML_CHANGE_UNSUPPORTED",
      );
      expect(inconsistent.details).toContain(
        "reasonCode=RICH_TEXT_CAPABILITY_UNSAFE",
      );
    }
    expect(dataSource.patchRows).toHaveLength(2);

    const unsupportedWeight = await expectDeckApiError(
      () =>
        service.appendPatch(deck.projectId, {
          patch: {
            deckId: deck.deckId,
            baseVersion: plainTextResponse.deck.version,
            source: "user",
            operations: [
              {
                type: "update_element_props",
                slideId: deck.slides[0]!.slideId,
                elementId: element.elementId,
                props: { fontWeight: "semibold" },
              },
            ],
          },
        }),
      HttpStatus.BAD_REQUEST,
      "OOXML_CHANGE_UNSUPPORTED",
    );

    expect(unsupportedWeight.details).toContain(
      "reasonCode=RICH_TEXT_CAPABILITY_UNSAFE",
    );
    expect(dataSource.patchRows).toHaveLength(2);
  });

  it("allows style-only rich-text patches only when semantic text is unchanged", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_imported_rich_text_style_only",
    );
    const base = createImportedDeck({
      richText: "style-only",
      crop: "none",
      tableCellText: false,
      frame: true,
      delete: true,
    });
    const sourceElement = base.slides[0]!.elements[0]!;
    if (sourceElement.type !== "text") throw new Error("expected text");
    const deck = deckSchema.parse({
      ...base,
      slides: [
        {
          ...base.slides[0]!,
          elements: [
            {
              ...sourceElement,
              props: {
                ...sourceElement.props,
                paragraphs: [
                  {
                    text: sourceElement.props.text,
                    runs: [
                      {
                        text: sourceElement.props.text,
                        baseline: "normal",
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const element = deck.slides[0]!.elements[0]!;
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck, deck.version, [
      createTextElementSource(element, "style-only"),
    ]);

    const styleResponse = await service.appendPatch(deck.projectId, {
      patch: {
        deckId: deck.deckId,
        baseVersion: deck.version,
        source: "user",
        operations: [
          {
            type: "update_element_props",
            slideId: deck.slides[0]!.slideId,
            elementId: element.elementId,
            props: {
              paragraphs: [
                {
                  text: "Imported text",
                  runs: [
                    {
                      text: "Imported text",
                      italic: true,
                      underline: true,
                      baseline: "normal",
                    },
                  ],
                  align: "left",
                  lineHeight: 1.2,
                },
              ],
            },
          },
        ],
      },
    });

    expect(styleResponse.deck.version).toBe(2);
    const styledElement = styleResponse.deck.slides[0]!.elements[0]!;
    expect(styledElement.type).toBe("text");
    if (styledElement.type !== "text") throw new Error("expected text");
    expect(styledElement.props.paragraphs?.[0]?.runs?.[0]).toMatchObject({
      italic: true,
      underline: true,
    });

    const error = await expectDeckApiError(
      () =>
        service.appendPatch(deck.projectId, {
          patch: {
            deckId: deck.deckId,
            baseVersion: styleResponse.deck.version,
            source: "user",
            operations: [
              {
                type: "update_element_props",
                slideId: deck.slides[0]!.slideId,
                elementId: element.elementId,
                props: {
                  text: "Hyperlink or field content changed",
                  paragraphs: [
                    {
                      text: "Hyperlink or field content changed",
                      runs: [
                        {
                          text: "Hyperlink or field content changed",
                          baseline: "normal",
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        }),
      HttpStatus.BAD_REQUEST,
      "OOXML_CHANGE_UNSUPPORTED",
    );

    expect(error.details).toContain("reasonCode=RICH_TEXT_CAPABILITY_UNSAFE");
    expect(dataSource.patchRows).toHaveLength(1);
  });

  it("rejects forged authoritative rich-text source capability", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_imported_rich_text_forged",
    );
    const deck = createImportedDeck({
      richText: "full",
      crop: "none",
      tableCellText: false,
      frame: true,
      delete: true,
    });
    const element = deck.slides[0]!.elements[0]!;
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck, deck.version, [
      createTextElementSource(element, "style-only"),
    ]);

    const error = await expectDeckApiError(
      () =>
        service.appendPatch(deck.projectId, {
          patch: {
            deckId: deck.deckId,
            baseVersion: deck.version,
            source: "user",
            operations: [
              {
                type: "update_element_props",
                slideId: deck.slides[0]!.slideId,
                elementId: element.elementId,
                props: { text: "Forged full-capability edit" },
              },
            ],
          },
        }),
      HttpStatus.BAD_REQUEST,
      "OOXML_CHANGE_UNSUPPORTED",
    );

    expect(error.details).toContain("reasonCode=RICH_TEXT_CAPABILITY_UNSAFE");
    expect(dataSource.patchRows).toHaveLength(0);
  });

  it("rejects imported rich-text updates when the authoritative source is missing", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_imported_rich_text_missing_source",
    );
    const deck = createImportedDeck({
      richText: "full",
      crop: "none",
      tableCellText: false,
      frame: true,
      delete: true,
    });
    const element = deck.slides[0]!.elements[0]!;
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck);

    const error = await expectDeckApiError(
      () =>
        service.appendPatch(deck.projectId, {
          patch: {
            deckId: deck.deckId,
            baseVersion: deck.version,
            source: "user",
            operations: [
              {
                type: "update_element_props",
                slideId: deck.slides[0]!.slideId,
                elementId: element.elementId,
                props: { text: "Missing source mapping edit" },
              },
            ],
          },
        }),
      HttpStatus.BAD_REQUEST,
      "OOXML_CHANGE_UNSUPPORTED",
    );

    expect(error.details).toContain("reasonCode=RICH_TEXT_CAPABILITY_UNSAFE");
    expect(dataSource.patchRows).toHaveLength(0);
  });

  it("rejects imported text when both Deck and source explicitly disable rich text", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_imported_rich_text_none",
    );
    const deck = createImportedDeck({
      richText: "none",
      crop: "none",
      tableCellText: false,
      frame: true,
      delete: true,
    });
    const element = deck.slides[0]!.elements[0]!;
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck, deck.version, [
      createTextElementSource(element, "none"),
    ]);

    const error = await expectDeckApiError(
      () =>
        service.appendPatch(deck.projectId, {
          patch: {
            deckId: deck.deckId,
            baseVersion: deck.version,
            source: "user",
            operations: [
              {
                type: "update_element_props",
                slideId: deck.slides[0]!.slideId,
                elementId: element.elementId,
                props: { fontSize: 40 },
              },
            ],
          },
        }),
      HttpStatus.BAD_REQUEST,
      "OOXML_CHANGE_UNSUPPORTED",
    );

    expect(error.details).toContain("reasonCode=RICH_TEXT_CAPABILITY_UNSAFE");
    expect(dataSource.patchRows).toHaveLength(0);
  });

  it("allows exactly one imported table cell text update with authoritative locators", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_imported_table_cell",
    );
    const deck = createImportedTableDeck();
    const table = deck.slides[0]!.elements[0]!;
    expect(table.type).toBe("table");
    if (table.type !== "table") throw new Error("expected table");
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck, deck.version, [
      createTableElementSource(table),
    ]);
    const rows = cloneJson(table.props.rows);
    rows[0]![1]!.text = "Edited B";

    const response = await service.appendPatch(deck.projectId, {
      patch: {
        deckId: deck.deckId,
        baseVersion: deck.version,
        source: "user",
        operations: [
          {
            type: "update_element_props",
            slideId: deck.slides[0]!.slideId,
            elementId: table.elementId,
            props: { rows },
          },
        ],
      },
    });

    expect(response.deck.version).toBe(2);
    expect(
      (
        response.deck.slides[0]!.elements[0] as Extract<
          DeckElement,
          { type: "table" }
        >
      ).props.rows[0]![1]!.text,
    ).toBe("Edited B");
    expect(dataSource.patchRows).toHaveLength(1);
  });

  it("preflights sequential imported table cell edits against working state", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_imported_table_batch",
    );
    const deck = createImportedTableDeck();
    const table = deck.slides[0]!.elements[0]!;
    expect(table.type).toBe("table");
    if (table.type !== "table") throw new Error("expected table");
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck, deck.version, [
      createTableElementSource(table),
    ]);
    const rowsAfterFirstEdit = cloneJson(table.props.rows);
    rowsAfterFirstEdit[0]![0]!.text = "Edited A";
    const rowsAfterSecondEdit = cloneJson(rowsAfterFirstEdit);
    rowsAfterSecondEdit[0]![1]!.text = "Edited B";

    const response = await service.appendPatch(deck.projectId, {
      patch: {
        deckId: deck.deckId,
        baseVersion: deck.version,
        source: "user",
        operations: [
          {
            type: "update_element_props",
            slideId: deck.slides[0]!.slideId,
            elementId: table.elementId,
            props: { rows: rowsAfterFirstEdit },
          },
          {
            type: "update_element_props",
            slideId: deck.slides[0]!.slideId,
            elementId: table.elementId,
            props: { rows: rowsAfterSecondEdit },
          },
        ],
      },
    });

    const saved = response.deck.slides[0]!.elements[0]!;
    expect(saved.type).toBe("table");
    if (saved.type !== "table") throw new Error("expected table");
    expect(saved.props.rows[0]![0]!.text).toBe("Edited A");
    expect(saved.props.rows[0]![1]!.text).toBe("Edited B");
    expect(dataSource.patchRows).toHaveLength(1);
  });

  it.each([
    [
      "no-op",
      (table: Extract<DeckElement, { type: "table" }>) => ({
        rows: cloneJson(table.props.rows),
      }),
    ],
    [
      "multiple cells",
      (table: Extract<DeckElement, { type: "table" }>) => {
        const rows = cloneJson(table.props.rows);
        rows[0]![0]!.text = "Edited A";
        rows[1]![1]!.text = "Edited D";
        return { rows };
      },
    ],
    [
      "cell style",
      (table: Extract<DeckElement, { type: "table" }>) => {
        const rows = cloneJson(table.props.rows);
        rows[0]![0]!.fill = "#000000";
        return { rows };
      },
    ],
    [
      "paragraph count change",
      (table: Extract<DeckElement, { type: "table" }>) => {
        const rows = cloneJson(table.props.rows);
        rows[0]![0]!.text = `${rows[0]![0]!.text}\nSecond paragraph`;
        return { rows };
      },
    ],
    [
      "top-level border style",
      () => ({ borderColor: "#000000", borderWidth: 2 }),
    ],
    ["column tracks", () => ({ columnWidths: [200, 280] })],
    [
      "row insertion",
      (table: Extract<DeckElement, { type: "table" }>) => ({
        rows: [...cloneJson(table.props.rows), cloneJson(table.props.rows[0]!)],
      }),
    ],
  ] as const)(
    "rejects imported table %s edits before persistence",
    async (_, createProps) => {
      const { dataSource, service } = createOoxmlSyncService(
        "job_sync_imported_table_rejected",
      );
      const deck = createImportedTableDeck();
      const table = deck.slides[0]!.elements[0]!;
      expect(table.type).toBe("table");
      if (table.type !== "table") throw new Error("expected table");
      await service.putDeck(deck.projectId, { deck });
      seedOoxmlBlueprint(dataSource, deck, deck.version, [
        createTableElementSource(table),
      ]);

      const error = await expectDeckApiError(
        () =>
          service.appendPatch(deck.projectId, {
            patch: {
              deckId: deck.deckId,
              baseVersion: deck.version,
              source: "user",
              operations: [
                {
                  type: "update_element_props",
                  slideId: deck.slides[0]!.slideId,
                  elementId: table.elementId,
                  props: createProps(table),
                },
              ],
            },
          }),
        HttpStatus.BAD_REQUEST,
        "OOXML_CHANGE_UNSUPPORTED",
      );

      expect(error.details).toContain(
        "reasonCode=TABLE_CELL_CAPABILITY_UNSAFE",
      );
      expect(dataSource.patchRows).toHaveLength(0);
      expect(dataSource.decks.get(deck.projectId)).toMatchObject({
        version: 1,
      });
    },
  );

  it.each([
    ["missing source mapping", () => []],
    [
      "incomplete locators",
      (table: Extract<DeckElement, { type: "table" }>) => [
        createTableElementSource(table, 1, 2),
      ],
    ],
    [
      "forged capability",
      (table: Extract<DeckElement, { type: "table" }>) => {
        const source = createTableElementSource(table);
        return [
          {
            ...source,
            ooxmlEditCapabilities: {
              ...source.ooxmlEditCapabilities!,
              tableCellText: false,
            },
          },
        ];
      },
    ],
    [
      "duplicate source mapping",
      (table: Extract<DeckElement, { type: "table" }>) => [
        createTableElementSource(table),
        createTableElementSource(table),
      ],
    ],
  ] as const)(
    "rejects imported table edits with %s",
    async (_, createSources) => {
      const { dataSource, service } = createOoxmlSyncService(
        "job_sync_imported_table_bad_source",
      );
      const deck = createImportedTableDeck();
      const table = deck.slides[0]!.elements[0]!;
      expect(table.type).toBe("table");
      if (table.type !== "table") throw new Error("expected table");
      await service.putDeck(deck.projectId, { deck });
      seedOoxmlBlueprint(dataSource, deck, deck.version, createSources(table));
      const rows = cloneJson(table.props.rows);
      rows[0]![0]!.text = "Forged edit";

      const error = await expectDeckApiError(
        () =>
          service.appendPatch(deck.projectId, {
            patch: {
              deckId: deck.deckId,
              baseVersion: deck.version,
              source: "user",
              operations: [
                {
                  type: "update_element_props",
                  slideId: deck.slides[0]!.slideId,
                  elementId: table.elementId,
                  props: { rows },
                },
              ],
            },
          }),
        HttpStatus.BAD_REQUEST,
        "OOXML_CHANGE_UNSUPPORTED",
      );

      expect(error.details).toContain(
        "reasonCode=TABLE_CELL_CAPABILITY_UNSAFE",
      );
      expect(dataSource.patchRows).toHaveLength(0);
    },
  );

  it("allows authored table add and rectangular structure updates", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_authored_table",
    );
    const deck = createImportedDeck();
    const table = createTableElement("el_authored_table", "authored");
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck);
    const rows = cloneJson(table.props.rows);
    rows.push([
      { ...cloneJson(rows[0]![0]!), text: "E" },
      { ...cloneJson(rows[0]![1]!), text: "F" },
    ]);

    const response = await service.appendPatch(deck.projectId, {
      patch: {
        deckId: deck.deckId,
        baseVersion: deck.version,
        source: "user",
        operations: [
          {
            type: "add_element",
            slideId: deck.slides[0]!.slideId,
            element: table,
          },
          {
            type: "update_element_props",
            slideId: deck.slides[0]!.slideId,
            elementId: table.elementId,
            props: {
              rows,
              rowHeights: [40, 40, 40],
              columnWidths: [200, 280],
            },
          },
        ],
      },
    });

    expect(response.deck.version).toBe(2);
    expect(response.deck.slides[0]!.elements.at(-1)).toMatchObject({
      elementId: table.elementId,
      ooxmlOrigin: "authored",
      props: { rowHeights: [40, 40, 40], columnWidths: [200, 280] },
    });
  });

  it("preflights batched authored table structure and cell edits sequentially", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_authored_table_batch",
    );
    const deck = createImportedDeck();
    const table = createTableElement("el_authored_table_batch", "authored");
    deck.slides[0]!.elements = [table];
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck, deck.version, [
      createTableElementSource(table),
    ]);
    const structuredRows = cloneJson(table.props.rows);
    structuredRows.push([
      { ...cloneJson(structuredRows[0]![0]!), text: "E" },
      { ...cloneJson(structuredRows[0]![1]!), text: "F" },
    ]);
    const editedRows = cloneJson(structuredRows);
    editedRows[2]![1]!.text = "Edited F";

    const response = await service.appendPatch(deck.projectId, {
      patch: {
        deckId: deck.deckId,
        baseVersion: deck.version,
        source: "user",
        operations: [
          {
            type: "update_element_props",
            slideId: deck.slides[0]!.slideId,
            elementId: table.elementId,
            props: {
              rows: structuredRows,
              rowHeights: [40, 40, 40],
              columnWidths: [200, 280],
            },
          },
          {
            type: "update_element_props",
            slideId: deck.slides[0]!.slideId,
            elementId: table.elementId,
            props: { rows: editedRows },
          },
        ],
      },
    });

    const saved = response.deck.slides[0]!.elements[0]!;
    expect(saved.type).toBe("table");
    if (saved.type !== "table") throw new Error("expected table");
    expect(saved.props.rows[2]![1]!.text).toBe("Edited F");
    expect(dataSource.patchRows).toHaveLength(1);
  });

  it.each(["medium", 700] as const)(
    "rejects authored table %s font weight before persistence",
    async (fontWeight) => {
      const { dataSource, service } = createOoxmlSyncService(
        "job_sync_authored_table_weights",
      );
      const deck = createImportedDeck();
      const table = createTableElement("el_authored_table_weights", "authored");
      table.props.rows[0]![0]!.fontWeight = fontWeight;
      await service.putDeck(deck.projectId, { deck });
      seedOoxmlBlueprint(dataSource, deck);

      const error = await expectDeckApiError(
        () =>
          service.appendPatch(deck.projectId, {
            patch: {
              deckId: deck.deckId,
              baseVersion: deck.version,
              source: "user",
              operations: [
                {
                  type: "add_element",
                  slideId: deck.slides[0]!.slideId,
                  element: table,
                },
              ],
            },
          }),
        HttpStatus.BAD_REQUEST,
        "OOXML_CHANGE_UNSUPPORTED",
      );

      expect(error.details).toContain(
        "reasonCode=ADD_ELEMENT_SERIALIZER_UNSUPPORTED",
      );
      expect(dataSource.patchRows).toHaveLength(0);
    },
  );

  it("keeps authored table border-only updates fail closed until sparse sync is supported", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_authored_table_border",
    );
    const deck = createImportedDeck();
    const table = createTableElement("el_authored_table_border", "authored");
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck);

    const error = await expectDeckApiError(
      () =>
        service.appendPatch(deck.projectId, {
          patch: {
            deckId: deck.deckId,
            baseVersion: deck.version,
            source: "user",
            operations: [
              {
                type: "add_element",
                slideId: deck.slides[0]!.slideId,
                element: table,
              },
              {
                type: "update_element_props",
                slideId: deck.slides[0]!.slideId,
                elementId: table.elementId,
                props: { borderColor: "#0F172A", borderWidth: 2 },
              },
            ],
          },
        }),
      HttpStatus.BAD_REQUEST,
      "OOXML_CHANGE_UNSUPPORTED",
    );

    expect(error.details).toContain(
      "reasonCode=AUTHORED_ELEMENT_SERIALIZER_UNSUPPORTED",
    );
    expect(dataSource.patchRows).toHaveLength(0);
  });

  it("keeps authored table track-only updates fail closed until sparse sync is supported", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_authored_table_tracks",
    );
    const deck = createImportedDeck();
    const table = createTableElement("el_authored_table_tracks", "authored");
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck);

    const error = await expectDeckApiError(
      () =>
        service.appendPatch(deck.projectId, {
          patch: {
            deckId: deck.deckId,
            baseVersion: deck.version,
            source: "user",
            operations: [
              {
                type: "add_element",
                slideId: deck.slides[0]!.slideId,
                element: table,
              },
              {
                type: "update_element_props",
                slideId: deck.slides[0]!.slideId,
                elementId: table.elementId,
                props: { columnWidths: [200, 280] },
              },
            ],
          },
        }),
      HttpStatus.BAD_REQUEST,
      "OOXML_CHANGE_UNSUPPORTED",
    );

    expect(error.details).toContain(
      "reasonCode=AUTHORED_ELEMENT_SERIALIZER_UNSUPPORTED",
    );
    expect(dataSource.patchRows).toHaveLength(0);
  });

  it("requires a new row track when an authored table row is inserted", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_authored_table_missing_row_track",
    );
    const deck = createImportedDeck();
    const table = createTableElement(
      "el_authored_table_missing_row_track",
      "authored",
    );
    table.props.rowHeights = undefined;
    const rows = cloneJson(table.props.rows);
    rows.push(cloneJson(rows[0]!));
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck);

    const error = await expectDeckApiError(
      () =>
        service.appendPatch(deck.projectId, {
          patch: {
            deckId: deck.deckId,
            baseVersion: deck.version,
            source: "user",
            operations: [
              {
                type: "add_element",
                slideId: deck.slides[0]!.slideId,
                element: table,
              },
              {
                type: "update_element_props",
                slideId: deck.slides[0]!.slideId,
                elementId: table.elementId,
                props: { rows },
              },
            ],
          },
        }),
      HttpStatus.BAD_REQUEST,
      "OOXML_CHANGE_UNSUPPORTED",
    );

    expect(error.details).toContain(
      "reasonCode=AUTHORED_ELEMENT_SERIALIZER_UNSUPPORTED",
    );
    expect(dataSource.patchRows).toHaveLength(0);
  });

  it.each([
    [
      "1,001 rows",
      (table: Extract<DeckElement, { type: "table" }>) => ({
        ...table.props,
        rows: Array.from({ length: 1_001 }, () => [
          { ...table.props.rows[0]![0]! },
        ]),
        columnWidths: [480],
        rowHeights: Array.from({ length: 1_001 }, () => 1),
      }),
    ],
    [
      "more than 10,000 cells",
      (table: Extract<DeckElement, { type: "table" }>) => ({
        ...table.props,
        rows: Array.from({ length: 101 }, () =>
          Array.from({ length: 100 }, () => ({
            ...table.props.rows[0]![0]!,
          })),
        ),
        columnWidths: Array.from({ length: 100 }, () => 4.8),
        rowHeights: Array.from({ length: 101 }, () => 1.2),
      }),
    ],
  ] as const)("rejects authored tables with %s", async (_, createProps) => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_authored_table_limit",
    );
    const deck = createImportedDeck();
    const table = createTableElement("el_authored_table_limit", "authored");
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck);

    const error = await expectDeckApiError(
      () =>
        service.appendPatch(deck.projectId, {
          patch: {
            deckId: deck.deckId,
            baseVersion: deck.version,
            source: "user",
            operations: [
              {
                type: "add_element",
                slideId: deck.slides[0]!.slideId,
                element: { ...table, props: createProps(table) },
              },
            ],
          },
        }),
      HttpStatus.BAD_REQUEST,
      "OOXML_CHANGE_UNSUPPORTED",
    );

    expect(error.details).toContain(
      "reasonCode=ADD_ELEMENT_SERIALIZER_UNSUPPORTED",
    );
    expect(dataSource.patchRows).toHaveLength(0);
  });

  it.each([
    ["empty", { rows: [], columnWidths: [], rowHeights: [] }],
    [
      "jagged",
      {
        rows: [[{ text: "A" }, { text: "B" }], [{ text: "C" }]],
        columnWidths: [240, 240],
        rowHeights: [60, 60],
      },
    ],
    [
      "merged",
      {
        rows: [[{ text: "A", colSpan: 2 }, { text: "B" }]],
        columnWidths: [240, 240],
        rowHeights: [120],
      },
    ],
    [
      "track mismatch",
      {
        rows: [[{ text: "A" }, { text: "B" }]],
        columnWidths: [480],
        rowHeights: [120],
      },
    ],
    [
      "unsupported style",
      {
        rows: [
          [
            {
              text: "A",
              fill: {
                type: "linear-gradient",
                angle: 0,
                stops: [
                  { offset: 0, color: "#FFFFFF" },
                  { offset: 1, color: "#000000" },
                ],
              },
            },
          ],
        ],
        columnWidths: [480],
        rowHeights: [120],
      },
    ],
  ] as const)("rejects authored table %s serialization", async (_, props) => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_authored_table_rejected",
    );
    const deck = createImportedDeck();
    const table = createTableElement("el_invalid_authored_table", "authored");
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck);

    const error = await expectDeckApiError(
      () =>
        service.appendPatch(deck.projectId, {
          patch: {
            deckId: deck.deckId,
            baseVersion: deck.version,
            source: "user",
            operations: [
              {
                type: "add_element",
                slideId: deck.slides[0]!.slideId,
                element: { ...table, props } as unknown as typeof table,
              },
            ],
          },
        }),
      HttpStatus.BAD_REQUEST,
      "OOXML_CHANGE_UNSUPPORTED",
    );

    expect(error.details).toContain(
      "reasonCode=ADD_ELEMENT_SERIALIZER_UNSUPPORTED",
    );
    expect(dataSource.patchRows).toHaveLength(0);
  });

  it("allows authored canonical rich-text add and sequential update", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_authored_rich_text",
    );
    const deck = createImportedDeck();
    deck.slides[0]!.ooxmlOrigin = "imported";
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck);
    const authored = deckSchema.parse({
      ...deck,
      slides: [
        {
          ...deck.slides[0]!,
          elements: [
            {
              ...createTextElement("el_authored_rich", "Authored rich"),
              props: {
                ...createTextElement("el_authored_rich", "Authored rich").props,
                paragraphs: [
                  {
                    text: "Authored rich",
                    runs: [
                      {
                        text: "Authored ",
                        fontWeight: "bold",
                        baseline: "normal",
                      },
                      { text: "rich", italic: true, baseline: "normal" },
                    ],
                    align: "left",
                    lineHeight: 1.2,
                  },
                ],
                runs: [
                  {
                    text: "Authored ",
                    fontWeight: "bold",
                    baseline: "normal",
                  },
                  { text: "rich", italic: true, baseline: "normal" },
                ],
              },
            },
          ],
        },
      ],
    }).slides[0]!.elements[0]!;
    expect(authored.type).toBe("text");
    if (authored.type !== "text") throw new Error("expected text");

    const added = await service.appendPatch(deck.projectId, {
      patch: {
        deckId: deck.deckId,
        baseVersion: deck.version,
        source: "user",
        operations: [
          {
            type: "add_element",
            slideId: deck.slides[0]!.slideId,
            element: authored,
          },
        ],
      },
    });

    expect(added.deck.slides[0]!.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          elementId: authored.elementId,
          ooxmlOrigin: "authored",
          props: expect.objectContaining({ paragraphs: expect.any(Array) }),
        }),
      ]),
    );

    const updated = await service.appendPatch(deck.projectId, {
      patch: {
        deckId: deck.deckId,
        baseVersion: added.deck.version,
        source: "user",
        operations: [
          {
            type: "update_element_props",
            slideId: deck.slides[0]!.slideId,
            elementId: authored.elementId,
            props: {
              text: "Authored updated",
              paragraphs: [
                {
                  text: "Authored updated",
                  runs: [
                    {
                      text: "Authored updated",
                      underline: true,
                      baseline: "normal",
                    },
                  ],
                  align: "left",
                  lineHeight: 1.2,
                },
              ],
              runs: [
                {
                  text: "Authored updated",
                  underline: true,
                  baseline: "normal",
                },
              ],
            },
          },
        ],
      },
    });

    expect(updated.deck.version).toBe(3);
    expect(
      updated.deck.slides[0]!.elements.find(
        (candidate) => candidate.elementId === authored.elementId,
      )?.props,
    ).toMatchObject({ text: "Authored updated" });

    const unsupported = await expectDeckApiError(
      () =>
        service.appendPatch(deck.projectId, {
          patch: {
            deckId: deck.deckId,
            baseVersion: updated.deck.version,
            source: "user",
            operations: [
              {
                type: "update_element_props",
                slideId: deck.slides[0]!.slideId,
                elementId: authored.elementId,
                props: { fontWeight: "semibold" },
              },
            ],
          },
        }),
      HttpStatus.BAD_REQUEST,
      "OOXML_CHANGE_UNSUPPORTED",
    );

    expect(unsupported.details).toContain(
      "reasonCode=AUTHORED_ELEMENT_SERIALIZER_UNSUPPORTED",
    );
    expect(dataSource.patchRows).toHaveLength(2);
  });

  it("rejects unsupported imported capabilities and operation families", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_unsupported_matrix",
    );
    const deck = createImportedDeck({
      richText: "none",
      crop: "none",
      tableCellText: false,
      frame: false,
      delete: false,
    });
    const slide = deck.slides[0]!;
    const element = slide.elements[0]!;
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck);

    const unsupportedOperations: DeckPatch["operations"] = [
      {
        type: "update_element_frame",
        slideId: slide.slideId,
        elementId: element.elementId,
        frame: {
          x: 180,
          y: element.y,
          width: element.width,
          height: element.height,
        },
      },
      {
        type: "delete_element",
        slideId: slide.slideId,
        elementId: element.elementId,
      },
      {
        type: "update_element_props",
        slideId: slide.slideId,
        elementId: element.elementId,
        props: { text: "Blocked" },
      },
      { type: "update_theme", theme: { name: "Blocked theme" } },
      {
        type: "update_slide_style",
        slideId: slide.slideId,
        style: { backgroundColor: "#000000" },
      },
      {
        type: "add_slide",
        slide: {
          ...slide,
          slideId: "slide_blocked",
          order: 2,
          elements: [],
        },
      },
      {
        type: "add_element",
        slideId: slide.slideId,
        element: {
          elementId: "el_unsupported_ellipse",
          type: "ellipse",
          x: 100,
          y: 100,
          width: 200,
          height: 100,
          rotation: 0,
          opacity: 1,
          zIndex: 2,
          locked: false,
          visible: true,
          props: {
            fill: "#FFFFFF",
            stroke: "transparent",
            strokeWidth: 0,
            borderRadius: 0,
          },
        },
      },
    ];

    for (const operation of unsupportedOperations) {
      await expectDeckApiError(
        () =>
          service.appendPatch(deck.projectId, {
            patch: {
              deckId: deck.deckId,
              baseVersion: deck.version,
              source: "user",
              operations: [operation],
            },
          }),
        HttpStatus.BAD_REQUEST,
        "OOXML_CHANGE_UNSUPPORTED",
      );
    }

    expect(dataSource.patchRows).toHaveLength(0);
    expect(dataSource.decks.get(deck.projectId)).toMatchObject({ version: 1 });
  });

  it("gates imported transition edits on the authoritative slide capability", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_transition_capability",
    );
    const blockedDeck = createImportedDeck();
    await service.putDeck(blockedDeck.projectId, { deck: blockedDeck });
    seedOoxmlBlueprint(dataSource, blockedDeck);

    const blocked = await expectDeckApiError(
      () =>
        service.appendPatch(blockedDeck.projectId, {
          patch: {
            deckId: blockedDeck.deckId,
            baseVersion: blockedDeck.version,
            source: "user",
            operations: [
              {
                type: "update_slide_transition",
                slideId: blockedDeck.slides[0]!.slideId,
                transition: { type: "fade", durationMs: 700 },
              },
            ],
          },
        }),
      HttpStatus.BAD_REQUEST,
      "OOXML_CHANGE_UNSUPPORTED",
    );
    expect(blocked.details).toContain(
      "reasonCode=TRANSITION_CAPABILITY_UNSAFE",
    );
    expect(dataSource.patchRows).toHaveLength(0);

    const writableDeck = deckSchema.parse({
      ...blockedDeck,
      projectId: "project_transition_writable",
      deckId: "deck_transition_writable",
      slides: [
        {
          ...blockedDeck.slides[0]!,
          ooxmlMotionCapabilities: {
            ...blockedDeck.slides[0]!.ooxmlMotionCapabilities!,
            transitionWritable: true,
          },
        },
      ],
    });
    const writableFixture = createOoxmlSyncService(
      "job_sync_transition_writable",
    );
    await writableFixture.service.putDeck(writableDeck.projectId, {
      deck: writableDeck,
    });
    seedOoxmlBlueprint(writableFixture.dataSource, writableDeck);

    await writableFixture.service.appendPatch(writableDeck.projectId, {
      patch: {
        deckId: writableDeck.deckId,
        baseVersion: writableDeck.version,
        source: "user",
        operations: [
          {
            type: "update_slide_transition",
            slideId: writableDeck.slides[0]!.slideId,
            transition: { type: "fade", durationMs: 700 },
          },
        ],
      },
    });

    expect(writableFixture.dataSource.patchRows[0]?.operations).toEqual([
      {
        type: "update_slide_transition",
        slideId: writableDeck.slides[0]!.slideId,
        transition: { type: "fade", durationMs: 700 },
      },
    ]);
  });

  it.each(["missing", "invalid"])(
    "rejects imported motion patch when template blueprint is %s without persistence",
    async (blueprintState) => {
      const { dataSource, service } = createService();
      const base = createImportedDeck();
      const deck = deckSchema.parse({
        ...base,
        slides: [
          {
            ...base.slides[0]!,
            ooxmlMotionCapabilities: {
              transitionWritable: true,
              importedMainSequenceCoverage: "complete",
            },
          },
        ],
      });
      await service.putDeck(deck.projectId, { deck });
      if (blueprintState === "invalid") {
        dataSource.templateBlueprintRows.push({
          template_id: "template_invalid_motion",
          project_id: deck.projectId,
          deck_id: deck.deckId,
          blueprint_json: {
            templateId: "template_invalid_motion",
            sourceFileId: "file_1",
            currentPackageFileId: "file_current",
            slides: [
              {
                slideIndex: 1,
                sourceSlideIndex: 1,
                ooxmlMotionCapabilities: {
                  transitionWritable: true,
                  importedMainSequenceCoverage: "complete",
                },
              },
            ],
          },
        });
      }

      const error = await expectDeckApiError(
        () =>
          service.appendPatch(deck.projectId, {
            patch: {
              deckId: deck.deckId,
              baseVersion: deck.version,
              source: "user",
              operations: [
                {
                  type: "update_slide_transition",
                  slideId: deck.slides[0]!.slideId,
                  transition: { type: "fade", durationMs: 700 },
                },
              ],
            },
          }),
        HttpStatus.BAD_REQUEST,
        "OOXML_CHANGE_UNSUPPORTED",
      );

      expect(error.details).toContain(
        "reasonCode=TEMPLATE_BLUEPRINT_UNAVAILABLE",
      );
      expect(dataSource.patchRows).toHaveLength(0);
      expect(dataSource.decks.get(deck.projectId)).toMatchObject({
        version: 1,
      });
    },
  );

  it("allows imported animation edits only for absent or complete main-sequence coverage", async () => {
    const allowedFixture = createOoxmlSyncService("job_sync_animation_absent");
    const allowedDeck = createImportedDeck();
    await allowedFixture.service.putDeck(allowedDeck.projectId, {
      deck: allowedDeck,
    });
    seedOoxmlBlueprint(allowedFixture.dataSource, allowedDeck);

    await allowedFixture.service.appendPatch(allowedDeck.projectId, {
      patch: {
        deckId: allowedDeck.deckId,
        baseVersion: allowedDeck.version,
        source: "user",
        operations: [
          {
            type: "add_animation",
            slideId: allowedDeck.slides[0]!.slideId,
            animation: {
              animationId: "anim_first_imported",
              elementId: allowedDeck.slides[0]!.elements[0]!.elementId,
              type: "fade-in",
              order: 1,
              durationMs: 500,
              delayMs: 0,
              easing: "ease-out",
              startMode: "on-click",
            },
          },
        ],
      },
    });
    expect(allowedFixture.dataSource.patchRows).toHaveLength(1);

    const blockedFixture = createOoxmlSyncService("job_sync_animation_partial");
    const blockedDeck = deckSchema.parse({
      ...createImportedDeck(),
      projectId: "project_animation_partial",
      deckId: "deck_animation_partial",
      slides: [
        {
          ...createImportedDeck().slides[0]!,
          ooxmlMotionCapabilities: {
            transitionWritable: true,
            importedMainSequenceCoverage: "partial",
          },
        },
      ],
    });
    await blockedFixture.service.putDeck(blockedDeck.projectId, {
      deck: blockedDeck,
    });
    seedOoxmlBlueprint(blockedFixture.dataSource, blockedDeck);

    const blocked = await expectDeckApiError(
      () =>
        blockedFixture.service.appendPatch(blockedDeck.projectId, {
          patch: {
            deckId: blockedDeck.deckId,
            baseVersion: blockedDeck.version,
            source: "user",
            operations: [
              {
                type: "add_animation",
                slideId: blockedDeck.slides[0]!.slideId,
                animation: {
                  animationId: "anim_blocked_partial",
                  elementId: blockedDeck.slides[0]!.elements[0]!.elementId,
                  type: "fade-in",
                  order: 1,
                  durationMs: 500,
                  delayMs: 0,
                  easing: "ease-out",
                  startMode: "on-click",
                },
              },
            ],
          },
        }),
      HttpStatus.BAD_REQUEST,
      "OOXML_CHANGE_UNSUPPORTED",
    );
    expect(blocked.details).toContain(
      "reasonCode=MOTION_REFERENCE_COVERAGE_UNSAFE",
    );
    expect(blockedFixture.dataSource.patchRows).toHaveLength(0);
  });

  it("materializes animations removed implicitly by an imported element deletion", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_delete_animation_cascade",
    );
    const imported = createImportedDeck();
    const target = imported.slides[0]!.elements[0]!;
    const deck = deckSchema.parse({
      ...imported,
      slides: [
        {
          ...imported.slides[0]!,
          animations: [
            {
              animationId: "anim_deleted_with_element",
              elementId: target.elementId,
              type: "fade-in",
              order: 1,
              durationMs: 500,
              delayMs: 0,
              easing: "ease-out",
              startMode: "on-click",
            },
          ],
        },
      ],
    });
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck);

    const result = await service.appendPatch(deck.projectId, {
      patch: {
        deckId: deck.deckId,
        baseVersion: deck.version,
        source: "user",
        operations: [
          {
            type: "delete_element",
            slideId: deck.slides[0]!.slideId,
            elementId: target.elementId,
          },
        ],
      },
    });

    expect(result.changeRecord.operations).toEqual([
      {
        type: "delete_animation",
        slideId: deck.slides[0]!.slideId,
        animationId: "anim_deleted_with_element",
      },
      {
        type: "delete_element",
        slideId: deck.slides[0]!.slideId,
        elementId: target.elementId,
      },
    ]);
    expect(dataSource.patchRows[0]?.operations).toEqual(
      result.changeRecord.operations,
    );
    expect(result.deck.slides[0]!.animations).toEqual([]);
  });

  it("emits full-save transition and animation changes as motion patch operations", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_motion_full_put",
    );
    const imported = createImportedDeck();
    const deck = deckSchema.parse({
      ...imported,
      slides: [
        {
          ...imported.slides[0]!,
          ooxmlMotionCapabilities: {
            transitionWritable: true,
            importedMainSequenceCoverage: "complete",
          },
          transition: { type: "fade", durationMs: 500 },
          animations: [
            {
              animationId: "anim_existing",
              elementId: imported.slides[0]!.elements[0]!.elementId,
              type: "fade-in",
              order: 1,
              durationMs: 500,
              delayMs: 0,
              easing: "ease-out",
              startMode: "on-click",
            },
          ],
        },
      ],
    });
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck);

    await service.putDeck(deck.projectId, {
      baseVersion: deck.version,
      deck: {
        ...deck,
        slides: [
          {
            ...deck.slides[0]!,
            transition: { type: "fade", durationMs: 700 },
            animations: [
              {
                ...deck.slides[0]!.animations[0]!,
                durationMs: 900,
                startMode: "after-previous",
              },
            ],
          },
        ],
      },
    });

    expect(dataSource.patchRows[0]?.operations).toEqual(
      expect.arrayContaining([
        {
          type: "update_slide_transition",
          slideId: deck.slides[0]!.slideId,
          transition: { type: "fade", durationMs: 700 },
        },
        expect.objectContaining({
          type: "update_animation",
          slideId: deck.slides[0]!.slideId,
          animationId: "anim_existing",
          animation: expect.objectContaining({
            durationMs: 900,
            startMode: "after-previous",
          }),
        }),
      ]),
    );
  });

  it("emits a motion operation when a full save reorders equal-order animations", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_motion_full_put_reorder",
    );
    const imported = createImportedDeck();
    const targetId = imported.slides[0]!.elements[0]!.elementId;
    const animations = [
      {
        animationId: "anim_reorder_a",
        elementId: targetId,
        type: "fade-in" as const,
        order: 1,
        durationMs: 500,
        delayMs: 0,
        easing: "ease-out" as const,
        startMode: "on-click" as const,
      },
      {
        animationId: "anim_reorder_b",
        elementId: targetId,
        type: "appear" as const,
        order: 1,
        durationMs: 300,
        delayMs: 0,
        easing: "linear" as const,
        startMode: "on-click" as const,
      },
    ];
    const deck = deckSchema.parse({
      ...imported,
      slides: [
        {
          ...imported.slides[0]!,
          ooxmlMotionCapabilities: {
            transitionWritable: true,
            importedMainSequenceCoverage: "complete",
          },
          animations,
        },
      ],
    });
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck);

    await service.putDeck(deck.projectId, {
      baseVersion: deck.version,
      deck: {
        ...deck,
        slides: [
          {
            ...deck.slides[0]!,
            animations: [...animations].reverse(),
          },
        ],
      },
    });

    expect(dataSource.patchRows[0]?.operations).toEqual([
      expect.objectContaining({
        type: "update_animation",
        slideId: deck.slides[0]!.slideId,
        animationId: "anim_reorder_b",
      }),
    ]);
  });

  it("refreshes motion targets when a full save replaces an element type", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_motion_full_put_target_replace",
    );
    const imported = createImportedDeck();
    const target = imported.slides[0]!.elements[0]!;
    const deck = deckSchema.parse({
      ...imported,
      slides: [
        {
          ...imported.slides[0]!,
          animations: [
            {
              animationId: "anim_replaced_target",
              elementId: target.elementId,
              type: "fade-in",
              order: 1,
              durationMs: 500,
              delayMs: 0,
              easing: "ease-out",
              startMode: "on-click",
            },
          ],
        },
      ],
    });
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck);

    await service.putDeck(deck.projectId, {
      baseVersion: deck.version,
      deck: {
        ...deck,
        slides: [
          {
            ...deck.slides[0]!,
            elements: [
              {
                elementId: target.elementId,
                type: "rect",
                role: target.role,
                x: target.x,
                y: target.y,
                width: target.width,
                height: target.height,
                rotation: target.rotation,
                opacity: target.opacity,
                zIndex: target.zIndex,
                locked: target.locked,
                visible: target.visible,
                props: {
                  fill: "#2563eb",
                  stroke: "transparent",
                  strokeWidth: 0,
                  cornerRadius: 0,
                },
              },
            ],
          },
        ],
      },
    });

    expect(dataSource.patchRows[0]?.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "update_animation",
          animationId: "anim_replaced_target",
        }),
        expect.objectContaining({
          type: "delete_element",
          elementId: target.elementId,
        }),
        expect.objectContaining({
          type: "add_element",
          element: expect.objectContaining({
            elementId: target.elementId,
            type: "rect",
          }),
        }),
      ]),
    );
  });

  it("allows an authored element delete only with safe motion coverage", async () => {
    const imported = createImportedDeck();
    const authored = {
      ...createTextElement("el_authored_delete", "Authored"),
      ooxmlOrigin: "authored" as const,
    };
    const completeDeck = deckSchema.parse({
      ...imported,
      projectId: "project_authored_delete_complete",
      deckId: "deck_authored_delete_complete",
      slides: [
        {
          ...imported.slides[0]!,
          ooxmlMotionCapabilities: {
            transitionWritable: true,
            importedMainSequenceCoverage: "complete",
          },
          elements: [...imported.slides[0]!.elements, authored],
        },
      ],
    });
    const completeFixture = createOoxmlSyncService(
      "job_sync_authored_delete_complete",
    );
    await completeFixture.service.putDeck(completeDeck.projectId, {
      deck: completeDeck,
    });
    seedOoxmlBlueprint(completeFixture.dataSource, completeDeck);

    await completeFixture.service.appendPatch(completeDeck.projectId, {
      patch: {
        deckId: completeDeck.deckId,
        baseVersion: completeDeck.version,
        source: "user",
        operations: [
          {
            type: "delete_element",
            slideId: completeDeck.slides[0]!.slideId,
            elementId: authored.elementId,
          },
        ],
      },
    });
    expect(completeFixture.dataSource.patchRows[0]?.operations).toEqual([
      expect.objectContaining({
        type: "delete_element",
        elementId: authored.elementId,
      }),
    ]);

    const partialDeck = deckSchema.parse({
      ...completeDeck,
      projectId: "project_authored_delete_partial",
      deckId: "deck_authored_delete_partial",
      slides: [
        {
          ...completeDeck.slides[0]!,
          ooxmlMotionCapabilities: {
            transitionWritable: true,
            importedMainSequenceCoverage: "partial",
          },
        },
      ],
    });
    const partialFixture = createOoxmlSyncService(
      "job_sync_authored_delete_partial",
    );
    await partialFixture.service.putDeck(partialDeck.projectId, {
      deck: partialDeck,
    });
    seedOoxmlBlueprint(partialFixture.dataSource, partialDeck);

    const error = await expectDeckApiError(
      () =>
        partialFixture.service.appendPatch(partialDeck.projectId, {
          patch: {
            deckId: partialDeck.deckId,
            baseVersion: partialDeck.version,
            source: "user",
            operations: [
              {
                type: "delete_element",
                slideId: partialDeck.slides[0]!.slideId,
                elementId: authored.elementId,
              },
            ],
          },
        }),
      HttpStatus.BAD_REQUEST,
      "OOXML_CHANGE_UNSUPPORTED",
    );
    expect(error.details).toContain(
      "reasonCode=MOTION_REFERENCE_COVERAGE_UNSAFE",
    );
  });

  it("rejects inconsistent authored text additions before persistence", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_authored_projection",
    );
    const deck = createImportedDeck({
      richText: "full",
      crop: "none",
      tableCellText: false,
      frame: true,
      delete: false,
    });
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck);

    const baseElement = createTextElement("el_inconsistent_authored", "A");
    const inconsistent = {
      ...baseElement,
      ooxmlOrigin: "authored" as const,
      props: {
        ...baseElement.props,
        text: "A",
        runs: [],
        paragraphs: [
          {
            text: "B",
            runs: [{ text: "B", baseline: "normal" as const }],
            align: "left" as const,
            lineHeight: 1.2,
            spaceBefore: 0,
            spaceAfter: 0,
            indent: 0,
          },
        ],
      },
    };
    const addOperation = {
      type: "add_element" as const,
      slideId: deck.slides[0]!.slideId,
      element: inconsistent,
    };

    for (const action of [
      () =>
        service.appendPatch(deck.projectId, {
          patch: {
            deckId: deck.deckId,
            baseVersion: deck.version,
            source: "user",
            operations: [addOperation],
          },
        }),
      () =>
        service.putDeck(deck.projectId, {
          baseVersion: deck.version,
          deck: {
            ...deck,
            slides: [
              {
                ...deck.slides[0]!,
                elements: [...deck.slides[0]!.elements, inconsistent],
              },
            ],
          },
        }),
    ]) {
      const error = await expectDeckApiError(
        action,
        HttpStatus.BAD_REQUEST,
        "OOXML_CHANGE_UNSUPPORTED",
      );
      expect(error.details).toContain(
        "reasonCode=ADD_ELEMENT_SERIALIZER_UNSUPPORTED",
      );
    }
    expect(dataSource.patchRows).toHaveLength(0);
    expect(dataSource.decks.get(deck.projectId)).toMatchObject({ version: 1 });

    const consistent = {
      ...inconsistent,
      elementId: "el_consistent_authored",
      props: {
        ...inconsistent.props,
        text: "A",
        paragraphs: [
          {
            ...inconsistent.props.paragraphs[0]!,
            text: "A",
            runs: [],
          },
        ],
      },
    };
    await service.appendPatch(deck.projectId, {
      patch: {
        deckId: deck.deckId,
        baseVersion: deck.version,
        source: "user",
        operations: [
          {
            type: "add_element",
            slideId: deck.slides[0]!.slideId,
            element: consistent,
          },
        ],
      },
    });

    expect(dataSource.decks.get(deck.projectId)).toMatchObject({ version: 2 });
    expect(dataSource.patchRows).toHaveLength(1);
  });

  it("rejects an unsupported imported full diff but allows package-neutral fields", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_neutral_full_put",
    );
    const deck = createImportedDeck({
      richText: "full",
      crop: "none",
      tableCellText: false,
      frame: true,
      delete: false,
    });
    await service.putDeck(deck.projectId, { deck });
    seedOoxmlBlueprint(dataSource, deck);

    await expectDeckApiError(
      () =>
        service.putDeck(deck.projectId, {
          baseVersion: deck.version,
          deck: {
            ...deck,
            slides: [{ ...deck.slides[0]!, elements: [] }],
          },
        }),
      HttpStatus.BAD_REQUEST,
      "OOXML_CHANGE_UNSUPPORTED",
    );
    expect(dataSource.patchRows).toHaveLength(0);
    expect(dataSource.decks.get(deck.projectId)).toMatchObject({ version: 1 });

    const response = await service.putDeck(deck.projectId, {
      baseVersion: deck.version,
      deck: {
        ...deck,
        title: "Package-neutral title",
        targetDurationMinutes: 12,
        slides: [
          {
            ...deck.slides[0]!,
            title: "Package-neutral slide title",
            speakerNotes: "Package-neutral speaker notes",
          },
        ],
      },
    });

    expect(response.deck).toMatchObject({
      version: 2,
      title: "Package-neutral title",
      targetDurationMinutes: 12,
    });
    expect(response.deck.slides[0]).toMatchObject({
      title: "Package-neutral slide title",
      speakerNotes: "Package-neutral speaker notes",
    });
  });

  it("preserves imported provenance and marks full-save additions as authored", async () => {
    const { dataSource, service } = createService();
    const base = createDeck();
    const imported = deckSchema.parse({
      ...base,
      metadata: { ...base.metadata, sourceType: "import" },
      slides: [
        {
          ...base.slides[0]!,
          ooxmlOrigin: "imported",
          ooxmlMotionCapabilities: {
            transitionWritable: false,
            importedMainSequenceCoverage: "partial",
          },
          elements: [
            {
              ...createTextElement("el_imported", "Before"),
              ooxmlOrigin: "imported",
              ooxmlEditCapabilities: {
                richText: "full",
                crop: "none",
                tableCellText: false,
                frame: false,
                delete: false,
              },
            },
          ],
        },
      ],
    });
    await service.putDeck(imported.projectId, { deck: imported });
    seedOoxmlBlueprint(dataSource, imported, imported.version, [
      createTextElementSource(imported.slides[0]!.elements[0]!, "full"),
    ]);

    const requested = deckSchema.parse({
      ...imported,
      title: "Full save with element audit",
      metadata: { ...imported.metadata, sourceType: "manual" },
      slides: [
        {
          ...imported.slides[0]!,
          ooxmlOrigin: "authored",
          ooxmlMotionCapabilities: {
            transitionWritable: true,
            importedMainSequenceCoverage: "complete",
          },
          elements: [
            {
              ...imported.slides[0]!.elements[0]!,
              ooxmlOrigin: "authored",
              ooxmlEditCapabilities: {
                richText: "full",
                crop: "picture",
                tableCellText: true,
              },
              props: {
                ...imported.slides[0]!.elements[0]!.props,
                text: "After",
              },
            },
            {
              ...createTextElement("el_new", "New"),
              ooxmlOrigin: "imported",
              ooxmlEditCapabilities: {
                richText: "full",
                crop: "picture",
                tableCellText: true,
              },
            },
          ],
        },
      ],
    });

    const response = await service.putDeck(imported.projectId, {
      baseVersion: imported.version,
      deck: requested,
    });

    expect(response.deck.metadata.sourceType).toBe("import");
    expect(response.deck.title).toBe("Full save with element audit");
    expect(response.deck.slides[0]).toMatchObject({
      ooxmlOrigin: "imported",
      ooxmlMotionCapabilities: {
        transitionWritable: false,
        importedMainSequenceCoverage: "partial",
      },
    });
    expect(response.deck.slides[0]!.elements[0]).toMatchObject({
      ooxmlOrigin: "imported",
      ooxmlEditCapabilities: {
        richText: "full",
        crop: "none",
        tableCellText: false,
        frame: false,
        delete: false,
      },
    });
    expect(response.deck.slides[0]!.elements[1]).toMatchObject({
      elementId: "el_new",
      ooxmlOrigin: "authored",
    });
    expect(
      response.deck.slides[0]!.elements[1]!.ooxmlEditCapabilities,
    ).toBeUndefined();
    expect(dataSource.patchRows[0]?.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "update_deck",
          title: "Full save with element audit",
        }),
        expect.objectContaining({
          type: "update_element_props",
          elementId: "el_imported",
        }),
        expect.objectContaining({
          type: "add_element",
          element: expect.objectContaining({ elementId: "el_new" }),
        }),
      ]),
    );
  });

  it("marks client-supplied imported add operations as authored", async () => {
    const { dataSource, service } = createService();
    const deck = createDeck();
    await service.putDeck(deck.projectId, { deck });
    dataSource.templateBlueprintRows.push({
      template_id: "template_file_1",
      project_id: deck.projectId,
      deck_id: deck.deckId,
      blueprint_json: {
        templateId: "template_file_1",
        sourceFileId: "file_1",
        currentPackageFileId: "file_current",
        ooxmlSyncedDeckVersion: 1,
        slides: [{ slideIndex: 1, sourceSlideIndex: 1, slots: [] }],
      },
    });

    const maliciousCapabilities = {
      richText: "full" as const,
      crop: "picture" as const,
      tableCellText: true,
    };
    await service.appendPatch(deck.projectId, {
      patch: {
        deckId: deck.deckId,
        baseVersion: deck.version,
        source: "user",
        operations: [
          {
            type: "add_element",
            slideId: deck.slides[0]!.slideId,
            element: {
              ...createTextElement("el_added", "Added"),
              ooxmlOrigin: "imported",
              ooxmlEditCapabilities: maliciousCapabilities,
            },
          },
          {
            type: "add_slide",
            slide: {
              slideId: "slide_added",
              order: 2,
              title: "Added",
              ooxmlOrigin: "imported",
              ooxmlMotionCapabilities: {
                transitionWritable: true,
                importedMainSequenceCoverage: "complete",
              },
              elements: [
                {
                  ...createTextElement("el_slide_added", "Added slide"),
                  ooxmlOrigin: "imported",
                  ooxmlEditCapabilities: maliciousCapabilities,
                },
              ],
            },
          },
        ],
      },
    });

    const storedDeck = deckSchema.parse(
      dataSource.decks.get(deck.projectId)?.deck_json,
    );
    expect(storedDeck.slides[0]!.elements[0]).toMatchObject({
      elementId: "el_added",
      ooxmlOrigin: "authored",
    });
    expect(
      storedDeck.slides[0]!.elements[0]!.ooxmlEditCapabilities,
    ).toBeUndefined();
    expect(storedDeck.slides[1]).toMatchObject({
      slideId: "slide_added",
      ooxmlOrigin: "authored",
    });
    expect(storedDeck.slides[1]!.ooxmlMotionCapabilities).toBeUndefined();
    expect(storedDeck.slides[1]!.elements[0]).toMatchObject({
      ooxmlOrigin: "authored",
    });
    expect(
      storedDeck.slides[1]!.elements[0]!.ooxmlEditCapabilities,
    ).toBeUndefined();
  });

  it("diffs equal element IDs independently across imported slides", async () => {
    const { dataSource, service } = createService();
    const base = createDeck();
    const current = deckSchema.parse({
      ...base,
      version: 2,
      slides: [
        {
          ...base.slides[0],
          elements: [createTextElement("el_shared", "First slide")],
        },
        {
          ...base.slides[0],
          slideId: "slide_second",
          order: 2,
          title: "Second slide",
          elements: [createTextElement("el_shared", "Before")],
        },
      ],
    });
    await service.putDeck(current.projectId, { deck: current });
    dataSource.templateBlueprintRows.push({
      template_id: "template_file_1",
      project_id: current.projectId,
      deck_id: current.deckId,
      blueprint_json: {
        templateId: "template_file_1",
        sourceFileId: "file_1",
        currentPackageFileId: "file_current",
        ooxmlSyncedDeckVersion: 2,
        slides: [
          { slideIndex: 1, sourceSlideIndex: 1, slots: [] },
          { slideIndex: 2, sourceSlideIndex: 2, slots: [] },
        ],
      },
    });
    const requested = deckSchema.parse({
      ...current,
      slides: [
        current.slides[0],
        {
          ...current.slides[1],
          elements: [createTextElement("el_shared", "After", 180)],
        },
      ],
    });

    await service.putDeck(current.projectId, {
      baseVersion: current.version,
      deck: requested,
    });

    expect(dataSource.patchRows).toHaveLength(1);
    expect(dataSource.patchRows[0]?.operations).toEqual([
      expect.objectContaining({
        type: "update_element_frame",
        slideId: "slide_second",
        elementId: "el_shared",
      }),
      expect.objectContaining({
        type: "update_element_props",
        slideId: "slide_second",
        elementId: "el_shared",
        props: expect.objectContaining({ text: "After" }),
      }),
      {
        type: "replace_semantic_cues",
        slideId: "slide_second",
        semanticCues: [],
      },
    ]);
  });

  it("persists every imported patch and retains unsynced patch history", async () => {
    const { dataSource, service } = createService();
    const deck = createDeck();
    await service.putDeck(deck.projectId, { deck });
    dataSource.templateBlueprintRows.push({
      template_id: "template_file_1",
      project_id: deck.projectId,
      deck_id: deck.deckId,
      blueprint_json: {
        templateId: "template_file_1",
        sourceFileId: "file_1",
        currentPackageFileId: "file_current",
        ooxmlSyncedDeckVersion: 1,
        slides: [{ slideIndex: 1, sourceSlideIndex: 1, slots: [] }],
      },
    });

    const firstResponse = await service.appendPatch(deck.projectId, {
      patch: {
        deckId: deck.deckId,
        baseVersion: 1,
        source: "user",
        operations: [
          {
            type: "add_element",
            slideId: deck.slides[0]!.slideId,
            element: createTextElement("el_unsynced", "Unsynced"),
          },
        ],
      },
    });
    const secondResponse = await service.appendPatch(deck.projectId, {
      patch: createUpdateTitlePatch(
        firstResponse.deck,
        "Imported deck second patch",
      ),
    });
    const fullResponse = await service.putDeck(deck.projectId, {
      baseVersion: secondResponse.deck.version,
      deck: {
        ...secondResponse.deck,
        title: "Imported deck full save",
        version: 1,
      },
    });

    expect(firstResponse.deck.version).toBe(2);
    expect(secondResponse.deck.version).toBe(3);
    expect(fullResponse.deck.version).toBe(4);
    expect(dataSource.decks.get(deck.projectId)).toMatchObject({
      version: 4,
      deck_json: expect.objectContaining({
        title: "Imported deck full save",
        version: 4,
      }),
    });
    expect(dataSource.patchRows.map((row) => row.after_version)).toEqual([
      2, 3, 4,
    ]);
  });

  it("enqueues PPTX export with the current deck snapshot", async () => {
    stubOrbitEnv();
    const dataSource = new InMemoryDeckDataSource();
    const deck = createDeck();
    const exportJob = createJob("job_export_1", "deck-export");
    const jobsService = {
      create: vi.fn(async () => exportJob),
      update: vi.fn(),
    };
    const enqueueExportJob = vi.fn(async () => undefined);
    const service = new DecksService(
      dataSource as unknown as DataSource,
      jobsService as never,
      vi.fn(async () => undefined),
      enqueueExportJob,
    );

    await service.putDeck(deck.projectId, { deck });
    const response = await service.createExportJob(deck.projectId, {
      format: "pptx",
    });

    expect(response.job.jobId).toBe(exportJob.jobId);
    expect(jobsService.create).toHaveBeenCalledWith({
      projectId: deck.projectId,
      type: "deck-export",
      payload: {
        deckId: deck.deckId,
        format: "pptx",
      },
    });
    expect(enqueueExportJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: exportJob.jobId,
        projectId: deck.projectId,
        deck: expect.objectContaining({
          deckId: deck.deckId,
          slides: deck.slides,
        }),
        format: "pptx",
      }),
    );
  });

  it("authorizes and forwards the selected presentation session for export", async () => {
    stubOrbitEnv();
    const dataSource = new InMemoryDeckDataSource();
    dataSource.exportSessionIds.add("session_export_1");
    const deck = createDeck();
    const exportJob = createJob("job_export_session_1", "deck-export");
    const jobsService = {
      create: vi.fn(async () => exportJob),
      update: vi.fn(),
    };
    const enqueueExportJob = vi.fn(async () => undefined);
    const service = new DecksService(
      dataSource as unknown as DataSource,
      jobsService as never,
      vi.fn(async () => undefined),
      enqueueExportJob,
    );
    await service.putDeck(deck.projectId, { deck });

    await service.createExportJob(deck.projectId, {
      format: "pptx",
      presentationSessionId: "session_export_1",
    });

    expect(jobsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          presentationSessionId: "session_export_1",
        }),
      }),
    );
    expect(enqueueExportJob).toHaveBeenCalledWith(
      expect.objectContaining({ presentationSessionId: "session_export_1" }),
    );
  });

  it("rejects an export session outside the current project boundary", async () => {
    stubOrbitEnv();
    const dataSource = new InMemoryDeckDataSource();
    const deck = createDeck();
    const jobsService = { create: vi.fn(), update: vi.fn() };
    const service = new DecksService(
      dataSource as unknown as DataSource,
      jobsService as never,
      vi.fn(async () => undefined),
      vi.fn(async () => undefined),
    );
    await service.putDeck(deck.projectId, { deck });

    await expect(
      service.createExportJob(deck.projectId, {
        format: "pptx",
        presentationSessionId: "session_other_project",
      }),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    expect(jobsService.create).not.toHaveBeenCalled();
  });

  it("persists and enqueues OOXML sync for thumbnail-only system patches", async () => {
    stubOrbitEnv();
    const dataSource = new InMemoryDeckDataSource();
    const deck = createDeck();
    const syncJob = createJob("job_sync_thumbnail");
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
        source: "system",
        operations: [
          {
            type: "update_slide",
            slideId: deck.slides[0]!.slideId,
            thumbnailUrl:
              "/api/v1/projects/project_demo_1/assets/file_thumb/content",
          },
          {
            type: "update_deck",
            metadata: {
              thumbnailSource: "canvas",
            },
          },
        ],
      },
      responseMode: "ack",
    });

    expect(response.ooxmlSyncJob?.jobId).toBe(syncJob.jobId);
    expect(response.version).toBe(2);
    expect(response).not.toHaveProperty("deck");
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
        deckId: deck.deckId,
        changeId: response.changeRecord.changeId,
        targetDeckVersion: 2,
      }),
    );
    expect(dataSource.decks.get(deck.projectId)).toMatchObject({
      version: 2,
      deck_json: expect.objectContaining({
        version: 2,
        metadata: expect.objectContaining({ thumbnailSource: "canvas" }),
        slides: [
          expect.objectContaining({
            thumbnailUrl:
              "/api/v1/projects/project_demo_1/assets/file_thumb/content",
          }),
        ],
      }),
    });
    expect(dataSource.patchRows.map((row) => row.after_version)).toEqual([2]);
  });

  it("creates and enqueues a semantic cue extraction preparation job", async () => {
    stubOrbitEnv();
    const dataSource = new InMemoryDeckDataSource();
    const deck = createDeck();
    const semanticCueJob = createJob(
      "job_semantic_cues_1",
      "semantic-cue-extraction",
    );
    const jobsService = {
      create: vi.fn(async () => semanticCueJob),
      update: vi.fn(),
    };
    const enqueueSyncJob = vi.fn(async () => undefined);
    const enqueueSemanticCueJob = vi.fn(async () => undefined);
    const logger = createLogger();
    const service = new DecksService(
      dataSource as unknown as DataSource,
      jobsService as never,
      enqueueSyncJob,
      undefined,
      enqueueSemanticCueJob,
      logger,
    );

    await service.putDeck(deck.projectId, { deck });
    await service.appendPatch(deck.projectId, {
      patch: createUpdateTitlePatch(deck, "enqueue 직전 편집"),
    });
    expect(dataSource.patchRows).toHaveLength(1);
    const response = await service.createSemanticCueExtractionJob(
      deck.projectId,
      {
        force: true,
      },
    );

    expect(response.job.jobId).toBe(semanticCueJob.jobId);
    expect(jobsService.create).toHaveBeenCalledWith({
      projectId: deck.projectId,
      type: "semantic-cue-extraction",
      payload: {
        request: {
          deckId: deck.deckId,
          force: true,
          baseVersion: 2,
        },
      },
    });
    expect(enqueueSemanticCueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        driver: "bullmq",
        redisUrl: "redis://localhost:6379",
        jobId: semanticCueJob.jobId,
        projectId: deck.projectId,
        request: {
          deckId: deck.deckId,
          force: true,
          baseVersion: 2,
        },
      }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "semantic_cue.extraction.queued",
        jobId: semanticCueJob.jobId,
        projectId: deck.projectId,
        deckId: deck.deckId,
        deckVersion: 2,
      }),
      "Semantic cue extraction job enqueued.",
    );
    expect(dataSource.patchRows).toEqual([]);
    expect(dataSource.decks.get(deck.projectId)).toMatchObject({
      version: 2,
      deck_json: expect.objectContaining({
        title: "enqueue 직전 편집",
        version: 2,
      }),
    });
    expect(
      dataSource.executedQueries.some(
        (query) =>
          query.includes("FROM deck_patches") && query.includes("FOR UPDATE"),
      ),
    ).toBe(true);
    expect(enqueueSyncJob).not.toHaveBeenCalled();
  });

  it("creates a speaker notes suggestion job with IDs only", async () => {
    stubOrbitEnv();
    const dataSource = new InMemoryDeckDataSource();
    const deck = createDeck();
    const suggestionJob = createJob(
      "job_speaker_notes_1",
      "speaker-notes-suggestion",
    );
    const jobsService = {
      create: vi.fn(async () => suggestionJob),
      update: vi.fn(),
    };
    const enqueueSuggestion = vi.fn(async () => undefined);
    const service = new DecksService(
      dataSource as unknown as DataSource,
      jobsService as never,
      undefined,
      undefined,
      undefined,
      createLogger(),
      enqueueSuggestion,
    );

    await service.putDeck(deck.projectId, { deck });
    const response = await service.createSpeakerNotesSuggestionJob(
      deck.projectId,
      {
        deckId: deck.deckId,
        slideId: deck.slides[0]!.slideId,
        baseVersion: deck.version,
        mode: "draft",
      },
    );

    expect(response.job.jobId).toBe(suggestionJob.jobId);
    expect(jobsService.create).toHaveBeenCalledWith({
      projectId: deck.projectId,
      type: "speaker-notes-suggestion",
      payload: {
        request: {
          deckId: deck.deckId,
          slideId: deck.slides[0]!.slideId,
          baseVersion: deck.version,
          mode: "draft",
        },
      },
    });
    expect(enqueueSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: suggestionJob.jobId,
        projectId: deck.projectId,
        request: {
          deckId: deck.deckId,
          slideId: deck.slides[0]!.slideId,
          baseVersion: deck.version,
          mode: "draft",
        },
      }),
    );
    expect(JSON.stringify(enqueueSuggestion.mock.calls)).not.toContain(
      "speakerNotes",
    );
  });

  it("rejects a refinement mode when speaker notes are empty", async () => {
    const dataSource = new InMemoryDeckDataSource();
    const deck = createDeck();
    const jobsService = { create: vi.fn(), update: vi.fn() };
    const service = new DecksService(
      dataSource as unknown as DataSource,
      jobsService as never,
    );
    await service.putDeck(deck.projectId, { deck });

    await expect(
      service.createSpeakerNotesSuggestionJob(deck.projectId, {
        deckId: deck.deckId,
        slideId: deck.slides[0]!.slideId,
        baseVersion: deck.version,
        mode: "naturalize",
      }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    expect(jobsService.create).not.toHaveBeenCalled();
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
    const snapshots = await service.listSnapshots(deck.projectId);
    expect(snapshots.snapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: "snapshot-restore",
          version: 2,
        }),
      ]),
    );
    expect(
      dataSource.snapshotRows.find(
        (snapshot) => snapshot.reason === "snapshot-restore",
      )?.deck_json,
    ).toMatchObject({ title: "수정된 덱", version: 2 });
    expect(dataSource.patchRows).toHaveLength(0);
    expect(
      dataSource.executedQueries.some((query) =>
        query.includes("WHERE project_id = $1 AND deck_id = $2 FOR UPDATE"),
      ),
    ).toBe(true);
  });

  it("restores an OOXML-backed snapshot as the next version and enqueues sync", async () => {
    stubOrbitEnv();
    const dataSource = new InMemoryDeckDataSource();
    const syncJob = createJob("job_sync_restore");
    const jobsService = {
      create: vi.fn(async () => syncJob),
      update: vi.fn(),
    };
    const enqueueSyncJob = vi.fn(async () => undefined);
    const logger = createLogger();
    const service = new DecksService(
      dataSource as unknown as DataSource,
      jobsService as never,
      enqueueSyncJob,
      undefined,
      undefined,
      logger,
    );
    const snapshotDeck = createDeck();
    const currentDeck = deckSchema.parse({
      ...snapshotDeck,
      title: "Current imported deck",
      version: 3,
    });
    seedStoredDeck(dataSource, currentDeck, currentDeck);
    dataSource.snapshotRows.push({
      snapshot_id: "snapshot_imported_restore_1",
      project_id: snapshotDeck.projectId,
      deck_id: snapshotDeck.deckId,
      deck_json: cloneJson(snapshotDeck),
      version: snapshotDeck.version,
      reason: "deck-replaced",
      created_at: "2026-07-10T00:00:00.000Z",
    });
    dataSource.templateBlueprintRows.push({
      template_id: "template_file_1",
      project_id: currentDeck.projectId,
      deck_id: currentDeck.deckId,
      blueprint_json: {
        templateId: "template_file_1",
        sourceFileId: "file_1",
        currentPackageFileId: "file_current",
        ooxmlSyncedDeckVersion: 3,
        slides: [{ slideIndex: 1, sourceSlideIndex: 1, slots: [] }],
      },
    });

    const response = await service.restoreSnapshot(
      currentDeck.projectId,
      "snapshot_imported_restore_1",
    );

    expect(response).toMatchObject({
      deck: { title: snapshotDeck.title, version: 4 },
      restoredSnapshot: { version: 1 },
      ooxmlSyncJob: { jobId: syncJob.jobId, status: "queued" },
    });
    expect(dataSource.decks.get(currentDeck.projectId)).toMatchObject({
      version: 4,
      deck_json: expect.objectContaining({
        title: snapshotDeck.title,
        version: 4,
      }),
    });
    expect(dataSource.patchRows).toEqual([
      expect.objectContaining({ before_version: 3, after_version: 4 }),
    ]);
    expect(jobsService.create).toHaveBeenCalledWith({
      projectId: currentDeck.projectId,
      type: "pptx-ooxml-sync",
      payload: {
        deckId: currentDeck.deckId,
        changeId: "change_deck_demo_1_4_put",
        targetDeckVersion: 4,
      },
    });
    expect(enqueueSyncJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: syncJob.jobId,
        deckId: currentDeck.deckId,
        targetDeckVersion: 4,
      }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      {
        event: "pptx_ooxml.sync.queued",
        jobId: syncJob.jobId,
        projectId: currentDeck.projectId,
        deckId: currentDeck.deckId,
        targetDeckVersion: 4,
      },
      "PPTX OOXML sync job enqueued.",
    );
  });

  it("restores package-neutral fields from an OOXML-backed snapshot", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_neutral_restore",
    );
    const base = createDeck();
    const snapshotDeck = deckSchema.parse({
      ...base,
      title: "Historical deck title",
      metadata: { ...base.metadata, audience: "technical" },
      targetDurationMinutes: 12,
      slides: [
        {
          ...base.slides[0]!,
          title: "Historical slide title",
          thumbnailUrl: "https://example.com/historical-thumbnail.png",
          estimatedSeconds: 42,
          speakerNotes: "ORBIT 흐름을 설명합니다.",
          keywords: [
            {
              keywordId: "kw_restore_orbit",
              text: "ORBIT",
              synonyms: [],
              abbreviations: [],
              required: true,
            },
          ],
          actions: [
            {
              actionId: "act_restore_next",
              trigger: { kind: "cue", cue: "다음" },
              effect: { kind: "go-to-next-slide" },
            },
          ],
          semanticCues: [
            {
              cueId: "scue_restore_orbit",
              slideId: base.slides[0]!.slideId,
              meaning: "ORBIT의 발표 흐름",
              nliHypotheses: ["ORBIT의 발표 흐름을 설명한다."],
              triggerActionIds: ["act_restore_next"],
            },
          ],
          aiNotes: {
            emphasisPoints: ["복원된 강조점"],
            sourceEvidence: [],
          },
        },
      ],
    });
    const currentDeck = deckSchema.parse({
      ...snapshotDeck,
      title: "Current imported deck",
      version: 3,
      metadata: {
        ...snapshotDeck.metadata,
        sourceType: "import",
        audience: "executive",
      },
      targetDurationMinutes: 8,
      slides: [
        {
          ...snapshotDeck.slides[0]!,
          title: "Current slide title",
          thumbnailUrl: "",
          estimatedSeconds: 18,
          speakerNotes: "",
          keywords: [],
          actions: [],
          semanticCues: [],
          aiNotes: undefined,
        },
      ],
    });
    seedStoredDeck(dataSource, currentDeck, currentDeck);
    dataSource.snapshotRows.push({
      snapshot_id: "snapshot_ooxml_neutral_restore",
      project_id: snapshotDeck.projectId,
      deck_id: snapshotDeck.deckId,
      deck_json: cloneJson(snapshotDeck),
      version: snapshotDeck.version,
      reason: "deck-replaced",
      created_at: "2026-07-10T00:00:00.000Z",
    });
    seedOoxmlBlueprint(dataSource, currentDeck);

    const response = await service.restoreSnapshot(
      currentDeck.projectId,
      "snapshot_ooxml_neutral_restore",
    );

    expect(response.deck).toMatchObject({
      title: snapshotDeck.title,
      version: 4,
      metadata: {
        sourceType: "import",
        audience: "technical",
      },
      targetDurationMinutes: 12,
    });
    expect(response.deck.slides[0]).toMatchObject({
      title: "Historical slide title",
      thumbnailUrl: "https://example.com/historical-thumbnail.png",
      estimatedSeconds: 42,
      speakerNotes: "ORBIT 흐름을 설명합니다.",
      keywords: snapshotDeck.slides[0]!.keywords,
      semanticCues: snapshotDeck.slides[0]!.semanticCues,
      actions: snapshotDeck.slides[0]!.actions,
      aiNotes: snapshotDeck.slides[0]!.aiNotes,
    });
    expect(
      dataSource.decks.get(currentDeck.projectId)?.deck_json,
    ).toMatchObject({
      title: snapshotDeck.title,
      targetDurationMinutes: 12,
      slides: [
        expect.objectContaining({
          speakerNotes: "ORBIT 흐름을 설명합니다.",
          keywords: snapshotDeck.slides[0]!.keywords,
          semanticCues: snapshotDeck.slides[0]!.semanticCues,
          actions: snapshotDeck.slides[0]!.actions,
        }),
      ],
    });
    const operations = dataSource.patchRows[0]?.operations;
    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "update_deck",
          title: snapshotDeck.title,
          targetDurationMinutes: 12,
          metadata: { audience: "technical" },
        }),
        expect.objectContaining({
          type: "update_slide",
          slideId: snapshotDeck.slides[0]!.slideId,
          estimatedSeconds: 42,
          aiNotes: snapshotDeck.slides[0]!.aiNotes,
        }),
        expect.objectContaining({ type: "update_speaker_notes" }),
        expect.objectContaining({ type: "replace_keywords" }),
        expect.objectContaining({ type: "add_slide_action" }),
        expect.objectContaining({ type: "replace_semantic_cues" }),
      ]),
    );
    const replay = applyDeckPatch(
      currentDeck,
      {
        deckId: currentDeck.deckId,
        baseVersion: currentDeck.version,
        source: "user",
        operations: operations!,
      },
      { createdAt: "2026-07-10T00:00:01.000Z" },
    );
    expect(replay.ok).toBe(true);
    if (!replay.ok) throw new Error(replay.error.message);
    expect(replay.deck).toEqual(response.deck);
  });

  it("normalizes snapshot restore provenance from the current OOXML deck", async () => {
    const { dataSource, service } = createOoxmlSyncService(
      "job_sync_provenance_restore",
    );
    const base = createDeck();
    const importedCapabilities = {
      richText: "none" as const,
      crop: "none" as const,
      tableCellText: false,
    };
    const historicalCapabilities = {
      richText: "full" as const,
      crop: "picture" as const,
      tableCellText: true,
    };
    const snapshotDeck = deckSchema.parse({
      ...base,
      metadata: { ...base.metadata, sourceType: "manual" },
      slides: [
        {
          ...base.slides[0]!,
          ooxmlOrigin: "authored",
          ooxmlMotionCapabilities: {
            transitionWritable: true,
            importedMainSequenceCoverage: "complete",
          },
          elements: [
            {
              ...createTextElement("el_restore_existing", "Existing"),
              ooxmlOrigin: "authored",
              ooxmlEditCapabilities: historicalCapabilities,
            },
            {
              ...createTextElement(
                "el_restore_reintroduced",
                "Reintroduced",
                700,
              ),
              ooxmlOrigin: "imported",
              ooxmlEditCapabilities: historicalCapabilities,
            },
          ],
        },
      ],
    });
    const currentDeck = deckSchema.parse({
      ...snapshotDeck,
      version: 3,
      metadata: { ...snapshotDeck.metadata, sourceType: "import" },
      slides: [
        {
          ...snapshotDeck.slides[0]!,
          ooxmlOrigin: "imported",
          ooxmlMotionCapabilities: {
            transitionWritable: false,
            importedMainSequenceCoverage: "partial",
          },
          elements: [
            {
              ...snapshotDeck.slides[0]!.elements[0]!,
              ooxmlOrigin: "imported",
              ooxmlEditCapabilities: importedCapabilities,
            },
          ],
        },
      ],
    });
    seedStoredDeck(dataSource, currentDeck, currentDeck);
    dataSource.snapshotRows.push({
      snapshot_id: "snapshot_ooxml_provenance_restore",
      project_id: snapshotDeck.projectId,
      deck_id: snapshotDeck.deckId,
      deck_json: cloneJson(snapshotDeck),
      version: snapshotDeck.version,
      reason: "deck-replaced",
      created_at: "2026-07-10T00:00:00.000Z",
    });
    seedOoxmlBlueprint(dataSource, currentDeck);

    const response = await service.restoreSnapshot(
      currentDeck.projectId,
      "snapshot_ooxml_provenance_restore",
    );

    expect(response.deck.metadata.sourceType).toBe("import");
    expect(response.deck.slides[0]).toMatchObject({
      ooxmlOrigin: "imported",
      ooxmlMotionCapabilities: {
        transitionWritable: false,
        importedMainSequenceCoverage: "partial",
      },
    });
    expect(response.deck.slides[0]!.elements[0]).toMatchObject({
      elementId: "el_restore_existing",
      ooxmlOrigin: "imported",
      ooxmlEditCapabilities: importedCapabilities,
    });
    expect(response.deck.slides[0]!.elements[1]).toMatchObject({
      elementId: "el_restore_reintroduced",
      ooxmlOrigin: "authored",
    });
    expect(
      response.deck.slides[0]!.elements[1]!.ooxmlEditCapabilities,
    ).toBeUndefined();
    const storedDeck = deckSchema.parse(
      dataSource.decks.get(currentDeck.projectId)?.deck_json,
    );
    expect(storedDeck.slides[0]!.elements[0]).toMatchObject({
      elementId: "el_restore_existing",
      ooxmlOrigin: "imported",
      ooxmlEditCapabilities: importedCapabilities,
    });
    expect(storedDeck.slides[0]!.elements[1]).toMatchObject({
      elementId: "el_restore_reintroduced",
      ooxmlOrigin: "authored",
    });
    expect(
      storedDeck.slides[0]!.elements[1]!.ooxmlEditCapabilities,
    ).toBeUndefined();
    expect(dataSource.patchRows[0]?.operations).toEqual([
      expect.objectContaining({
        type: "add_element",
        element: expect.objectContaining({
          elementId: "el_restore_reintroduced",
          ooxmlOrigin: "authored",
        }),
      }),
    ]);
    expect(
      (
        dataSource.patchRows[0]?.operations[0] as
          | Extract<DeckPatch["operations"][number], { type: "add_element" }>
          | undefined
      )?.element.ooxmlEditCapabilities,
    ).toBeUndefined();
  });

  it("rejects package-affecting structure changes in an OOXML snapshot restore", async () => {
    const { dataSource, service } = createService();
    const base = createDeck();
    const currentDeck = deckSchema.parse({ ...base, version: 3 });
    const snapshotDeck = deckSchema.parse({
      ...base,
      slides: [
        {
          ...base.slides[0]!,
          style: { backgroundColor: "#000000" },
        },
      ],
    });
    seedStoredDeck(dataSource, currentDeck, currentDeck);
    dataSource.snapshotRows.push({
      snapshot_id: "snapshot_ooxml_unsupported_restore",
      project_id: snapshotDeck.projectId,
      deck_id: snapshotDeck.deckId,
      deck_json: cloneJson(snapshotDeck),
      version: snapshotDeck.version,
      reason: "deck-replaced",
      created_at: "2026-07-10T00:00:00.000Z",
    });
    seedOoxmlBlueprint(dataSource, currentDeck);

    await expectDeckApiError(
      () =>
        service.restoreSnapshot(
          currentDeck.projectId,
          "snapshot_ooxml_unsupported_restore",
        ),
      HttpStatus.BAD_REQUEST,
      "OOXML_CHANGE_UNSUPPORTED",
    );

    expect(dataSource.decks.get(currentDeck.projectId)).toMatchObject({
      version: 3,
      deck_json: expect.objectContaining({ version: 3 }),
    });
    expect(dataSource.patchRows).toHaveLength(0);
  });

  it("preserves unsynced OOXML patches and returns a failed restore sync job", async () => {
    stubOrbitEnv();
    const dataSource = new InMemoryDeckDataSource();
    const syncJob = createJob("job_sync_restore_failed");
    const failedJob = jobSchema.parse({
      ...syncJob,
      status: "failed",
      message: "PPTX OOXML sync enqueue failed.",
      error: {
        code: "PPTX_OOXML_SYNC_ENQUEUE_FAILED",
        message: "queue unavailable",
      },
    });
    const jobsService = {
      create: vi.fn(async () => syncJob),
      update: vi.fn(async () => failedJob),
    };
    const enqueueSyncJob = vi.fn(async () => {
      throw new Error("queue unavailable");
    });
    const logger = createLogger();
    const service = new DecksService(
      dataSource as unknown as DataSource,
      jobsService as never,
      enqueueSyncJob,
      undefined,
      undefined,
      logger,
    );
    const deck = createDeck();
    const initial = await service.putDeck(deck.projectId, { deck });
    const version2 = await service.appendPatch(deck.projectId, {
      patch: createUpdateTitlePatch(deck, "Version 2"),
    });
    await service.appendPatch(deck.projectId, {
      patch: createUpdateTitlePatch(version2.deck, "Version 3"),
    });
    dataSource.templateBlueprintRows.push({
      template_id: "template_file_1",
      project_id: deck.projectId,
      deck_id: deck.deckId,
      blueprint_json: {
        templateId: "template_file_1",
        sourceFileId: "file_1",
        currentPackageFileId: "file_current",
        ooxmlSyncedDeckVersion: 1,
        slides: [{ slideIndex: 1, sourceSlideIndex: 1, slots: [] }],
      },
    });

    const response = await service.restoreSnapshot(
      deck.projectId,
      initial.snapshot.snapshotId,
    );

    expect(response.deck.version).toBe(4);
    expect(response.ooxmlSyncJob).toMatchObject({
      jobId: syncJob.jobId,
      status: "failed",
      error: { code: "PPTX_OOXML_SYNC_ENQUEUE_FAILED" },
    });
    expect(dataSource.patchRows.map((row) => row.after_version)).toEqual([
      2, 3, 4,
    ]);
    expect(jobsService.update).toHaveBeenCalledWith(
      syncJob.jobId,
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({
          code: "PPTX_OOXML_SYNC_ENQUEUE_FAILED",
        }),
      }),
    );
    expect(logger.error).toHaveBeenCalledWith(
      {
        event: "pptx_ooxml.sync.enqueue_failed",
        jobId: syncJob.jobId,
        projectId: deck.projectId,
        deckId: deck.deckId,
        targetDeckVersion: 4,
      },
      "PPTX OOXML sync job enqueue failed.",
    );
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

    expect(error.details).toEqual(["deck.version=2", "request.baseVersion=1"]);
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
                    required: true,
                  },
                  {
                    keywordId: "kw_two",
                    text: "orbit",
                    synonyms: [],
                    abbreviations: [],
                    required: true,
                  },
                ],
              },
            ],
          },
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
