import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import {
  enqueueExpiredRehearsalAudioDeletions,
  reconcileStorageDeletionOutbox,
} from "./storage-deletion-reconciler";

describe("storage deletion reconciler", () => {
  it("enqueues expired successful rehearsal audio idempotently", async () => {
    let queryCount = 0;
    const query = vi.fn(
      async (sql: string, _parameters?: unknown[]): Promise<unknown[]> => {
        queryCount += 1;
        if (queryCount === 1) {
          expect(sql).toContain("runs.raw_audio_delete_deadline_at <= now()");
          expect(sql).toContain("runs.status = 'succeeded'");
          expect(sql).toContain("assets.purpose = 'rehearsal-audio'");
          return [
            {
              project_id: "project-a",
              file_id: "file-a",
              storage_key: "private/rehearsal-audio",
              purpose: "rehearsal-audio",
            },
          ];
        }
        expect(sql).toContain("ON CONFLICT (storage_key_hash) DO NOTHING");
        return [{ deletion_id: "deletion-a" }];
      },
    );

    const count = await enqueueExpiredRehearsalAudioDeletions({ query } as never);

    expect(count).toBe(1);
    expect(query.mock.calls[1]?.[1]).toEqual([
      expect.stringMatching(/^deletion_[a-f0-9]{32}$/),
      "project-a",
      "file-a",
      "private/rehearsal-audio",
      expect.stringMatching(/^[a-f0-9]{64}$/),
      "rehearsal-audio",
    ]);
  });

  it("exhausts safely on the fifth failed attempt without exposing the storage key", async () => {
    let queryCount = 0;
    const query = vi.fn(async (_sql: string, _parameters?: unknown[]): Promise<unknown[]> =>
      queryCount++ === 0 ? [{
        deletion_id: "deletion-1",
        project_id: "project-a",
        file_id: "file-a",
        storage_key: "private/secret-object",
        attempt_count: 4,
      }] : []);
    const dataSource = { query } as unknown as DataSource;
    const storage = { removeObject: vi.fn(async () => { throw new Error("provider details"); }) };

    await reconcileStorageDeletionOutbox(dataSource, storage);

    expect(query.mock.calls[1]?.[0]).toContain("$2 >= 5 THEN 'exhausted'");
    expect(query.mock.calls[1]?.[1]).toEqual(["deletion-1", 5]);
    expect(JSON.stringify(query.mock.calls[1])).not.toContain("private/secret-object");
    expect(JSON.stringify(query.mock.calls[1])).not.toContain("provider details");
  });

  it("nulls the storage key only after an idempotent successful delete", async () => {
    const query = vi.fn(async (_sql: string, _parameters?: unknown[]): Promise<unknown[]> => [{
      deletion_id: "deletion-1",
      project_id: "project-a",
      file_id: "file-a",
      storage_key: "private/object",
      attempt_count: 0,
    }]);
    const managerQuery = vi.fn(async (_sql: string, _parameters?: unknown[]) => []);
    const dataSource = {
      query,
      transaction: vi.fn(async (callback: (manager: { query: typeof managerQuery }) => unknown) => callback({ query: managerQuery })),
    } as unknown as DataSource;

    await reconcileStorageDeletionOutbox(dataSource, { removeObject: vi.fn(async () => undefined) });

    expect(managerQuery.mock.calls[2]?.[0]).toContain("storage_key = NULL");
  });
});
