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

  it("returns audience state recovery data for an authenticated participant", async () => {
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
      .mockResolvedValueOnce([activeSessionRow])
      .mockResolvedValueOnce([
        {
          session_id: "session_existing",
          slide_id: "slide_1",
          slide_index: 0,
          effect_state_json: { revealIds: ["shape_1"] },
          active_interaction_id: null,
          updated_at: "2026-07-05T00:02:00.000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          session_id: "session_existing",
          qna_enabled: false,
          ai_qna_enabled: false,
          polls_enabled: false,
          quizzes_enabled: false,
          reactions_enabled: false,
          survey_enabled: false,
          updated_at: "2026-07-05T00:02:00.000Z",
        },
      ]);
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.getAudienceState(
        "session_existing",
        "audience_00000000-0000-4000-8000-000000000001",
        "token_hash",
      ),
    ).resolves.toMatchObject({
      session: {
        sessionId: "session_existing",
        joinCode: "123456",
      },
      participant: {
        nickname: "orbit",
      },
      state: {
        slideId: "slide_1",
        slideIndex: 0,
        effectState: { revealIds: ["shape_1"] },
      },
      features: {
        qnaEnabled: false,
        reactionsEnabled: false,
      },
    });
  });

  it("persists presenter slide state and appends an audience-safe event", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          session_id: "session_existing",
          slide_id: "slide_2",
          slide_index: 1,
          effect_state_json: { highlightId: "shape_2" },
          active_interaction_id: null,
          updated_at: "2026-07-05T00:03:00.000Z",
        },
      ])
      .mockResolvedValueOnce([]);
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.updateAudienceRealtimeState({
        sessionId: "session_existing",
        actorId: "user_1",
        slideId: "slide_2",
        slideIndex: 1,
        effectState: { highlightId: "shape_2" },
      }),
    ).resolves.toMatchObject({
      sessionId: "session_existing",
      slideId: "slide_2",
      slideIndex: 1,
      effectState: { highlightId: "shape_2" },
    });

    expect(query.mock.calls[0][0]).toContain("UPDATE audience_realtime_state");
    expect(query.mock.calls[1][0]).toContain("INSERT INTO audience_events");
    expect(query.mock.calls[1][1][4]).toBe("slide.changed");
    expect(query.mock.calls[1][1][5]).toEqual({
      slideId: "slide_2",
      slideIndex: 1,
      effectState: { highlightId: "shape_2" },
    });
  });

  it("updates feature settings, normalizes AI Q&A dependencies, and appends an event", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          session_id: "session_existing",
          qna_enabled: false,
          ai_qna_enabled: false,
          polls_enabled: false,
          quizzes_enabled: false,
          reactions_enabled: false,
          survey_enabled: false,
          updated_at: "2026-07-05T00:02:00.000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          session_id: "session_existing",
          qna_enabled: true,
          ai_qna_enabled: true,
          polls_enabled: false,
          quizzes_enabled: false,
          reactions_enabled: false,
          survey_enabled: false,
          updated_at: "2026-07-05T00:04:00.000Z",
        },
      ])
      .mockResolvedValueOnce([]);
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.updateAudienceFeatureSettings({
        projectId: "project_1",
        sessionId: "session_existing",
        actorId: "user_1",
        settings: { aiQnaEnabled: true },
      }),
    ).resolves.toMatchObject({
      features: {
        sessionId: "session_existing",
        qnaEnabled: true,
        aiQnaEnabled: true,
      },
    });

    expect(query.mock.calls[0][0]).toContain(
      "INNER JOIN presentation_sessions",
    );
    expect(query.mock.calls[1][0]).toContain(
      "UPDATE audience_feature_settings",
    );
    expect(query.mock.calls[1][1]).toEqual([
      "session_existing",
      "project_1",
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(query.mock.calls[2][0]).toContain("INSERT INTO audience_events");
    expect(query.mock.calls[2][1][4]).toBe("feature.changed");
    expect(query.mock.calls[2][1][5]).toMatchObject({
      features: {
        qnaEnabled: true,
        aiQnaEnabled: true,
      },
    });
  });

  it("disables AI Q&A when presenter disables Q&A", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          session_id: "session_existing",
          qna_enabled: true,
          ai_qna_enabled: true,
          polls_enabled: true,
          quizzes_enabled: false,
          reactions_enabled: false,
          survey_enabled: false,
          updated_at: "2026-07-05T00:02:00.000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          session_id: "session_existing",
          qna_enabled: false,
          ai_qna_enabled: false,
          polls_enabled: true,
          quizzes_enabled: false,
          reactions_enabled: false,
          survey_enabled: false,
          updated_at: "2026-07-05T00:04:00.000Z",
        },
      ])
      .mockResolvedValueOnce([]);
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.updateAudienceFeatureSettings({
        projectId: "project_1",
        sessionId: "session_existing",
        actorId: "user_1",
        settings: { qnaEnabled: false },
      }),
    ).resolves.toMatchObject({
      features: {
        qnaEnabled: false,
        aiQnaEnabled: false,
        pollsEnabled: true,
      },
    });

    expect(query.mock.calls[1][1]).toEqual([
      "session_existing",
      "project_1",
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
  });

  it("rejects unsafe presenter realtime payloads before persistence", async () => {
    const service = new PresentationSessionsService({
      query: vi.fn(),
    } as unknown as DataSource);

    await expect(
      service.updateAudienceRealtimeState({
        sessionId: "session_existing",
        actorId: "user_1",
        slideId: "slide_2",
        slideIndex: 1,
        effectState: { speakerNotes: "private" },
      }),
    ).rejects.toThrow("audience payload must not include speakerNotes");
  });

  it("creates interaction library items and copies them into a session", async () => {
    const libraryRow = {
      library_interaction_id:
        "library_interaction_00000000-0000-4000-8000-000000000001",
      project_id: "project_1",
      title: "오늘 발표 만족도",
      kind: "poll" as const,
      questions_json: [
        {
          type: "scale" as const,
          questionId: "question_00000000-0000-4000-8000-000000000001",
          prompt: "만족도를 골라 주세요.",
          required: true,
          min: 1 as const,
          max: 5 as const,
        },
      ],
      result_visibility: "live" as const,
      quiz_scoring: "none" as const,
      created_at: "2026-07-05T00:00:00.000Z",
      updated_at: "2026-07-05T00:00:00.000Z",
    };
    const sessionInteractionRow = {
      interaction_id: "interaction_00000000-0000-4000-8000-000000000001",
      session_id: "session_existing",
      kind: "poll" as const,
      title: "오늘 발표 만족도",
      questions_json: libraryRow.questions_json,
      result_visibility: "live" as const,
      quiz_scoring: "none" as const,
      source: "library" as const,
      display_order: 0,
      activated_at: null,
      closed_at: null,
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce([libraryRow])
      .mockResolvedValueOnce([{ session_id: "session_existing" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([libraryRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ session_id: "session_existing" }])
      .mockResolvedValueOnce([sessionInteractionRow]);
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.createLibraryInteraction("project_1", {
        kind: "poll",
        title: "오늘 발표 만족도",
        questions: libraryRow.questions_json,
        resultVisibility: "live",
      }),
    ).resolves.toMatchObject({
      interaction: {
        libraryInteractionId:
          "library_interaction_00000000-0000-4000-8000-000000000001",
        kind: "poll",
        title: "오늘 발표 만족도",
      },
    });

    await expect(
      service.selectSessionInteractions(
        { projectId: "project_1", sessionId: "session_existing" },
        {
          libraryInteractionIds: [
            "library_interaction_00000000-0000-4000-8000-000000000001",
          ],
        },
      ),
    ).resolves.toMatchObject({
      interactions: [
        {
          interactionId: "interaction_00000000-0000-4000-8000-000000000001",
          source: "library",
          order: 0,
        },
      ],
    });

    expect(query.mock.calls[4][0]).toContain(
      "INSERT INTO session_interactions",
    );
  });

  it("allows poll response edits but rejects quiz response edits", async () => {
    const pollInteractionRow = {
      interaction_id: "interaction_00000000-0000-4000-8000-000000000001",
      session_id: "session_existing",
      kind: "poll" as const,
      title: "만족도",
      questions_json: [
        {
          type: "scale" as const,
          questionId: "question_00000000-0000-4000-8000-000000000001",
          prompt: "만족도",
          required: true,
          min: 1 as const,
          max: 5 as const,
        },
      ],
      result_visibility: "live" as const,
      quiz_scoring: "none" as const,
      source: "ad-hoc" as const,
      display_order: 0,
      activated_at: "2026-07-05T00:00:00.000Z",
      closed_at: null,
    };
    const responseRow = {
      response_id: "response_00000000-0000-4000-8000-000000000001",
      interaction_id: pollInteractionRow.interaction_id,
      session_id: "session_existing",
      audience_id: "audience_00000000-0000-4000-8000-000000000001",
      question_id: "question_00000000-0000-4000-8000-000000000001",
      answer_json: { type: "scale" as const, value: 5 },
      is_correct: null,
      score: 0,
      submitted_at: "2026-07-05T00:00:01.000Z",
      updated_at: "2026-07-05T00:00:02.000Z",
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          audience_id: "audience_00000000-0000-4000-8000-000000000001",
          session_id: "session_existing",
          nickname: "orbit",
          joined_at: "2026-07-05T00:00:00.000Z",
          last_seen_at: "2026-07-05T00:00:00.000Z",
          joined_before_end: true,
        },
      ])
      .mockResolvedValueOnce([activeSessionRow])
      .mockResolvedValueOnce([pollInteractionRow])
      .mockResolvedValueOnce([responseRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          audience_id: "audience_00000000-0000-4000-8000-000000000001",
          session_id: "session_existing",
          nickname: "orbit",
          joined_at: "2026-07-05T00:00:00.000Z",
          last_seen_at: "2026-07-05T00:00:00.000Z",
          joined_before_end: true,
        },
      ])
      .mockResolvedValueOnce([activeSessionRow])
      .mockResolvedValueOnce([{ ...pollInteractionRow, kind: "quiz" }])
      .mockRejectedValueOnce(
        Object.assign(new Error("duplicate quiz response"), { code: "23505" }),
      );
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.submitInteractionResponse({
        sessionId: "session_existing",
        audienceId: "audience_00000000-0000-4000-8000-000000000001",
        tokenHash: "token_hash",
        interactionId: pollInteractionRow.interaction_id,
        body: {
          questionId: "question_00000000-0000-4000-8000-000000000001",
          answer: { type: "scale", value: 5 },
        },
      }),
    ).resolves.toMatchObject({
      response: {
        answer: { type: "scale", value: 5 },
      },
    });

    await expect(
      service.submitInteractionResponse({
        sessionId: "session_existing",
        audienceId: "audience_00000000-0000-4000-8000-000000000001",
        tokenHash: "token_hash",
        interactionId: pollInteractionRow.interaction_id,
        body: {
          questionId: "question_00000000-0000-4000-8000-000000000001",
          answer: { type: "scale", value: 5 },
        },
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(query.mock.calls[3][0]).toContain("ON CONFLICT");
  });
});
