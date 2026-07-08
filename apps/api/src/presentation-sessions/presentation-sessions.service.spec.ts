import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DataSource } from "typeorm";
import type { StoragePort } from "@orbit/storage";

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

const endedSessionRow = {
  ...activeSessionRow,
  status: "ended" as const,
  entry_status: "closed" as const,
  started_at: "2026-07-05T00:00:00.000Z",
  ended_at: "2026-07-05T00:30:00.000Z",
  survey_closes_at: "2999-07-05T01:30:00.000Z",
};

const surveyFormRow = {
  survey_id: "survey_00000000-0000-4000-8000-000000000001",
  session_id: "session_existing",
  title: "발표 설문",
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
  contact_json: {
    enabled: true,
    consentText: "후속 연락에 동의합니다.",
    fields: [
      {
        type: "open-text" as const,
        questionId: "question_00000000-0000-4000-8000-000000000002",
        prompt: "이메일",
        required: false,
        maxLength: 160,
      },
    ],
  },
  locked_at: null,
  created_at: "2026-07-05T00:00:00.000Z",
  updated_at: "2026-07-05T00:00:00.000Z",
};

const audienceDeck = {
  deckId: "deck_1",
  projectId: "project_1",
  title: "Audience Deck",
  version: 1,
  canvas: {
    preset: "wide-16-9",
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
  },
  slides: [
    {
      slideId: "slide_2",
      order: 1,
      title: "공개 슬라이드",
      speakerNotes: "private presenter script",
      style: {},
      elements: [
        {
          elementId: "el_1",
          type: "text",
          x: 100,
          y: 160,
          width: 720,
          height: 120,
          props: { text: "청중 공개 문장" },
        },
      ],
    },
    {
      slideId: "slide_3",
      order: 2,
      title: "두 번째 공개 슬라이드",
      speakerNotes: "second private presenter script",
      style: {},
      elements: [
        {
          elementId: "el_2",
          type: "text",
          x: 100,
          y: 160,
          width: 720,
          height: 120,
          props: { text: "두 번째 청중 공개 문장" },
        },
      ],
    },
  ],
};

const validEnv = {
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
  SESSION_SECRET: "test-session-secret",
  COOKIE_SECRET: "test-cookie-secret",
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
  LOG_LEVEL: "info",
  LOG_PRETTY: "false",
  DEMO_USER_ID: "user_demo",
  DEMO_WORKSPACE_ID: "workspace_demo",
  DEMO_PROJECT_ID: "project_demo",
  DEMO_DECK_ID: "deck_demo",
  DEMO_SESSION_ID: "session_demo",
};

describe("PresentationSessionsService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("queues audience slide render jobs during draft session preparation", async () => {
    for (const [key, value] of Object.entries(validEnv)) {
      vi.stubEnv(key, value);
    }

    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT d.deck_json")) {
        return [{ deck_json: audienceDeck }];
      }

      if (sql.includes("SELECT audience_slide_snapshots_json")) {
        return [{ audience_slide_snapshots_json: {} }];
      }

      if (sql.includes("INSERT INTO presentation_sessions")) {
        return [{ ...activeSessionRow, join_code: "654321" }];
      }

      if (
        sql.includes("INSERT INTO audience_feature_settings") ||
        sql.includes("INSERT INTO audience_realtime_state")
      ) {
        return [];
      }

      return [];
    });
    const jobsService = {
      create: vi.fn(async (input: { payload?: Record<string, unknown> }) => ({
        jobId: `job_${String(input.payload?.slideId)}`,
        projectId: "project_1",
        type: "audience-slide-render",
      })),
      update: vi.fn(),
    };
    const enqueueSlideRenderJob = vi.fn(async () => undefined);
    const service = new PresentationSessionsService(
      { query } as unknown as DataSource,
      undefined,
      jobsService as never,
      enqueueSlideRenderJob,
    );

    await expect(
      service.create("project_1", "user_1", {
        deckId: "deck_1",
      }),
    ).resolves.toMatchObject({
      session: {
        sessionId: "session_existing",
        status: "draft",
      },
    });

    expect(jobsService.create).toHaveBeenCalledTimes(2);
    expect(jobsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_1",
        type: "audience-slide-render",
        payload: expect.objectContaining({
          deckId: "deck_1",
          deckVersion: 1,
          sessionId: "session_existing",
          slideId: "slide_2",
        }),
      }),
    );
    expect(enqueueSlideRenderJob).toHaveBeenCalledTimes(2);
    expect(enqueueSlideRenderJob).toHaveBeenCalledWith(
      expect.objectContaining({
        driver: "bullmq",
        redisUrl: "redis://localhost:6379",
        jobId: "job_slide_2",
        projectId: "project_1",
        sessionId: "session_existing",
        slideId: "slide_2",
        deck: expect.objectContaining({ deckId: "deck_1" }),
      }),
    );
  });

  it("normalizes missing audience join sessions to Korean copy", async () => {
    const query = vi.fn().mockResolvedValueOnce([]);
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(service.getActiveSessionByJoinCode("123456")).rejects.toThrow(
      "입장 코드를 확인해 주세요.",
    );
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
        [
          {
            audience_id: "audience_00000000-0000-4000-8000-000000000001",
            session_id: "session_existing",
            nickname: "orbit",
            joined_at: "2026-07-05 00:00:01.123456+00",
            last_seen_at: "2026-07-05 00:01:00.654321+00",
            joined_before_end: true,
          },
        ],
        1,
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
    expect(query.mock.calls[0][0]).toContain("joined_at::text AS joined_at");
    expect(query.mock.calls[0][0]).toContain(
      "last_seen_at::text AS last_seen_at",
    );
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
        [
          {
            audience_id: "audience_00000000-0000-4000-8000-000000000001",
            session_id: "session_existing",
            nickname: "orbit",
            joined_at: "2026-07-05 00:00:01.123456+00",
            last_seen_at: "2026-07-05 00:01:00.654321+00",
            joined_before_end: true,
          },
        ],
        1,
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

    const featureQuery = query.mock.calls.find(([sql]) =>
      String(sql).includes("FROM audience_feature_settings"),
    );
    expect(featureQuery?.[0]).toContain("updated_at::text AS updated_at");
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

  it("touches audience realtime state without clearing slide or interaction fields", async () => {
    const query = vi.fn().mockResolvedValueOnce([
      {
        session_id: "session_existing",
        slide_id: "slide_2",
        slide_index: 1,
        effect_state_json: { stepIndex: 2 },
        active_interaction_id: "interaction_1",
        updated_at: "2026-07-05T00:05:00.000Z",
      },
    ]);
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.touchAudienceRealtimeState("session_existing"),
    ).resolves.toEqual({
      sessionId: "session_existing",
      slideId: "slide_2",
      slideIndex: 1,
      effectState: { stepIndex: 2 },
      activeInteractionId: "interaction_1",
      updatedAt: "2026-07-05T00:05:00.000Z",
    });

    expect(query).toHaveBeenCalledWith(expect.any(String), [
      "session_existing",
    ]);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("UPDATE audience_realtime_state");
    expect(sql).toContain("SET updated_at = now()");
    expect(sql).not.toContain("slide_id = $");
    expect(sql).not.toContain("slide_index = $");
    expect(sql).not.toContain("effect_state_json = $");
    expect(sql).not.toContain("active_interaction_id = $");
  });

  it("renders and attaches an audience slide snapshot when storage is available", async () => {
    const storage = {
      putObject: vi.fn(async (input) => ({
        key: input.key,
        url: "https://cdn.example.test/audience-slide.svg",
        contentType: input.contentType,
        purpose: input.purpose,
        size: typeof input.body === "string" ? input.body.length : 0,
      })),
    } as unknown as StoragePort;
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("FROM presentation_sessions ps")) {
        return [{ deck_json: audienceDeck }];
      }

      if (sql.includes("UPDATE audience_realtime_state")) {
        return [
          {
            session_id: "session_existing",
            slide_id: "slide_2",
            slide_index: 1,
            effect_state_json: params?.[3],
            active_interaction_id: null,
            updated_at: "2026-07-05T00:03:00.000Z",
          },
        ];
      }

      if (sql.includes("INSERT INTO audience_events")) {
        return [];
      }

      return [];
    });
    const service = new PresentationSessionsService(
      { query } as unknown as DataSource,
      storage,
    );

    await expect(
      service.updateAudienceRealtimeState({
        sessionId: "session_existing",
        actorId: "user_1",
        slideId: "slide_2",
        slideIndex: 1,
        effectState: { highlightId: "shape_2" },
      }),
    ).resolves.toMatchObject({
      effectState: {
        highlightId: "shape_2",
        slideFallback: expect.objectContaining({
          deck: expect.objectContaining({
            slides: [expect.objectContaining({ slideId: "slide_2" })],
          }),
        }),
        slideSnapshotUrl: expect.stringMatching(
          /^\/api\/v1\/presentation-sessions\/session_existing\/audience\/slide-snapshots\/slide_2\/[a-f0-9]{64}$/,
        ),
      },
    });

    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "image/svg+xml",
        purpose: "audience-slide-snapshot",
        key: expect.stringMatching(
          /^audience-slide-snapshots\/session_existing\/slide_2-[a-f0-9]{64}\.svg$/,
        ),
      }),
    );
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("청중 공개 문장"),
      }),
    );
    const eventCall = query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO audience_events"),
    );
    expect(eventCall?.[1]?.[5]).toMatchObject({
      effectState: {
        slideSnapshotUrl: expect.stringMatching(
          /^\/api\/v1\/presentation-sessions\/session_existing\/audience\/slide-snapshots\/slide_2\/[a-f0-9]{64}$/,
        ),
      },
    });
  });

  it("initializes the first slide snapshot when a session starts", async () => {
    const storage = {
      putObject: vi.fn(async (input) => ({
        key: input.key,
        url: "https://cdn.example.test/start-slide.svg",
        contentType: input.contentType,
        purpose: input.purpose,
        size: typeof input.body === "string" ? input.body.length : 0,
      })),
    } as unknown as StoragePort;
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("UPDATE presentation_sessions")) {
        return [
          {
            ...activeSessionRow,
            status: "live",
            started_at: "2026-07-05T00:01:00.000Z",
          },
        ];
      }

      if (sql.includes("UPDATE session_survey_forms")) {
        return [];
      }

      if (sql.includes("FROM presentation_sessions ps")) {
        return [{ deck_json: audienceDeck }];
      }

      if (sql.includes("UPDATE audience_realtime_state")) {
        return [
          {
            session_id: "session_existing",
            slide_id: "slide_2",
            slide_index: 0,
            effect_state_json: params?.[3],
            active_interaction_id: null,
            updated_at: "2026-07-05T00:01:00.000Z",
          },
        ];
      }

      if (sql.includes("INSERT INTO audience_events")) {
        return [];
      }

      return [];
    });
    const service = new PresentationSessionsService(
      { query } as unknown as DataSource,
      storage,
    );

    await expect(
      service.startSession({
        projectId: "project_1",
        sessionId: "session_existing",
        actorId: "user_1",
      }),
    ).resolves.toMatchObject({
      session: { sessionId: "session_existing", status: "live" },
    });

    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(
          /^audience-slide-snapshots\/session_existing\/slide_2-[a-f0-9]{64}\.svg$/,
        ),
        purpose: "audience-slide-snapshot",
      }),
    );
    const eventPayloads = query.mock.calls
      .filter(([sql]) => String(sql).includes("INSERT INTO audience_events"))
      .map(([, params]) => params?.[5]);
    expect(eventPayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          effectState: expect.objectContaining({
            slideSnapshotUrl: expect.stringMatching(
              /^\/api\/v1\/presentation-sessions\/session_existing\/audience\/slide-snapshots\/slide_2\/[a-f0-9]{64}$/,
            ),
          }),
          slideId: "slide_2",
          slideIndex: 0,
        }),
        { sessionId: "session_existing" },
      ]),
    );
  });

  it("freezes all audience slide snapshot urls when a session starts", async () => {
    const storage = {
      putObject: vi.fn(async (input) => ({
        key: input.key,
        url: `https://cdn.example.test/${String(input.key).split("/").at(-1)}`,
        contentType: input.contentType,
        purpose: input.purpose,
        size: typeof input.body === "string" ? input.body.length : 0,
      })),
    } as unknown as StoragePort;
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("UPDATE presentation_sessions") && sql.includes("status = 'live'")) {
        return [
          {
            ...activeSessionRow,
            status: "live",
            started_at: "2026-07-05T00:01:00.000Z",
          },
        ];
      }

      if (sql.includes("UPDATE session_survey_forms")) {
        return [];
      }

      if (sql.includes("FROM presentation_sessions ps")) {
        return [{ deck_json: audienceDeck }];
      }

      if (sql.includes("UPDATE presentation_sessions") && sql.includes("audience_slide_snapshots_json")) {
        return [];
      }

      if (sql.includes("SELECT audience_slide_snapshots_json")) {
        return [
          {
            audience_slide_snapshots_json: {
              deckVersion: 1,
              deckContentHash: "already-frozen",
              slides: {
                slide_2: {
                  contentHash: "frozen-slide-2",
                  url: "https://cdn.example.test/slide_2.svg",
                },
              },
            },
          },
        ];
      }

      if (sql.includes("UPDATE audience_realtime_state")) {
        return [
          {
            session_id: "session_existing",
            slide_id: "slide_2",
            slide_index: 0,
            effect_state_json: params?.[3],
            active_interaction_id: null,
            updated_at: "2026-07-05T00:01:00.000Z",
          },
        ];
      }

      if (sql.includes("INSERT INTO audience_events")) {
        return [];
      }

      return [];
    });
    const service = new PresentationSessionsService(
      { query } as unknown as DataSource,
      storage,
    );

    await service.startSession({
      projectId: "project_1",
      sessionId: "session_existing",
      actorId: "user_1",
    });

    expect(storage.putObject).toHaveBeenCalledTimes(2);
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(
          /^audience-slide-snapshots\/session_existing\/slide_3-[a-f0-9]{64}\.svg$/,
        ),
      }),
    );
    const snapshotMapUpdate = query.mock.calls.find(([sql]) =>
      String(sql).includes("audience_slide_snapshots_json = $2::jsonb"),
    );
    expect(snapshotMapUpdate?.[1]?.[1]).toMatchObject({
      deckVersion: 1,
      slides: {
        slide_2: expect.objectContaining({
          url: expect.stringContaining("slide_2-"),
        }),
        slide_3: expect.objectContaining({
          url: expect.stringContaining("slide_3-"),
        }),
      },
    });
  });

  it("reuses frozen audience slide snapshot urls for presenter slide updates", async () => {
    const storage = {
      putObject: vi.fn(),
    } as unknown as StoragePort;
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("SELECT audience_slide_snapshots_json")) {
        return [
          {
            audience_slide_snapshots_json: {
              deckVersion: 1,
              deckContentHash: "frozen-deck",
              slides: {
                slide_3: {
                  contentHash: "frozen-slide-3",
                  url: "https://cdn.example.test/frozen-slide-3.svg",
                },
              },
            },
          },
        ];
      }

      if (sql.includes("UPDATE audience_realtime_state")) {
        return [
          {
            session_id: "session_existing",
            slide_id: "slide_3",
            slide_index: 1,
            effect_state_json: params?.[3],
            active_interaction_id: null,
            updated_at: "2026-07-05T00:03:00.000Z",
          },
        ];
      }

      if (sql.includes("INSERT INTO audience_events")) {
        return [];
      }

      return [];
    });
    const service = new PresentationSessionsService(
      { query } as unknown as DataSource,
      storage,
    );

    await expect(
      service.updateAudienceRealtimeState({
        sessionId: "session_existing",
        actorId: "user_1",
        slideId: "slide_3",
        slideIndex: 1,
        effectState: {},
      }),
    ).resolves.toMatchObject({
      effectState: {
        slideSnapshotContentHash: "frozen-slide-3",
        slideSnapshotUrl:
          "/api/v1/presentation-sessions/session_existing/audience/slide-snapshots/slide_3/frozen-slide-3",
      },
    });

    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("uses slide fallback instead of a frozen static snapshot for dynamic effects", async () => {
    const storage = {
      putObject: vi.fn(),
    } as unknown as StoragePort;
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("SELECT audience_slide_snapshots_json")) {
        return [
          {
            audience_slide_snapshots_json: {
              deckVersion: 1,
              deckContentHash: "frozen-deck",
              slides: {
                slide_3: {
                  contentHash: "frozen-slide-3",
                  url: "https://cdn.example.test/frozen-slide-3.svg",
                },
              },
            },
          },
        ];
      }

      if (sql.includes("FROM presentation_sessions ps")) {
        return [{ deck_json: audienceDeck }];
      }

      if (sql.includes("UPDATE audience_realtime_state")) {
        return [
          {
            session_id: "session_existing",
            slide_id: "slide_3",
            slide_index: 1,
            effect_state_json: params?.[3],
            active_interaction_id: null,
            updated_at: "2026-07-05T00:03:00.000Z",
          },
        ];
      }

      if (sql.includes("INSERT INTO audience_events")) {
        return [];
      }

      return [];
    });
    const service = new PresentationSessionsService(
      { query } as unknown as DataSource,
      storage,
    );

    await expect(
      service.updateAudienceRealtimeState({
        sessionId: "session_existing",
        actorId: "user_1",
        slideId: "slide_3",
        slideIndex: 1,
        effectState: {
          highlights: [{ elementId: "el_2", active: true }],
          stepIndex: 2,
          triggerAnimationIds: ["animation_1"],
        },
      }),
    ).resolves.toMatchObject({
      effectState: {
        highlights: [{ elementId: "el_2", active: true }],
        stepIndex: 2,
        triggerAnimationIds: ["animation_1"],
        slideFallback: {
          deck: {
            slides: [
              expect.objectContaining({
                slideId: "slide_3",
              }),
            ],
          },
          slideIndex: 0,
          sourceSlideIndex: 1,
        },
      },
    });

    expect(storage.putObject).not.toHaveBeenCalled();
    const updateCall = query.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE audience_realtime_state"),
    );
    const persistedEffectState = updateCall?.[1]?.[3] as Record<
      string,
      unknown
    >;
    expect(persistedEffectState).not.toHaveProperty("slideSnapshotUrl");
    expect(persistedEffectState).not.toHaveProperty(
      "slideSnapshotContentHash",
    );
    expect(JSON.stringify(persistedEffectState)).not.toContain(
      "second private presenter script",
    );
  });

  it("reads audience slide snapshots only after validating participant access", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<svg>청중 공개 문장</svg>", {
        headers: { "content-type": "image/svg+xml; charset=utf-8" },
      })),
    );
    const storage = {
      getSignedReadUrl: vi.fn(
        async (key) => `https://cdn.example.test/${key}`,
      ),
    } as unknown as StoragePort;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("UPDATE audience_participants")) {
        return [
          {
            audience_id: "audience_00000000-0000-4000-8000-000000000001",
            session_id: "session_existing",
            nickname: "orbit",
            joined_at: "2026-07-05T00:00:00.000Z",
            last_seen_at: "2026-07-05T00:00:00.000Z",
            joined_before_end: true,
          },
        ];
      }

      if (sql.includes("SELECT audience_slide_snapshots_json")) {
        return [
          {
            audience_slide_snapshots_json: {
              deckVersion: 1,
              deckContentHash: "frozen-deck",
              generatedAt: "2026-07-05T00:00:00.000Z",
              slides: {
                slide_2: {
                  contentHash: "frozen-slide-2",
                  key: "audience-slide-snapshots/session_existing/slide_2-frozen.svg",
                  url: "https://cdn.example.test/slide_2-frozen.svg",
                },
              },
            },
          },
        ];
      }

      if (sql.includes("WHERE session_id = $1") && sql.includes("LIMIT 1")) {
        return [activeSessionRow];
      }

      return [];
    });
    const service = new PresentationSessionsService(
      { query } as unknown as DataSource,
      storage,
    );

    await expect(
      service.readAudienceSlideSnapshotContent({
        sessionId: "session_existing",
        audienceId: "audience_00000000-0000-4000-8000-000000000001",
        tokenHash: "token_hash",
        slideId: "slide_2",
        contentHash: "frozen-slide-2",
      }),
    ).resolves.toEqual({
      body: Buffer.from("<svg>청중 공개 문장</svg>"),
      contentType: "image/svg+xml",
    });
    expect(storage.getSignedReadUrl).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:9000/orbit-local/audience-slide-snapshots/session_existing/slide_2-frozen-slide-2.svg",
    );
  });

  it("attaches an audience-safe slide fallback when snapshot storage fails", async () => {
    const storage = {
      putObject: vi.fn(async () => {
        throw new Error("storage unavailable");
      }),
    } as unknown as StoragePort;
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("SELECT audience_slide_snapshots_json")) {
        return [{ audience_slide_snapshots_json: {} }];
      }

      if (sql.includes("FROM presentation_sessions ps")) {
        return [{ deck_json: audienceDeck }];
      }

      if (sql.includes("UPDATE audience_realtime_state")) {
        return [
          {
            session_id: "session_existing",
            slide_id: "slide_2",
            slide_index: 0,
            effect_state_json: params?.[3],
            active_interaction_id: null,
            updated_at: "2026-07-05T00:03:00.000Z",
          },
        ];
      }

      if (sql.includes("INSERT INTO audience_events")) {
        return [];
      }

      return [];
    });
    const service = new PresentationSessionsService(
      { query } as unknown as DataSource,
      storage,
    );

    await expect(
      service.updateAudienceRealtimeState({
        sessionId: "session_existing",
        actorId: "user_1",
        slideId: "slide_2",
        slideIndex: 0,
        effectState: { stepIndex: 1 },
      }),
    ).resolves.toMatchObject({
      effectState: {
        stepIndex: 1,
        slideFallback: {
          deck: {
            slides: [
              expect.objectContaining({
                slideId: "slide_2",
              }),
            ],
          },
          slideIndex: 0,
        },
      },
    });

    const updateCall = query.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE audience_realtime_state"),
    );
    const updateParams = updateCall?.[1] as unknown[] | undefined;
    const persistedEffectState = updateParams?.[3] as
      | {
          slideFallback?: {
            deck?: { slides?: Array<Record<string, unknown>> };
          };
        }
      | undefined;
    const fallbackSlide =
      persistedEffectState?.slideFallback?.deck?.slides?.[0];

    expect(fallbackSlide).not.toHaveProperty("speakerNotes");
    expect(JSON.stringify(updateCall?.[1]?.[3])).not.toContain(
      "private presenter script",
    );
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
        [
          {
            session_id: "session_existing",
            qna_enabled: true,
            ai_qna_enabled: true,
            polls_enabled: false,
            quizzes_enabled: false,
            reactions_enabled: false,
            survey_enabled: false,
            updated_at: "2026-07-05 17:34:57.692729+00",
          },
        ],
        1,
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
        updatedAt: "2026-07-05T17:34:57.692Z",
      },
    });

    expect(query.mock.calls[0][0]).toContain(
      "INNER JOIN presentation_sessions",
    );
    expect(query.mock.calls[0][0]).toContain(
      "features.updated_at::text AS updated_at",
    );
    expect(query.mock.calls[1][0]).toContain(
      "UPDATE audience_feature_settings",
    );
    expect(query.mock.calls[1][0]).toContain(
      "features.updated_at::text AS updated_at",
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
      .mockResolvedValueOnce([libraryRow])
      .mockResolvedValueOnce([{ session_id: "session_existing" }])
      .mockResolvedValueOnce([sessionInteractionRow]);
    const transactionQuery = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const transaction = vi.fn(
      async (
        callback: (manager: { query: typeof transactionQuery }) => Promise<unknown>,
      ) => callback({ query: transactionQuery }),
    );
    const service = new PresentationSessionsService({
      query,
      transaction,
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

    expect(query.mock.calls[0][1]?.[4]).toBe(
      JSON.stringify(libraryRow.questions_json),
    );
    expect(query.mock.calls[2][0]).toContain(
      "FROM project_interaction_library",
    );
    expect(transaction).toHaveBeenCalledOnce();
    expect(transactionQuery.mock.calls[0][0]).toContain(
      "DELETE FROM session_interactions",
    );
    expect(transactionQuery.mock.calls[1][0]).toContain(
      "INSERT INTO session_interactions",
    );
  });

  it("validates library selections before deleting existing prepared interactions", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ session_id: "session_existing" }])
      .mockResolvedValueOnce([{ session_id: "session_existing" }])
      .mockResolvedValueOnce([]);
    const transaction = vi.fn();
    const service = new PresentationSessionsService({
      query,
      transaction,
    } as unknown as DataSource);

    await expect(
      service.selectSessionInteractions(
        { projectId: "project_1", sessionId: "session_existing" },
        {
          libraryInteractionIds: [
            "library_interaction_00000000-0000-4000-8000-000000000999",
          ],
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(transaction).not.toHaveBeenCalled();
    expect(
      query.mock.calls.some((call) =>
        String(call[0]).includes("DELETE FROM session_interactions"),
      ),
    ).toBe(false);
  });

  it("clears prepared library interactions when the selected library list is empty", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ session_id: "session_existing" }])
      .mockResolvedValueOnce([{ session_id: "session_existing" }])
      .mockResolvedValueOnce([]);
    const transactionQuery = vi.fn().mockResolvedValueOnce([]);
    const transaction = vi.fn(
      async (
        callback: (manager: { query: typeof transactionQuery }) => Promise<unknown>,
      ) => callback({ query: transactionQuery }),
    );
    const service = new PresentationSessionsService({
      query,
      transaction,
    } as unknown as DataSource);

    await expect(
      service.selectSessionInteractions(
        { projectId: "project_1", sessionId: "session_existing" },
        { libraryInteractionIds: [] },
      ),
    ).resolves.toEqual({ interactions: [] });

    expect(transaction).toHaveBeenCalledOnce();
    expect(transactionQuery.mock.calls[0][0]).toContain(
      "DELETE FROM session_interactions",
    );
    expect(
      query.mock.calls.some((call) =>
        String(call[0]).includes("FROM project_interaction_library"),
      ),
    ).toBe(false);
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
      .mockResolvedValueOnce([
        {
          session_id: "session_existing",
          qna_enabled: false,
          ai_qna_enabled: false,
          polls_enabled: true,
          quizzes_enabled: false,
          reactions_enabled: false,
          survey_enabled: false,
          updated_at: "2026-07-05T00:00:00.000Z",
        },
      ])
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
      .mockResolvedValueOnce([
        {
          session_id: "session_existing",
          qna_enabled: false,
          ai_qna_enabled: false,
          polls_enabled: false,
          quizzes_enabled: true,
          reactions_enabled: false,
          survey_enabled: false,
          updated_at: "2026-07-05T00:00:00.000Z",
        },
      ])
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

    expect(query.mock.calls[4][0]).toContain("ON CONFLICT");
  });

  it("rejects poll and quiz responses when the matching feature is disabled", async () => {
    const participantRow = {
      audience_id: "audience_00000000-0000-4000-8000-000000000001",
      session_id: "session_existing",
      nickname: "orbit",
      joined_at: "2026-07-05T00:00:00.000Z",
      last_seen_at: "2026-07-05T00:00:00.000Z",
      joined_before_end: true,
    };
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
    const quizInteractionRow = {
      ...pollInteractionRow,
      kind: "quiz" as const,
      questions_json: [
        {
          type: "quiz-true-false" as const,
          questionId: "question_00000000-0000-4000-8000-000000000001",
          prompt: "맞나요?",
          correctAnswer: true,
        },
      ],
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce([participantRow])
      .mockResolvedValueOnce([activeSessionRow])
      .mockResolvedValueOnce([pollInteractionRow])
      .mockResolvedValueOnce([
        {
          session_id: "session_existing",
          qna_enabled: false,
          ai_qna_enabled: false,
          polls_enabled: false,
          quizzes_enabled: true,
          reactions_enabled: false,
          survey_enabled: false,
          updated_at: "2026-07-05T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([participantRow])
      .mockResolvedValueOnce([activeSessionRow])
      .mockResolvedValueOnce([quizInteractionRow])
      .mockResolvedValueOnce([
        {
          session_id: "session_existing",
          qna_enabled: false,
          ai_qna_enabled: false,
          polls_enabled: true,
          quizzes_enabled: false,
          reactions_enabled: false,
          survey_enabled: false,
          updated_at: "2026-07-05T00:00:00.000Z",
        },
      ]);
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.submitInteractionResponse({
        sessionId: "session_existing",
        audienceId: participantRow.audience_id,
        tokenHash: "token_hash",
        interactionId: pollInteractionRow.interaction_id,
        body: {
          questionId: "question_00000000-0000-4000-8000-000000000001",
          answer: { type: "scale", value: 5 },
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.submitInteractionResponse({
        sessionId: "session_existing",
        audienceId: participantRow.audience_id,
        tokenHash: "token_hash",
        interactionId: quizInteractionRow.interaction_id,
        body: {
          questionId: "question_00000000-0000-4000-8000-000000000001",
          answer: { type: "quiz-true-false", answer: true },
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(
      query.mock.calls.some((call) =>
        String(call[0]).includes("INSERT INTO interaction_responses"),
      ),
    ).toBe(false);
  });

  it("serializes ad-hoc interaction questions before inserting jsonb", async () => {
    const interactionRow = {
      interaction_id: "interaction_00000000-0000-4000-8000-000000000001",
      session_id: "session_existing",
      library_interaction_id: null,
      kind: "poll" as const,
      title: "현장 투표",
      questions_json: [
        {
          type: "choice" as const,
          questionId: "question_00000000-0000-4000-8000-000000000001",
          prompt: "어떤 주제가 가장 궁금한가요?",
          required: true,
          allowMultiple: false,
          options: [
            { optionId: "roadmap", label: "로드맵" },
            { optionId: "pricing", label: "가격" },
          ],
        },
      ],
      result_visibility: "live" as const,
      quiz_scoring: "none" as const,
      exposed_result_question_ids: [],
      source: "ad-hoc" as const,
      display_order: 0,
      activated_at: null,
      closed_at: null,
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ session_id: "session_existing" }])
      .mockResolvedValueOnce([interactionRow]);
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.createAdHocSessionInteraction(
        { projectId: "project_1", sessionId: "session_existing" },
        {
          kind: "poll",
          title: "현장 투표",
          questions: interactionRow.questions_json,
          resultVisibility: "live",
          quizScoring: "none",
        },
      ),
    ).resolves.toMatchObject({
      interaction: {
        kind: "poll",
        title: "현장 투표",
        questions: interactionRow.questions_json,
      },
    });

    expect(query.mock.calls[1][0]).toContain("$5::jsonb");
    expect(JSON.parse(query.mock.calls[1][1]?.[4] as string)).toEqual(
      interactionRow.questions_json,
    );
  });

  it("scores speed-bonus quiz answers from remaining time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T00:00:15.000Z"));
    try {
      const quizInteractionRow = {
        interaction_id: "interaction_00000000-0000-4000-8000-000000000001",
        session_id: "session_existing",
        kind: "quiz" as const,
        title: "속도 퀴즈",
        questions_json: [
          {
            type: "quiz-true-false" as const,
            questionId: "question_00000000-0000-4000-8000-000000000001",
            prompt: "맞나요?",
            correctAnswer: true,
            timeLimitSeconds: 30,
          },
        ],
        result_visibility: "after-close" as const,
        quiz_scoring: "speed-bonus" as const,
        source: "ad-hoc" as const,
        display_order: 0,
        activated_at: "2026-07-05T00:00:00.000Z",
        closed_at: null,
      };
      const responseRow = {
        response_id: "response_00000000-0000-4000-8000-000000000001",
        interaction_id: quizInteractionRow.interaction_id,
        session_id: "session_existing",
        audience_id: "audience_00000000-0000-4000-8000-000000000001",
        question_id: "question_00000000-0000-4000-8000-000000000001",
        answer_json: { type: "quiz-true-false" as const, answer: true },
        is_correct: true,
        score: 750,
        submitted_at: "2026-07-05T00:00:15.000Z",
        updated_at: "2026-07-05T00:00:15.000Z",
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
        .mockResolvedValueOnce([quizInteractionRow])
        .mockResolvedValueOnce([
          {
            session_id: "session_existing",
            qna_enabled: false,
            ai_qna_enabled: false,
            polls_enabled: false,
            quizzes_enabled: true,
            reactions_enabled: false,
            survey_enabled: false,
            updated_at: "2026-07-05T00:00:00.000Z",
          },
        ])
        .mockResolvedValueOnce([responseRow])
        .mockResolvedValueOnce([]);
      const service = new PresentationSessionsService({
        query,
      } as unknown as DataSource);

      await expect(
        service.submitInteractionResponse({
          sessionId: "session_existing",
          audienceId: "audience_00000000-0000-4000-8000-000000000001",
          tokenHash: "token_hash",
          interactionId: quizInteractionRow.interaction_id,
          body: {
            questionId: "question_00000000-0000-4000-8000-000000000001",
            answer: { type: "quiz-true-false", answer: true },
          },
        }),
      ).resolves.toMatchObject({
        response: {
          isCorrect: true,
          score: 750,
        },
      });
      expect(query.mock.calls[4][1][7]).toBe(750);
    } finally {
      vi.useRealTimers();
    }
  });

  it("activates ad-hoc interactions when update returning rows are wrapped", async () => {
    const interactionRow = {
      interaction_id: "interaction_00000000-0000-4000-8000-000000000201",
      session_id: "session_existing",
      kind: "poll" as const,
      title: "즉석 투표",
      questions_json: [
        {
          type: "choice" as const,
          questionId: "question_00000000-0000-4000-8000-000000000201",
          prompt: "가장 기대되는 흐름은?",
          required: true,
          options: [
            { optionId: "option_00000000-0000-4000-8000-000000000201", label: "Q&A" },
            { optionId: "option_00000000-0000-4000-8000-000000000202", label: "Poll" },
          ],
        },
      ],
      result_visibility: "manual" as const,
      quiz_scoring: "none" as const,
      exposed_result_question_ids: [],
      source: "ad-hoc" as const,
      display_order: 0,
      activated_at: "2026-07-05T00:03:00.000Z",
      closed_at: null,
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ session_id: "session_existing" }])
      .mockResolvedValueOnce([[interactionRow], 1])
      .mockResolvedValueOnce([
        {
          session_id: "session_existing",
          slide_id: null,
          slide_index: null,
          effect_state_json: {},
          active_interaction_id: interactionRow.interaction_id,
          updated_at: "2026-07-05T00:03:00.000Z",
        },
      ])
      .mockResolvedValueOnce([]);
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.activateSessionInteraction({
        projectId: "project_1",
        sessionId: "session_existing",
        interactionId: interactionRow.interaction_id,
        actorId: "user_1",
      }),
    ).resolves.toMatchObject({
      interaction: {
        interactionId: interactionRow.interaction_id,
        activatedAt: "2026-07-05T00:03:00.000Z",
      },
    });
  });

  it("keeps after-close quizzes visible and returns the audience answer reveal", async () => {
    const quizInteractionRow = {
      interaction_id: "interaction_00000000-0000-4000-8000-000000000101",
      session_id: "session_existing",
      kind: "quiz" as const,
      title: "이해도 확인",
      questions_json: [
        {
          type: "quiz-true-false" as const,
          questionId: "question_00000000-0000-4000-8000-000000000101",
          prompt: "청중은 로그인 없이 참여한다.",
          correctAnswer: true,
        },
      ],
      result_visibility: "after-close" as const,
      quiz_scoring: "correct-count" as const,
      source: "ad-hoc" as const,
      display_order: 0,
      activated_at: "2026-07-05T00:00:00.000Z",
      closed_at: null,
    };
    const closedQuizInteractionRow = {
      ...quizInteractionRow,
      closed_at: "2026-07-05T00:02:00.000Z",
    };
    const participantRow = {
      audience_id: "audience_00000000-0000-4000-8000-000000000001",
      session_id: "session_existing",
      nickname: "orbit",
      joined_at: "2026-07-05T00:00:00.000Z",
      last_seen_at: "2026-07-05T00:00:00.000Z",
      joined_before_end: true,
    };
    const featureRow = {
      session_id: "session_existing",
      qna_enabled: false,
      ai_qna_enabled: false,
      polls_enabled: false,
      quizzes_enabled: true,
      reactions_enabled: false,
      survey_enabled: false,
      updated_at: "2026-07-05T00:00:00.000Z",
    };
    const responseRow = {
      response_id: "response_00000000-0000-4000-8000-000000000101",
      interaction_id: quizInteractionRow.interaction_id,
      session_id: "session_existing",
      audience_id: "audience_00000000-0000-4000-8000-000000000001",
      question_id: "question_00000000-0000-4000-8000-000000000101",
      answer_json: { type: "quiz-true-false" as const, answer: false },
      is_correct: false,
      score: 0,
      submitted_at: "2026-07-05T00:00:15.000Z",
      updated_at: "2026-07-05T00:00:15.000Z",
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ session_id: "session_existing" }])
      .mockResolvedValueOnce([closedQuizInteractionRow])
      .mockResolvedValueOnce([
        {
          session_id: "session_existing",
          slide_id: null,
          slide_index: null,
          effect_state_json: {},
          active_interaction_id: quizInteractionRow.interaction_id,
          updated_at: "2026-07-05T00:02:00.000Z",
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([participantRow])
      .mockResolvedValueOnce([activeSessionRow])
      .mockResolvedValueOnce([featureRow])
      .mockResolvedValueOnce([closedQuizInteractionRow])
      .mockResolvedValueOnce([activeSessionRow])
      .mockResolvedValueOnce([{ session_id: "session_existing" }])
      .mockResolvedValueOnce([closedQuizInteractionRow])
      .mockResolvedValueOnce([responseRow])
      .mockResolvedValueOnce([responseRow]);
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.closeSessionInteraction({
        projectId: "project_1",
        sessionId: "session_existing",
        interactionId: quizInteractionRow.interaction_id,
        actorId: "user_1",
      }),
    ).resolves.toMatchObject({
      interaction: { closedAt: "2026-07-05T00:02:00.000Z" },
    });

    const stateUpdateCall = query.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE audience_realtime_state"),
    );
    expect(stateUpdateCall?.[1]?.[4]).toBe(quizInteractionRow.interaction_id);

    await expect(
      service.getAudienceActiveInteraction({
        sessionId: "session_existing",
        audienceId: "audience_00000000-0000-4000-8000-000000000001",
        tokenHash: "token_hash",
      }),
    ).resolves.toMatchObject({
      interaction: {
        interactionId: quizInteractionRow.interaction_id,
        closedAt: "2026-07-05T00:02:00.000Z",
      },
      quizReveal: [
        {
          questionId: "question_00000000-0000-4000-8000-000000000101",
          correctAnswer: { type: "quiz-true-false", answer: true },
          submittedAnswer: { type: "quiz-true-false", answer: false },
          isCorrect: false,
          score: 0,
        },
      ],
    });
  });

  it("keeps manual interaction results hidden until the question is exposed", async () => {
    const interactionRow = {
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
      result_visibility: "manual" as const,
      quiz_scoring: "none" as const,
      exposed_result_question_ids: [],
      source: "ad-hoc" as const,
      display_order: 0,
      activated_at: "2026-07-05T00:00:00.000Z",
      closed_at: null,
    };
    const responseRow = {
      response_id: "response_00000000-0000-4000-8000-000000000001",
      interaction_id: interactionRow.interaction_id,
      session_id: "session_existing",
      audience_id: "audience_00000000-0000-4000-8000-000000000001",
      question_id: "question_00000000-0000-4000-8000-000000000001",
      answer_json: { type: "scale" as const, value: 5 },
      is_correct: null,
      score: 0,
      submitted_at: "2026-07-05T00:00:01.000Z",
      updated_at: "2026-07-05T00:00:01.000Z",
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ session_id: "session_existing" }])
      .mockResolvedValueOnce([interactionRow])
      .mockResolvedValueOnce([responseRow])
      .mockResolvedValueOnce([{ session_id: "session_existing" }])
      .mockResolvedValueOnce([
        {
          ...interactionRow,
          exposed_result_question_ids: [
            "question_00000000-0000-4000-8000-000000000001",
          ],
        },
      ])
      .mockResolvedValueOnce([responseRow]);
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.getInteractionResults({
        projectId: "project_1",
        sessionId: "session_existing",
        interactionId: interactionRow.interaction_id,
        audienceVisible: true,
      }),
    ).resolves.toMatchObject({
      results: {
        visibleToAudience: false,
        questionResults: [{ responseCount: 0, average: null }],
      },
    });

    await expect(
      service.getInteractionResults({
        projectId: "project_1",
        sessionId: "session_existing",
        interactionId: interactionRow.interaction_id,
        audienceVisible: true,
      }),
    ).resolves.toMatchObject({
      results: {
        visibleToAudience: true,
        questionResults: [{ responseCount: 1, average: 5 }],
      },
    });
  });

  it("submits audience questions and lets presenter mark them answered", async () => {
    const participantRow = {
      audience_id: "audience_00000000-0000-4000-8000-000000000001",
      session_id: "session_existing",
      nickname: "orbit",
      joined_at: "2026-07-05T00:00:00.000Z",
      last_seen_at: "2026-07-05T00:00:00.000Z",
      joined_before_end: true,
    };
    const questionRow = {
      question_id: "question_00000000-0000-4000-8000-000000000001",
      question_group_id: "question_00000000-0000-4000-8000-000000000001",
      session_id: "session_existing",
      audience_id: "audience_00000000-0000-4000-8000-000000000001",
      text: "질문입니다",
      status: "pending" as const,
      submitted_at: "2026-07-05T00:00:01.000Z",
      answered_at: null,
    };
    const answeredQuestionRow = {
      ...questionRow,
      status: "answered" as const,
      answered_at: "2026-07-05T00:01:00.000Z",
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce([participantRow])
      .mockResolvedValueOnce([activeSessionRow])
      .mockResolvedValueOnce([
        {
          session_id: "session_existing",
          qna_enabled: true,
          ai_qna_enabled: false,
          polls_enabled: false,
          quizzes_enabled: false,
          reactions_enabled: false,
          survey_enabled: false,
          updated_at: "2026-07-05T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([questionRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ session_id: "session_existing" }])
      .mockResolvedValueOnce([questionRow])
      .mockResolvedValueOnce([{ session_id: "session_existing" }])
      .mockResolvedValueOnce([answeredQuestionRow])
      .mockResolvedValueOnce([]);
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.submitAudienceQuestion({
        sessionId: "session_existing",
        audienceId: "audience_00000000-0000-4000-8000-000000000001",
        tokenHash: "token_hash",
        body: { text: "질문입니다" },
      }),
    ).resolves.toMatchObject({
      question: {
        text: "질문입니다",
        status: "pending",
      },
    });

    await expect(
      service.listPresenterQuestions({
        projectId: "project_1",
        sessionId: "session_existing",
      }),
    ).resolves.toMatchObject({
      questions: [{ status: "pending" }],
    });

    await expect(
      service.markQuestionAnswered({
        projectId: "project_1",
        sessionId: "session_existing",
        questionId: "question_00000000-0000-4000-8000-000000000001",
        actorId: "user_1",
      }),
    ).resolves.toMatchObject({
      question: { status: "answered" },
    });

    expect(query.mock.calls[4][0]).toContain("INSERT INTO audience_questions");
    expect(query.mock.calls[9][0]).toContain("UPDATE audience_questions");
  });

  it("merges highly similar audience questions into an existing group", async () => {
    const participantRow = {
      audience_id: "audience_00000000-0000-4000-8000-000000000002",
      session_id: "session_existing",
      nickname: "orbit2",
      joined_at: "2026-07-05T00:00:00.000Z",
      last_seen_at: "2026-07-05T00:00:00.000Z",
      joined_before_end: true,
    };
    const existingQuestionRow = {
      question_id: "question_00000000-0000-4000-8000-000000000001",
      question_group_id: "question_00000000-0000-4000-8000-000000000001",
      session_id: "session_existing",
      audience_id: "audience_00000000-0000-4000-8000-000000000001",
      text: "가격 정책은 어떻게 되나요",
      status: "pending" as const,
      submitted_at: "2026-07-05T00:00:01.000Z",
      answered_at: null,
    };
    const mergedQuestionRow = {
      ...existingQuestionRow,
      question_id: "question_00000000-0000-4000-8000-000000000002",
      audience_id: "audience_00000000-0000-4000-8000-000000000002",
      text: "가격 정책은 어떻게 되나요?",
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce([participantRow])
      .mockResolvedValueOnce([activeSessionRow])
      .mockResolvedValueOnce([
        {
          session_id: "session_existing",
          qna_enabled: true,
          ai_qna_enabled: false,
          polls_enabled: false,
          quizzes_enabled: false,
          reactions_enabled: false,
          survey_enabled: false,
          updated_at: "2026-07-05T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([existingQuestionRow])
      .mockResolvedValueOnce([mergedQuestionRow])
      .mockResolvedValueOnce([]);
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.submitAudienceQuestion({
        sessionId: "session_existing",
        audienceId: "audience_00000000-0000-4000-8000-000000000002",
        tokenHash: "token_hash",
        body: { text: "가격 정책은 어떻게 되나요?" },
      }),
    ).resolves.toMatchObject({
      question: {
        questionGroupId: "question_00000000-0000-4000-8000-000000000001",
      },
    });

    expect(query.mock.calls[4][1][1]).toBe(
      "question_00000000-0000-4000-8000-000000000001",
    );
  });

  it("stores asker-only AI answers when AI Q&A is enabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            status: "answered",
            answerText: "공개 자료 기반 답변",
            sourceReferences: ["file_1"],
            confidence: 0.82,
          }),
        ),
      ),
    );
    const participantRow = {
      audience_id: "audience_00000000-0000-4000-8000-000000000001",
      session_id: "session_existing",
      nickname: "orbit",
      joined_at: "2026-07-05T00:00:00.000Z",
      last_seen_at: "2026-07-05T00:00:00.000Z",
      joined_before_end: true,
    };
    const questionRow = {
      question_id: "question_00000000-0000-4000-8000-000000000001",
      question_group_id: "question_00000000-0000-4000-8000-000000000001",
      session_id: "session_existing",
      audience_id: "audience_00000000-0000-4000-8000-000000000001",
      text: "AI 질문입니다",
      status: "pending" as const,
      submitted_at: "2026-07-05T00:00:01.000Z",
      answered_at: null,
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce([participantRow])
      .mockResolvedValueOnce([activeSessionRow])
      .mockResolvedValueOnce([
        {
          session_id: "session_existing",
          qna_enabled: true,
          ai_qna_enabled: true,
          polls_enabled: false,
          quizzes_enabled: false,
          reactions_enabled: false,
          survey_enabled: false,
          updated_at: "2026-07-05T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([questionRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([activeSessionRow])
      .mockResolvedValueOnce([{ selected_reference_ids_json: ["file_1"] }])
      .mockResolvedValueOnce([{ slide_id: "slide_2", deck_json: audienceDeck }])
      .mockResolvedValueOnce([
        {
          question_id: "question_00000000-0000-4000-8000-000000000001",
          session_id: "session_existing",
          audience_id: "audience_00000000-0000-4000-8000-000000000001",
          answer_text: "공개 자료 기반 답변",
          source_references_json: ["file_1"],
          confidence: 0.82,
          failure_reason: null,
          feedback: null,
          escalated_to_presenter: false,
          created_at: "2026-07-05T00:00:02.000Z",
        },
      ])
      .mockResolvedValueOnce([]);
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.submitAudienceQuestion({
        sessionId: "session_existing",
        audienceId: "audience_00000000-0000-4000-8000-000000000001",
        tokenHash: "token_hash",
        body: { text: "AI 질문입니다" },
      }),
    ).resolves.toMatchObject({
      question: { text: "AI 질문입니다" },
    });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/qna/answer",
      expect.objectContaining({ method: "POST" }),
    );
    const workerRequest = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    ) as Record<string, unknown>;
    expect(workerRequest.publicSlideContext).toContain("공개 슬라이드");
    expect(workerRequest.publicSlideContext).toContain("청중 공개 문장");
    expect(workerRequest.publicSlideContext).not.toContain(
      "private presenter script",
    );
    expect(query.mock.calls[8][0]).toContain(
      "ON d.project_id = ps.project_id",
    );
    expect(query.mock.calls[8][0]).toContain("AND d.deck_id = ps.deck_id");
    expect(query.mock.calls[9][0]).toContain(
      "INSERT INTO audience_question_answers",
    );
    expect(query.mock.calls[9][1]?.[4]).toBe(JSON.stringify(["file_1"]));
    expect(query.mock.calls[9][0]).not.toContain(
      "created_at::text AS created_at\n        )",
    );
    expect(query.mock.calls[10][0]).toContain("UPDATE audience_questions");
    expect(query.mock.calls[10][0]).toContain("SET status = 'answered'");
    expect(query.mock.calls[10][1]).toEqual([
      "session_existing",
      "question_00000000-0000-4000-8000-000000000001",
    ]);
  });

  it("keeps AI Q&A failures pending for presenter follow-up", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            status: "failed",
            failureReason: "low-confidence",
            sourceReferences: [],
            confidence: 0.21,
          }),
        ),
      ),
    );
    const participantRow = {
      audience_id: "audience_00000000-0000-4000-8000-000000000001",
      session_id: "session_existing",
      nickname: "orbit",
      joined_at: "2026-07-05T00:00:00.000Z",
      last_seen_at: "2026-07-05T00:00:00.000Z",
      joined_before_end: true,
    };
    const questionRow = {
      question_id: "question_00000000-0000-4000-8000-000000000001",
      question_group_id: "question_00000000-0000-4000-8000-000000000001",
      session_id: "session_existing",
      audience_id: "audience_00000000-0000-4000-8000-000000000001",
      text: "AI 질문입니다",
      status: "pending" as const,
      submitted_at: "2026-07-05T00:00:01.000Z",
      answered_at: null,
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce([participantRow])
      .mockResolvedValueOnce([activeSessionRow])
      .mockResolvedValueOnce([
        {
          session_id: "session_existing",
          qna_enabled: true,
          ai_qna_enabled: true,
          polls_enabled: false,
          quizzes_enabled: false,
          reactions_enabled: false,
          survey_enabled: false,
          updated_at: "2026-07-05T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([questionRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([activeSessionRow])
      .mockResolvedValueOnce([{ selected_reference_ids_json: [] }])
      .mockResolvedValueOnce([{ slide_id: "slide_2", deck_json: audienceDeck }])
      .mockResolvedValueOnce([
        {
          question_id: "question_00000000-0000-4000-8000-000000000001",
          session_id: "session_existing",
          audience_id: "audience_00000000-0000-4000-8000-000000000001",
          answer_text: null,
          source_references_json: [],
          confidence: 0.21,
          failure_reason: "low-confidence",
          feedback: null,
          escalated_to_presenter: true,
          created_at: "2026-07-05T00:00:02.000Z",
        },
      ]);
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.submitAudienceQuestion({
        sessionId: "session_existing",
        audienceId: "audience_00000000-0000-4000-8000-000000000001",
        tokenHash: "token_hash",
        body: { text: "AI 질문입니다" },
      }),
    ).resolves.toMatchObject({
      question: { status: "pending" },
    });

    expect(
      query.mock.calls.some((call) =>
        String(call[0]).includes("UPDATE audience_questions"),
      ),
    ).toBe(false);
  });

  it("returns and updates selected AI reference ids for presenter setup", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ session_id: "session_existing" }])
      .mockResolvedValueOnce([{ selected_reference_ids_json: ["file_1"] }])
      .mockResolvedValueOnce([{ session_id: "session_existing" }])
      .mockResolvedValueOnce([{ selected_reference_ids_json: ["file_2"] }]);
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.getAiReferenceSelection({
        projectId: "project_1",
        sessionId: "session_existing",
      }),
    ).resolves.toEqual({ referenceIds: ["file_1"] });

    await expect(
      service.updateAiReferenceSelection(
        { projectId: "project_1", sessionId: "session_existing" },
        { referenceIds: ["file_2"] },
      ),
    ).resolves.toEqual({ referenceIds: ["file_2"] });
    expect(query.mock.calls[3][1]).toEqual([
      "project_1",
      "session_existing",
      JSON.stringify(["file_2"]),
    ]);
  });

  it("submits enabled audience reactions as events", async () => {
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
      .mockResolvedValueOnce([
        {
          session_id: "session_existing",
          qna_enabled: false,
          ai_qna_enabled: false,
          polls_enabled: false,
          quizzes_enabled: false,
          reactions_enabled: true,
          survey_enabled: false,
          updated_at: "2026-07-05T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([]);
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.submitReaction({
        sessionId: "session_existing",
        audienceId: "audience_00000000-0000-4000-8000-000000000001",
        tokenHash: "token_hash",
        body: { reaction: "clap" },
      }),
    ).resolves.toEqual({ reaction: "clap", accepted: true });

    expect(query.mock.calls[3][0]).toContain("INSERT INTO audience_events");
    expect(query.mock.calls[3][1][4]).toBe("reaction.sent");
  });

  it("rate limits audience reactions per participant", async () => {
    const participantRow = {
      audience_id: "audience_00000000-0000-4000-8000-000000000001",
      session_id: "session_existing",
      nickname: "orbit",
      joined_at: "2026-07-05T00:00:00.000Z",
      last_seen_at: "2026-07-05T00:00:00.000Z",
      joined_before_end: true,
    };
    const featureRow = {
      session_id: "session_existing",
      qna_enabled: false,
      ai_qna_enabled: false,
      polls_enabled: false,
      quizzes_enabled: false,
      reactions_enabled: true,
      survey_enabled: false,
      updated_at: "2026-07-05T00:00:00.000Z",
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("UPDATE audience_participants")) {
        return [participantRow];
      }
      if (sql.includes("FROM presentation_sessions")) {
        return [activeSessionRow];
      }
      if (sql.includes("FROM audience_feature_settings")) {
        return [featureRow];
      }
      return [];
    });
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);
    const input = {
      sessionId: "session_existing",
      audienceId: "audience_00000000-0000-4000-8000-000000000001",
      tokenHash: "token_hash",
      body: { reaction: "clap" },
    };

    for (let index = 0; index < 5; index += 1) {
      await expect(service.submitReaction(input)).resolves.toEqual({
        reaction: "clap",
        accepted: true,
      });
    }

    await expect(service.submitReaction(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("rejects audience reactions when the feature is disabled", async () => {
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
      .mockResolvedValueOnce([
        {
          session_id: "session_existing",
          qna_enabled: false,
          ai_qna_enabled: false,
          polls_enabled: false,
          quizzes_enabled: false,
          reactions_enabled: false,
          survey_enabled: false,
          updated_at: "2026-07-05T00:00:00.000Z",
        },
      ]);
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.submitReaction({
        sessionId: "session_existing",
        audienceId: "audience_00000000-0000-4000-8000-000000000001",
        tokenHash: "token_hash",
        body: { reaction: "clap" },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("upserts survey forms only while the session is draft", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([activeSessionRow])
      .mockResolvedValueOnce([surveyFormRow]);
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.upsertSessionSurveyForm({
        projectId: "project_1",
        sessionId: "session_existing",
        body: {
          title: "발표 설문",
          questions: surveyFormRow.questions_json,
          contact: surveyFormRow.contact_json,
        },
      }),
    ).resolves.toMatchObject({ survey: { title: "발표 설문" } });
    expect(query.mock.calls[1][0]).toContain(
      "INSERT INTO session_survey_forms",
    );

    const lockedService = new PresentationSessionsService({
      query: vi.fn(async () => [{ ...activeSessionRow, status: "live" }]),
    } as unknown as DataSource);
    await expect(
      lockedService.upsertSessionSurveyForm({
        projectId: "project_1",
        sessionId: "session_existing",
        body: {
          title: "발표 설문",
          questions: [],
          contact: surveyFormRow.contact_json,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("submits eligible survey responses and rejects missing required answers", async () => {
    const participantRow = {
      audience_id: "audience_00000000-0000-4000-8000-000000000001",
      session_id: "session_existing",
      nickname: "orbit",
      joined_at: "2026-07-05T00:00:00.000Z",
      last_seen_at: "2026-07-05T00:00:00.000Z",
      joined_before_end: true,
    };
    const featureRow = {
      session_id: "session_existing",
      qna_enabled: false,
      ai_qna_enabled: false,
      polls_enabled: false,
      quizzes_enabled: false,
      reactions_enabled: false,
      survey_enabled: true,
      updated_at: "2026-07-05T00:00:00.000Z",
    };
    const responseRow = {
      response_id: "survey_response_00000000-0000-4000-8000-000000000001",
      survey_id: surveyFormRow.survey_id,
      session_id: "session_existing",
      audience_id: participantRow.audience_id,
      submitted_at: "2026-07-05T00:35:00.000Z",
      answers_json: {
        "question_00000000-0000-4000-8000-000000000001": 5,
      },
      contact_consent: false,
      contact_answers_json: {},
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("UPDATE audience_participants")) return [participantRow];
      if (sql.includes("FROM presentation_sessions")) return [endedSessionRow];
      if (sql.includes("FROM audience_feature_settings")) return [featureRow];
      if (sql.includes("FROM session_survey_forms")) return [surveyFormRow];
      if (sql.includes("INSERT INTO session_survey_responses")) {
        return [responseRow];
      }
      return [];
    });
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.submitSurveyResponse({
        sessionId: "session_existing",
        audienceId: participantRow.audience_id,
        tokenHash: "token_hash",
        body: {
          answers: {
            "question_00000000-0000-4000-8000-000000000001": 5,
          },
          contactConsent: false,
          contactAnswers: {},
        },
      }),
    ).resolves.toMatchObject({
      response: { contactConsent: false },
    });

    await expect(
      service.submitSurveyResponse({
        sessionId: "session_existing",
        audienceId: participantRow.audience_id,
        tokenHash: "token_hash",
        body: {
          answers: {},
          contactConsent: false,
          contactAnswers: {},
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects duplicate survey submissions", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("UPDATE audience_participants")) {
        return [
          {
            audience_id: "audience_00000000-0000-4000-8000-000000000001",
            session_id: "session_existing",
            nickname: "orbit",
            joined_at: "2026-07-05T00:00:00.000Z",
            last_seen_at: "2026-07-05T00:00:00.000Z",
            joined_before_end: true,
          },
        ];
      }
      if (sql.includes("FROM presentation_sessions")) return [endedSessionRow];
      if (sql.includes("FROM audience_feature_settings")) {
        return [
          {
            session_id: "session_existing",
            qna_enabled: false,
            ai_qna_enabled: false,
            polls_enabled: false,
            quizzes_enabled: false,
            reactions_enabled: false,
            survey_enabled: true,
            updated_at: "2026-07-05T00:00:00.000Z",
          },
        ];
      }
      if (sql.includes("FROM session_survey_forms")) return [surveyFormRow];
      if (sql.includes("INSERT INTO session_survey_responses")) {
        throw Object.assign(new Error("duplicate"), { code: "23505" });
      }
      return [];
    });
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.submitSurveyResponse({
        sessionId: "session_existing",
        audienceId: "audience_00000000-0000-4000-8000-000000000001",
        tokenHash: "token_hash",
        body: {
          answers: {
            "question_00000000-0000-4000-8000-000000000001": 5,
          },
          contactConsent: false,
          contactAnswers: {},
        },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("exports survey-only CSV with nickname and contact fields", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([surveyFormRow])
      .mockResolvedValueOnce([
        {
          response_id: "survey_response_00000000-0000-4000-8000-000000000001",
          survey_id: surveyFormRow.survey_id,
          session_id: "session_existing",
          audience_id: "audience_00000000-0000-4000-8000-000000000001",
          submitted_at: "2026-07-05T00:35:00.000Z",
          answers_json: {
            "question_00000000-0000-4000-8000-000000000001": 4,
          },
          contact_consent: true,
          contact_answers_json: {
            "question_00000000-0000-4000-8000-000000000002":
              "person@example.com",
          },
          nickname: "orbit",
        },
      ]);
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    const csv = await service.exportSessionSurveyCsv({
      projectId: "project_1",
      sessionId: "session_existing",
    });

    expect(csv).toContain("submittedAt,nickname,answer:만족도");
    expect(csv).toContain("orbit");
    expect(csv).toContain("person@example.com");
    expect(csv).not.toContain("reaction");
  });

  it("returns presenter session aggregate results and survey responses", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT session_id") && sql.includes("presentation_sessions")) {
        return [{ session_id: "session_existing" }];
      }
      if (sql.includes("FROM audience_questions")) {
        return [{ total: "2", unanswered: "1" }];
      }
      if (sql.includes("type = 'reaction.sent'")) {
        return [{ reaction: "clap", count: "3" }];
      }
      if (sql.includes("FROM session_interactions")) {
        return [
          {
            interaction_id: "interaction_00000000-0000-4000-8000-000000000001",
            kind: "poll",
            title: "만족도",
            response_count: "4",
          },
        ];
      }
      if (sql.includes("SELECT count(*) AS response_count")) {
        return [{ response_count: "1" }];
      }
      if (sql.includes("INSERT INTO audience_aggregate_reports")) {
        return [
          {
            report_id: "audience_report_00000000-0000-4000-8000-000000000001",
            session_id: "session_existing",
            status: "preliminary",
            aggregate_json: {
              qna: { total: 2, unanswered: 1 },
              reactions: { clap: 3 },
              interactions: [],
              survey: { responseCount: 1 },
            },
            generated_at: "2026-07-05T00:00:00.000Z",
            raw_data_deleted_at: null,
          },
        ];
      }
      if (sql.includes("FROM session_survey_responses AS responses")) {
        return [
          {
            response_id: "survey_response_00000000-0000-4000-8000-000000000001",
            survey_id: surveyFormRow.survey_id,
            session_id: "session_existing",
            audience_id: "audience_00000000-0000-4000-8000-000000000001",
            submitted_at: "2026-07-05T00:35:00.000Z",
            answers_json: {},
            contact_consent: false,
            contact_answers_json: {},
          },
        ];
      }
      return [];
    });
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.getSessionResults({
        projectId: "project_1",
        sessionId: "session_existing",
      }),
    ).resolves.toMatchObject({
      report: { status: "preliminary" },
      surveyResponses: [{ contactConsent: false }],
    });
  });

  it("returns gone for survey CSV after raw data cleanup", async () => {
    const service = new PresentationSessionsService({
      query: vi.fn(async () => [
        { raw_data_deleted_at: "2026-08-04T00:00:00.000Z" },
      ]),
    } as unknown as DataSource);

    await expect(
      service.exportSessionSurveyCsv({
        projectId: "project_1",
        sessionId: "session_existing",
      }),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it("cleans up expired raw audience data while retaining aggregate reports", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("WHERE raw_data_delete_after <= $1")) {
        return [endedSessionRow];
      }
      if (sql.includes("SELECT raw_data_deleted_at")) return [];
      if (sql.includes("SELECT session_id")) return [{ session_id: "session_existing" }];
      if (sql.includes("FROM audience_questions")) {
        return [{ total: "0", unanswered: "0" }];
      }
      if (sql.includes("type = 'reaction.sent'")) return [];
      if (sql.includes("FROM session_interactions")) return [];
      if (sql.includes("SELECT count(*) AS response_count")) {
        return [{ response_count: "0" }];
      }
      if (sql.includes("INSERT INTO audience_aggregate_reports")) {
        return [
          {
            report_id: "audience_report_00000000-0000-4000-8000-000000000001",
            session_id: "session_existing",
            status: "final",
            aggregate_json: {
              qna: { total: 0, unanswered: 0 },
              reactions: {},
              interactions: [],
              survey: { responseCount: 0 },
            },
            generated_at: "2026-07-05T00:00:00.000Z",
            raw_data_deleted_at: null,
          },
        ];
      }
      return [];
    });
    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.cleanupExpiredAudienceRawData(
        new Date("2026-08-05T00:00:00.000Z"),
      ),
    ).resolves.toEqual({ cleanedCount: 1 });
    expect(
      query.mock.calls.some((call) =>
        String(call[0]).includes("DELETE FROM session_survey_responses"),
      ),
    ).toBe(true);
    expect(
      query.mock.calls.some((call) =>
        String(call[0]).includes("DELETE FROM audience_aggregate_reports"),
      ),
    ).toBe(false);
  });
});
