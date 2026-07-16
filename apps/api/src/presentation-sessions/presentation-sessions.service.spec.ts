import { describe, expect, it, vi } from "vitest";

import type { PresentationSessionRepository } from "./presentation-session.repository";
import { PresentationSessionsService } from "./presentation-sessions.service";

const sessionRow = {
  session_id: "session_existing",
  project_id: "project_1",
  deck_id: "deck_1",
  deck_version: 7,
  presenter_user_id: "user_1",
  created_by: "user_1",
  status: "live" as const,
  access_mode: "public" as const,
  session_password_hash: null,
  starts_at: "2026-07-17T00:00:00.000Z",
  expires_at: "2026-07-31T00:00:00.000Z",
  active_activity_run_id: null,
  started_at: "2026-07-17T00:00:00.000Z",
  ended_at: null,
  closed_at: null,
  raw_responses_delete_after: null,
  raw_responses_deleted_at: null,
  results_deleted_at: null,
  created_at: "2026-07-17T00:00:00.000Z",
  updated_at: "2026-07-17T00:00:00.000Z"
};

function createService(overrides: Partial<PresentationSessionRepository> = {}) {
  const manager = {} as never;
  const repository = {
    transaction: vi.fn(async (work) => work(manager)),
    findStoredDeckForUpdate: vi.fn().mockResolvedValue({ deck_id: "deck_1", version: 7 }),
    closeActive: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockResolvedValue(sessionRow),
    findCurrent: vi.fn().mockResolvedValue(sessionRow),
    list: vi.fn().mockResolvedValue([sessionRow]),
    updateAccess: vi.fn().mockResolvedValue(sessionRow),
    close: vi.fn().mockResolvedValue({
      ...sessionRow,
      status: "ended",
      ended_at: "2026-07-17T01:00:00.000Z",
      closed_at: "2026-07-17T01:00:00.000Z",
      raw_responses_delete_after: "2026-10-15T01:00:00.000Z"
    }),
    ...overrides
  } as unknown as PresentationSessionRepository;
  const logger = { info: vi.fn() } as never;
  return { repository, service: new PresentationSessionsService(repository, logger) };
}

describe("PresentationSessionsService", () => {
  it("reuses the current session without creating a new row", async () => {
    const { repository, service } = createService();

    await expect(service.getCurrent("project_1", "deck_1")).resolves.toMatchObject({
      session: { sessionId: "session_existing", deckVersion: 7 },
      audienceUrl: "/audience/session_existing"
    });

    expect(repository.findCurrent).toHaveBeenCalledWith("project_1", "deck_1");
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it("closes an active session and reads deckVersion from the locked server row", async () => {
    const { repository, service } = createService({
      closeActive: vi.fn().mockResolvedValue(["session_previous"])
    });

    await expect(
      service.create("project_1", "user_1", {
        deckId: "deck_1",
        accessMode: "public"
      })
    ).resolves.toMatchObject({ session: { deckId: "deck_1", deckVersion: 7 } });

    expect(repository.closeActive).toHaveBeenCalledWith(expect.anything(), "project_1", expect.any(Date));
    expect(repository.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ deckId: "deck_1", deckVersion: 7, userId: "user_1" })
    );
  });

  it("returns archived sessions for the requested deck", async () => {
    const { repository, service } = createService();

    await expect(service.list("project_1", "deck_1")).resolves.toMatchObject({
      sessions: [{ sessionId: "session_existing", deckId: "deck_1" }]
    });
    expect(repository.list).toHaveBeenCalledWith("project_1", "deck_1");
  });

  it("closes a session idempotently through the repository transaction", async () => {
    const { repository, service } = createService();

    await expect(service.close("project_1", "session_existing")).resolves.toMatchObject({
      session: { status: "ended", activeActivityRunId: null }
    });
    expect(repository.close).toHaveBeenCalledWith(
      expect.anything(),
      "project_1",
      "session_existing",
      expect.any(Date)
    );
  });
});
