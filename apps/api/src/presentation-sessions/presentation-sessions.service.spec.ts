import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { DataSource } from "typeorm";

import { PresentationSessionsService } from "./presentation-sessions.service";

const activeSessionRow = {
  session_id: "session_existing",
  project_id: "project_1",
  deck_id: "deck_1",
  presenter_user_id: "user_1",
  join_code: "123456",
  status: "draft" as const,
  entry_status: "open" as const,
  audience_slide_render_mode: "image-first" as const,
  created_at: "2026-07-05T00:00:00.000Z",
  started_at: null,
  ended_at: null,
  survey_closes_at: null,
  raw_data_delete_after: "2026-08-04T00:00:00.000Z",
};

describe("PresentationSessionsService", () => {
  it("creates a draft session with a 6-digit join code and no passcode", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...activeSessionRow, join_code: "654321" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.create("project_1", "user_1", {
        deckId: "deck_1",
      }),
    ).resolves.toMatchObject({
      session: {
        sessionId: "session_existing",
        projectId: "project_1",
        deckId: "deck_1",
        presenterUserId: "user_1",
        joinCode: "654321",
        status: "draft",
        entryStatus: "open",
      },
      audienceUrl: "/join/654321",
    });

    const insertSql = query.mock.calls[1][0] as string;
    expect(insertSql).toContain("join_code");
    expect(insertSql).not.toContain("passcode");
    expect(insertSql).not.toContain("session_password_hash");
  });

  it("returns the existing active session when concurrent creation hits the unique index", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(
        Object.assign(new Error("duplicate active session"), { code: "23505" }),
      )
      .mockResolvedValueOnce([activeSessionRow]);

    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.create("project_1", "user_1", {
        deckId: "deck_1",
      }),
    ).resolves.toMatchObject({
      session: {
        sessionId: "session_existing",
        projectId: "project_1",
        joinCode: "123456",
        status: "draft",
      },
      audienceUrl: "/join/123456",
    });

    expect(query).toHaveBeenCalledTimes(3);
  });

  it("creates an audience participant for a draft session", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          audience_id: "audience_00000000-0000-4000-8000-000000000001",
          session_id: "session_existing",
          nickname: "orbit",
          joined_at: "2026-07-05T00:00:01.000Z",
          last_seen_at: "2026-07-05T00:00:01.000Z",
          joined_before_end: true,
        },
      ])
      .mockResolvedValueOnce([]);

    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.joinAudience(service["toSessionDto"](activeSessionRow), {
        audienceId: "audience_00000000-0000-4000-8000-000000000001",
        nickname: "orbit",
        tokenHash: "token_hash",
      }),
    ).resolves.toMatchObject({
      session: {
        sessionId: "session_existing",
        joinCode: "123456",
        status: "draft",
      },
      participant: {
        audienceId: "audience_00000000-0000-4000-8000-000000000001",
        nickname: "orbit",
      },
    });

    expect(query.mock.calls[0][0]).toContain(
      "INSERT INTO audience_participants",
    );
    expect(query.mock.calls[1][0]).toContain("INSERT INTO audience_events");
  });

  it("rejects duplicate nicknames in the same session", async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("duplicate nickname"), { code: "23505" }),
      );
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.joinAudience(service["toSessionDto"](activeSessionRow), {
        audienceId: "audience_00000000-0000-4000-8000-000000000001",
        nickname: "orbit",
        tokenHash: "token_hash",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("blocks new joins when entry is closed", async () => {
    const service = new PresentationSessionsService({
      query: vi.fn(),
    } as unknown as DataSource);

    await expect(
      service.joinAudience(
        service["toSessionDto"]({
          ...activeSessionRow,
          entry_status: "closed",
        }),
        {
          audienceId: "audience_00000000-0000-4000-8000-000000000001",
          nickname: "orbit",
          tokenHash: "token_hash",
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("restores an existing participant by audience token hash", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          audience_id: "audience_00000000-0000-4000-8000-000000000001",
          session_id: "session_existing",
          nickname: "orbit",
          joined_at: "2026-07-05T00:00:01.000Z",
          last_seen_at: "2026-07-05T00:01:00.000Z",
          joined_before_end: true,
        },
      ])
      .mockResolvedValueOnce([activeSessionRow]);
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.getAudienceMe(
        "session_existing",
        "audience_00000000-0000-4000-8000-000000000001",
        "token_hash",
      ),
    ).resolves.toMatchObject({
      participant: {
        audienceId: "audience_00000000-0000-4000-8000-000000000001",
        nickname: "orbit",
      },
    });
  });

  it("rejects rejoin when the token hash does not match", async () => {
    const query = vi.fn().mockResolvedValueOnce([]);
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.getAudienceMe(
        "session_existing",
        "audience_00000000-0000-4000-8000-000000000001",
        "wrong_hash",
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
