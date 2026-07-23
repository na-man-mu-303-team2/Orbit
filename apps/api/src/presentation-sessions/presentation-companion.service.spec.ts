import { describe, expect, it, vi } from "vitest";

vi.mock("@orbit/config", () => ({
  loadOrbitConfig: () => ({
    SESSION_SECRET: "presentation-companion-service-secret",
  }),
}));

import type { PresentationCompanionProjectionService } from "./presentation-companion-projection.service";
import { PresentationCompanionService } from "./presentation-companion.service";
import type { PresentationSessionRepository } from "./presentation-session.repository";
import type { PresentationCompanionStore } from "./presentation-companion.store";

const now = new Date("2026-07-23T00:00:00.000Z");
const sessionRow = {
  session_id: "session_1",
  project_id: "project_1",
  deck_id: "deck_1",
  deck_version: 4,
  presenter_user_id: "user_1",
  created_by: "user_1",
  status: "live" as const,
  session_purpose: "presentation" as const,
  audience_access_enabled: false,
  access_mode: "public" as const,
  session_password_hash: null,
  starts_at: now.toISOString(),
  expires_at: "2026-07-23T08:00:00.000Z",
  active_activity_run_id: null,
  started_at: now.toISOString(),
  ended_at: null,
  closed_at: null,
  raw_responses_delete_after: null,
  raw_responses_deleted_at: null,
  results_deleted_at: null,
  created_at: now.toISOString(),
  updated_at: now.toISOString(),
};

function createFixture() {
  let generation = 0;
  const pairings = new Map<string, typeof sessionRow>();
  const store = {
    putPairing: vi.fn(async (code: string) => {
      pairings.set(code, sessionRow);
    }),
    consumePairing: vi.fn(async (code: string) => {
      if (!pairings.has(code)) return null;
      pairings.delete(code);
      return {
        sessionId: sessionRow.session_id,
        projectId: sessionRow.project_id,
        deckId: sessionRow.deck_id,
        deckVersion: sessionRow.deck_version,
        sessionExpiresAt: sessionRow.expires_at,
      };
    }),
    issueGeneration: vi.fn(async () => {
      generation += 1;
      return generation;
    }),
    getLatestGeneration: vi.fn(async () =>
      generation > 0 ? generation : null,
    ),
    revokeSession: vi.fn(async () => {
      generation = 0;
    }),
    getAuthority: vi.fn().mockResolvedValue(null),
    getPresence: vi.fn().mockResolvedValue(null),
    claimAuthority: vi.fn().mockResolvedValue(true),
    heartbeatAuthority: vi.fn().mockResolvedValue(true),
    renewPresence: vi.fn().mockResolvedValue(undefined),
    clearPresence: vi.fn().mockResolvedValue(undefined),
  } as unknown as PresentationCompanionStore;
  const sessions = {
    findActiveCompanionSession: vi.fn().mockResolvedValue(sessionRow),
  } as unknown as PresentationSessionRepository;
  const projection = {
    getDeckProjection: vi.fn().mockResolvedValue({
      deck: { deckId: "deck_1", version: 4 },
      referencedAssetIds: new Set(),
    }),
  } as unknown as PresentationCompanionProjectionService;
  return {
    projection,
    service: new PresentationCompanionService(
      store,
      sessions,
      projection,
    ),
    sessions,
    store,
  };
}

describe("PresentationCompanionService", () => {
  it("creates a 256-bit single-use pairing without exposing it to Redis keys", async () => {
    const fixture = createFixture();
    const result = await fixture.service.createPairing(
      "project_1",
      "session_1",
      now,
    );

    expect(Buffer.from(result.code, "base64url")).toHaveLength(32);
    expect(result.expiresAt).toBe("2026-07-23T00:02:00.000Z");
    expect(fixture.store.putPairing).toHaveBeenCalledWith(
      result.code,
      {
        sessionId: "session_1",
        projectId: "project_1",
        deckId: "deck_1",
        deckVersion: 4,
        sessionExpiresAt: "2026-07-23T08:00:00.000Z",
      },
      120,
    );
  });

  it("consumes a pairing once and caps credential expiry at four hours", async () => {
    const fixture = createFixture();
    const { code } = await fixture.service.createPairing(
      "project_1",
      "session_1",
      now,
    );

    const exchange = await fixture.service.exchangePairing(
      code,
      "iPad Safari",
      now,
    );
    expect(exchange.credential).toMatchObject({
      sessionId: "session_1",
      pairingGeneration: 1,
      expiresAt: "2026-07-23T04:00:00.000Z",
    });
    await expect(
      fixture.service.exchangePairing(code, "iPad Safari", now),
    ).rejects.toMatchObject({
      message: "Presentation companion unavailable",
    });
  });

  it("invalidates the previous credential when a replacement exchange increments generation", async () => {
    const fixture = createFixture();
    const firstPairing = await fixture.service.createPairing(
      "project_1",
      "session_1",
      now,
    );
    const first = await fixture.service.exchangePairing(
      firstPairing.code,
      "iPad Safari",
      now,
    );
    const secondPairing = await fixture.service.createPairing(
      "project_1",
      "session_1",
      now,
    );
    const second = await fixture.service.exchangePairing(
      secondPairing.code,
      "iPad Safari",
      now,
    );

    await expect(
      fixture.service.verifyCredential(
        first.token,
        "iPad Safari",
        "session_1",
        now,
      ),
    ).resolves.toBeNull();
    await expect(
      fixture.service.verifyCredential(
        second.token,
        "iPad Safari",
        "session_1",
        now,
      ),
    ).resolves.toMatchObject({ pairingGeneration: 2 });
  });

  it("fails closed for another user-agent, ended session, and revoke", async () => {
    const fixture = createFixture();
    const pairing = await fixture.service.createPairing(
      "project_1",
      "session_1",
      now,
    );
    const exchange = await fixture.service.exchangePairing(
      pairing.code,
      "iPad Safari",
      now,
    );

    await expect(
      fixture.service.verifyCredential(
        exchange.token,
        "Desktop Safari",
        "session_1",
        now,
      ),
    ).resolves.toBeNull();

    vi.mocked(
      fixture.sessions.findActiveCompanionSession,
    ).mockResolvedValueOnce(null);
    await expect(
      fixture.service.verifyCredential(
        exchange.token,
        "iPad Safari",
        "session_1",
        now,
      ),
    ).resolves.toBeNull();

    await fixture.service.revokeSession("session_1");
    await expect(
      fixture.service.verifyCredential(
        exchange.token,
        "iPad Safari",
        "session_1",
        now,
      ),
    ).resolves.toBeNull();
  });
});
