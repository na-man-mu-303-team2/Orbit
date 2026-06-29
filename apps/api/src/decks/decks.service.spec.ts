import { HttpException, HttpStatus } from "@nestjs/common";
import {
  deckApiErrorSchema,
  deckSchema,
  type Deck,
  type DeckApiError,
  type DeckPatch,
  type DeckSnapshotReason
} from "@orbit/shared";
import type { DataSource } from "typeorm";
import { describe, expect, it } from "vitest";
import { DecksService } from "./decks.service";

type StoredDeckRow = {
  project_id: string;
  deck_id: string;
  deck_json: Deck;
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
  deck_json: Deck;
  version: number;
  reason: DeckSnapshotReason;
  created_at: string;
};

class InMemoryDeckDataSource {
  readonly decks = new Map<string, StoredDeckRow>();
  readonly patchRows: StoredPatchRow[] = [];
  readonly snapshotRows: StoredSnapshotRow[] = [];

  async transaction<T>(
    run: (manager: InMemoryDeckDataSource) => Promise<T>
  ): Promise<T> {
    return run(this);
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
    const query = normalizeSql(sql);

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

    if (query.startsWith("INSERT INTO decks")) {
      const [projectId, deckId, deck, version, updatedAt] = params as [
        string,
        string,
        Deck,
        number,
        string
      ];
      const row: StoredDeckRow = {
        project_id: projectId,
        deck_id: deckId,
        deck_json: cloneJson(deck),
        version,
        updated_at: updatedAt
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
        createdAt
      ] = params as [
        string,
        string,
        string,
        number,
        number,
        string,
        string | null,
        DeckPatch["operations"] | string,
        string
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
        created_at: createdAt
      });
      return [] as T;
    }

    if (query.startsWith("INSERT INTO deck_snapshots")) {
      const [snapshotId, projectId, deckId, deck, version, reason, createdAt] =
        params as [string, string, string, Deck, number, DeckSnapshotReason, string];
      const row: StoredSnapshotRow = {
        snapshot_id: snapshotId,
        project_id: projectId,
        deck_id: deckId,
        deck_json: cloneJson(deck),
        version,
        reason,
        created_at: createdAt
      };

      this.snapshotRows.push(row);
      return [cloneSnapshotRow(row)] as T;
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
      query.startsWith("SELECT snapshot_id, project_id, deck_id") &&
      query.includes("WHERE snapshot_id = $1")
    ) {
      const [snapshotId] = params as [string];
      const row = this.snapshotRows.find(
        (snapshot) => snapshot.snapshot_id === snapshotId
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

function createDeck(): Deck {
  return deckSchema.parse({
    deckId: "deck_demo_1",
    projectId: "project_demo_1",
    title: "ORBIT Demo Deck",
    version: 1,
    metadata: {
      language: "ko",
      locale: "ko-KR"
    },
    canvas: {
      preset: "wide-16-9",
      width: 1920,
      height: 1080,
      aspectRatio: "16:9"
    },
    slides: [
      {
        slideId: "slide_intro",
        order: 1,
        title: "소개"
      }
    ]
  });
}

function createUpdateTitlePatch(
  deck: Deck,
  title: string,
  baseVersion = deck.version
): DeckPatch {
  return {
    deckId: deck.deckId,
    baseVersion,
    source: "user",
    operations: [
      {
        type: "update_deck",
        title
      }
    ]
  };
}

async function expectDeckApiError(
  action: () => Promise<unknown>,
  status: HttpStatus,
  code: DeckApiError["code"]
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
    deck_json: cloneJson(row.deck_json)
  };
}

function cloneSnapshotRow(row: StoredSnapshotRow): StoredSnapshotRow {
  return {
    ...row,
    deck_json: cloneJson(row.deck_json)
  };
}

function compareSnapshotRows(a: StoredSnapshotRow, b: StoredSnapshotRow): number {
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
      version: 1
    });
    expect(putResponse.snapshot).toMatchObject({
      projectId: deck.projectId,
      deckId: deck.deckId,
      version: 1,
      reason: "deck-replaced"
    });
    expect(putResponse.snapshot.snapshotId).toMatch(/^snapshot_/);
    expect(getResponse.deck.title).toBe(deck.title);
    expect(snapshotResponse.snapshots).toHaveLength(1);
    expect(snapshotResponse.snapshots[0]?.snapshotId).toBe(
      putResponse.snapshot.snapshotId
    );
  });

  it("applies a patch, increments the deck version, and stores change history", async () => {
    const { dataSource, service } = createService();
    const deck = createDeck();
    await service.putDeck(deck.projectId, { deck });

    const patchResponse = await service.appendPatch(deck.projectId, {
      patch: createUpdateTitlePatch(deck, "수정된 덱")
    });
    const getResponse = await service.getDeck(deck.projectId);
    const snapshotResponse = await service.listSnapshots(deck.projectId);

    expect(patchResponse.deck.title).toBe("수정된 덱");
    expect(patchResponse.deck.version).toBe(2);
    expect(patchResponse.changeRecord).toMatchObject({
      deckId: deck.deckId,
      beforeVersion: 1,
      afterVersion: 2,
      source: "user"
    });
    expect(patchResponse.snapshot).toMatchObject({
      projectId: deck.projectId,
      deckId: deck.deckId,
      version: 2,
      reason: "patch-applied"
    });
    expect(dataSource.patchRows).toHaveLength(1);
    expect(dataSource.patchRows[0]).toMatchObject({
      deck_id: deck.deckId,
      before_version: 1,
      after_version: 2
    });
    expect(getResponse.deck.version).toBe(2);
    expect(snapshotResponse.snapshots.map((snapshot) => snapshot.version)).toEqual([
      2,
      1
    ]);
  });

  it("restores a snapshot into the current deck", async () => {
    const { service } = createService();
    const deck = createDeck();
    const putResponse = await service.putDeck(deck.projectId, { deck });
    await service.appendPatch(deck.projectId, {
      patch: createUpdateTitlePatch(deck, "수정된 덱")
    });

    const restoreResponse = await service.restoreSnapshot(
      deck.projectId,
      putResponse.snapshot.snapshotId
    );
    const getResponse = await service.getDeck(deck.projectId);

    expect(restoreResponse.restoredSnapshot.snapshotId).toBe(
      putResponse.snapshot.snapshotId
    );
    expect(restoreResponse.deck).toMatchObject({
      title: deck.title,
      version: 1
    });
    expect(getResponse.deck).toMatchObject({
      title: deck.title,
      version: 1
    });
  });

  it("rejects stale patch baseVersion", async () => {
    const { service } = createService();
    const deck = createDeck();
    await service.putDeck(deck.projectId, { deck });

    const error = await expectDeckApiError(
      () =>
        service.appendPatch(deck.projectId, {
          patch: createUpdateTitlePatch(deck, "수정된 덱", 2)
        }),
      HttpStatus.CONFLICT,
      "STALE_BASE_VERSION"
    );

    expect(error.details).toEqual([
      "deck.version=1",
      "patch.baseVersion=2"
    ]);
  });

  it("rejects reads when the current deck does not exist", async () => {
    const { service } = createService();

    await expectDeckApiError(
      () => service.getDeck("project_demo_1"),
      HttpStatus.NOT_FOUND,
      "DECK_NOT_FOUND"
    );
  });

  it("rejects patch append when the current deck does not exist", async () => {
    const { service } = createService();
    const deck = createDeck();

    await expectDeckApiError(
      () =>
        service.appendPatch(deck.projectId, {
          patch: createUpdateTitlePatch(deck, "수정된 덱")
        }),
      HttpStatus.NOT_FOUND,
      "DECK_NOT_FOUND"
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
            operations: []
          }
        }),
      HttpStatus.BAD_REQUEST,
      "PATCH_VALIDATION_FAILED"
    );

    expect(error.details.join("\n")).toContain("operations");
  });

  it("rejects invalid DeckSchema payloads", async () => {
    const { service } = createService();
    const invalidDeck = {
      ...createDeck(),
      metadata: {
        language: "en",
        locale: "ko-KR"
      }
    };

    const error = await expectDeckApiError(
      () => service.putDeck("project_demo_1", { deck: invalidDeck }),
      HttpStatus.BAD_REQUEST,
      "DECK_VALIDATION_FAILED"
    );

    expect(error.details.join("\n")).toContain("metadata.language");
  });

  it("rejects restore when the snapshot does not exist", async () => {
    const { service } = createService();

    await expectDeckApiError(
      () => service.restoreSnapshot("project_demo_1", "snapshot_missing_1"),
      HttpStatus.NOT_FOUND,
      "SNAPSHOT_NOT_FOUND"
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
          putResponse.snapshot.snapshotId
        ),
      HttpStatus.BAD_REQUEST,
      "SNAPSHOT_PROJECT_MISMATCH"
    );

    expect(error.details).toEqual([
      "projectId=project_other_1",
      "snapshot.projectId=project_demo_1"
    ]);
  });

  it("rejects deck writes outside the requested project boundary", async () => {
    const { service } = createService();
    const deck = createDeck();

    const error = await expectDeckApiError(
      () => service.putDeck("project_other_1", { deck }),
      HttpStatus.BAD_REQUEST,
      "PROJECT_MISMATCH"
    );

    expect(error.details).toEqual([
      "projectId=project_other_1",
      "deck.projectId=project_demo_1"
    ]);
  });
});
