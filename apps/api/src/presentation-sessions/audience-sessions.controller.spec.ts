import {
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudienceSessionsController } from "./audience-sessions.controller";
import { PresentationSessionsService } from "./presentation-sessions.service";

const session = {
  sessionId: "session_existing",
  projectId: "project_1",
  deckId: "deck_1",
  presenterUserId: "user_1",
  joinCode: "123456",
  status: "draft" as const,
  entryStatus: "open" as const,
  audienceSlideRenderMode: "image-first" as const,
  createdAt: "2026-07-05T00:00:00.000Z",
  startedAt: null,
  endedAt: null,
  surveyClosesAt: null,
  rawDataDeleteAfter: "2026-08-04T00:00:00.000Z",
};

const participant = {
  audienceId: "audience_00000000-0000-4000-8000-000000000001",
  sessionId: "session_existing",
  nickname: "orbit",
  joinedAt: "2026-07-05T00:00:01.000Z",
  lastSeenAt: "2026-07-05T00:00:01.000Z",
  joinedBeforeEnd: true,
};

function createController(
  overrides: Partial<PresentationSessionsService> = {},
) {
  const service = {
    getActiveSessionByJoinCode: vi.fn(async () => session),
    joinAudience: vi.fn(async () => ({
      session: {
        sessionId: session.sessionId,
        projectId: session.projectId,
        joinCode: session.joinCode,
        status: session.status,
        entryStatus: session.entryStatus,
      },
      participant,
    })),
    getAudienceMe: vi.fn(),
    getAudienceState: vi.fn(),
    getAudienceSurveyForm: vi.fn(),
    submitSurveyResponse: vi.fn(),
    ...overrides,
  } as unknown as PresentationSessionsService;
  const audienceRealtimeGateway = {
    broadcastReaction: vi.fn(),
  };

  return {
    audienceRealtimeGateway,
    controller: new AudienceSessionsController(
      service,
      audienceRealtimeGateway as any,
    ),
    service,
  };
}

function createRequest(
  args: {
    signedAudienceToken?: string;
    userAgent?: string;
    ip?: string;
  } = {},
) {
  return {
    headers: {
      "user-agent": args.userAgent ?? "vitest",
    },
    ip: args.ip ?? "127.0.0.1",
    signedCookies: args.signedAudienceToken
      ? { orbit_audience_access: args.signedAudienceToken }
      : {},
    socket: {},
  } as any;
}

describe("AudienceSessionsController", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.APP_ENV = "test";
    process.env.WEB_PORT = "5173";
    process.env.API_PORT = "3000";
    process.env.WORKER_PORT = "3001";
    process.env.PYTHON_WORKER_PORT = "8000";
    process.env.WEB_ORIGIN = "http://localhost:5173";
    process.env.API_BASE_URL = "http://localhost:3000";
    process.env.PYTHON_WORKER_URL = "http://localhost:8000";
    process.env.DATABASE_URL = "postgres://orbit:orbit@localhost:5432/orbit";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.SESSION_SECRET = "test-session-secret";
    process.env.COOKIE_SECRET = "test-cookie-secret";
    process.env.STORAGE_DRIVER = "minio";
    process.env.S3_ENDPOINT = "http://localhost:9000";
    process.env.S3_PUBLIC_ENDPOINT = "http://localhost:9000";
    process.env.S3_BUCKET = "orbit-local";
    process.env.S3_REGION = "ap-northeast-2";
    process.env.S3_ACCESS_KEY_ID = "test";
    process.env.S3_SECRET_ACCESS_KEY = "test";
    process.env.JOB_QUEUE_DRIVER = "bullmq";
    process.env.LIVE_STT_PROVIDER = "web-speech";
    process.env.REPORT_STT_PROVIDER = "openai";
    process.env.OCR_PROVIDER = "python";
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_MODEL = "gpt-4.1-mini";
    process.env.OPENAI_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
    process.env.OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
    process.env.AWS_REGION = "ap-northeast-2";
    process.env.TRANSCRIBE_LANGUAGE_CODE = "ko-KR";
    process.env.DEMO_USER_ID = "user_demo_1";
    process.env.DEMO_WORKSPACE_ID = "workspace_demo_1";
    process.env.DEMO_PROJECT_ID = "project_demo_1";
    process.env.DEMO_DECK_ID = "deck_demo_1";
    process.env.DEMO_SESSION_ID = "session_demo_1";
  });

  it("looks up a public audience session without presenter fields", async () => {
    const { controller, service } = createController();

    const result = await controller.getJoinSession("123456", createRequest());

    expect(service.getActiveSessionByJoinCode).toHaveBeenCalledWith("123456");
    expect(result).toEqual({
      session: {
        sessionId: "session_existing",
        projectId: "project_1",
        joinCode: "123456",
        status: "draft",
        entryStatus: "open",
      },
    });
    expect(result.session).not.toHaveProperty("deckId");
    expect(result.session).not.toHaveProperty("presenterUserId");
  });

  it("restores an ended session for an existing audience cookie when join lookup is no longer active", async () => {
    const response = { cookie: vi.fn() } as any;
    const initial = createController();
    await initial.controller.joinSession(
      "123456",
      { nickname: "orbit" },
      createRequest({ userAgent: "vitest-ended-restore" }),
      response,
    );
    const signedAudienceToken = response.cookie.mock.calls[0][1] as string;
    const endedSession = {
      ...session,
      status: "ended" as const,
      entryStatus: "closed" as const,
      endedAt: "2026-07-05T00:30:00.000Z",
      surveyClosesAt: "2999-07-05T01:30:00.000Z",
    };
    const { controller, service } = createController({
      getActiveSessionByJoinCode: vi.fn(async () => {
        throw new NotFoundException("입장 코드를 확인해 주세요.");
      }),
      getAudienceMe: vi.fn(async () => ({
        session: {
          sessionId: endedSession.sessionId,
          projectId: endedSession.projectId,
          joinCode: endedSession.joinCode,
          status: endedSession.status,
          entryStatus: endedSession.entryStatus,
        },
        participant,
      })),
    });

    await expect(
      controller.getJoinSession(
        "123456",
        createRequest({
          signedAudienceToken,
          userAgent: "vitest-ended-restore",
        }),
      ),
    ).resolves.toEqual({
      session: {
        sessionId: "session_existing",
        projectId: "project_1",
        joinCode: "123456",
        status: "ended",
        entryStatus: "closed",
      },
    });
    expect(service.getAudienceMe).toHaveBeenCalledWith(
      "session_existing",
      expect.stringMatching(/^audience_[0-9a-f-]{36}$/),
      expect.any(String),
    );
  });

  it("sets an HttpOnly audience cookie when joining by nickname", async () => {
    const { controller, service } = createController();
    const response = { cookie: vi.fn() } as any;

    const result = await controller.joinSession(
      "123456",
      { nickname: " orbit " },
      createRequest(),
      response,
    );

    expect(service.joinAudience).toHaveBeenCalledWith(
      session,
      expect.objectContaining({
        nickname: "orbit",
        tokenHash: expect.any(String),
      }),
    );
    expect(response.cookie).toHaveBeenCalledWith(
      "orbit_audience_access",
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        signed: true,
      }),
    );
    expect(result).toMatchObject({
      session: {
        sessionId: "session_existing",
        joinCode: "123456",
      },
      participant: {
        nickname: "orbit",
      },
    });
    expect(result.session).not.toHaveProperty("presenterUserId");
  });

  it("rate limits join attempts by IP and join code", async () => {
    const { controller } = createController();
    const response = { cookie: vi.fn() } as any;

    for (let index = 0; index < 10; index += 1) {
      await controller.joinSession(
        "123456",
        { nickname: `orbit-${index}` },
        createRequest({ ip: "203.0.113.10" }),
        response,
      );
    }

    let error: unknown;
    try {
      await controller.joinSession(
        "123456",
        { nickname: "orbit-10" },
        createRequest({ ip: "203.0.113.10" }),
        response,
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);

    await expect(
      controller.joinSession(
        "654321",
        { nickname: "orbit-other-code" },
        createRequest({ ip: "203.0.113.10" }),
        response,
      ),
    ).resolves.toBeDefined();
  });

  it("rejects /me without an audience cookie", async () => {
    const { controller } = createController();

    await expect(
      controller.getMe("session_existing", createRequest()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("returns audience state with the signed audience cookie", async () => {
    const serviceState = {
      session: {
        sessionId: session.sessionId,
        projectId: session.projectId,
        joinCode: session.joinCode,
        status: session.status,
        entryStatus: session.entryStatus,
      },
      participant,
      state: {
        sessionId: session.sessionId,
        slideId: "slide_1",
        slideIndex: 0,
        effectState: {},
        activeInteractionId: null,
        updatedAt: "2026-07-05T00:02:00.000Z",
      },
      features: {
        sessionId: session.sessionId,
        qnaEnabled: false,
        aiQnaEnabled: false,
        pollsEnabled: false,
        quizzesEnabled: false,
        reactionsEnabled: false,
        surveyEnabled: false,
        updatedAt: "2026-07-05T00:02:00.000Z",
      },
    };
    const { controller, service } = createController({
      getAudienceState: vi.fn(async () => serviceState),
    });
    const response = { cookie: vi.fn() } as any;
    await controller.joinSession(
      "123456",
      { nickname: "orbit" },
      createRequest({ userAgent: "vitest-state" }),
      response,
    );
    const signedAudienceToken = response.cookie.mock.calls[0][1] as string;

    await expect(
      controller.getState(
        "session_existing",
        createRequest({
          signedAudienceToken,
          userAgent: "vitest-state",
        }),
      ),
    ).resolves.toMatchObject({
      participant: {
        nickname: "orbit",
      },
      state: {
        slideId: "slide_1",
      },
      features: {
        qnaEnabled: false,
      },
    });
    expect(service.getAudienceState).toHaveBeenCalledWith(
      "session_existing",
      expect.stringMatching(/^audience_[0-9a-f-]{36}$/),
      expect.any(String),
    );
  });

  it("broadcasts accepted reactions after saving the event", async () => {
    const { audienceRealtimeGateway, controller, service } = createController({
      submitReaction: vi.fn(async () => ({
        reaction: "clap" as const,
        accepted: true as const,
      })),
    });
    const response = { cookie: vi.fn() } as any;
    await controller.joinSession(
      "123456",
      { nickname: "orbit" },
      createRequest({ userAgent: "vitest-reaction" }),
      response,
    );
    const signedAudienceToken = response.cookie.mock.calls[0][1] as string;

    await expect(
      controller.submitReaction(
        "session_existing",
        { reaction: "clap" },
        createRequest({
          signedAudienceToken,
          userAgent: "vitest-reaction",
        }),
      ),
    ).resolves.toEqual({ reaction: "clap", accepted: true });

    expect(service.submitReaction).toHaveBeenCalledWith({
      sessionId: "session_existing",
      audienceId: expect.stringMatching(/^audience_[0-9a-f-]{36}$/),
      tokenHash: expect.any(String),
      body: { reaction: "clap" },
    });
    expect(audienceRealtimeGateway.broadcastReaction).toHaveBeenCalledWith({
      sessionId: "session_existing",
      audienceId: expect.stringMatching(/^audience_[0-9a-f-]{36}$/),
      reaction: "clap",
    });
  });

  it("routes audience survey recovery and submission with signed audience access", async () => {
    const { controller, service } = createController({
      getAudienceSurveyForm: vi.fn(async () => ({ survey: null })),
      submitSurveyResponse: vi.fn(async () => ({
        response: {
          responseId:
            "survey_response_00000000-0000-4000-8000-000000000001",
          surveyId: "survey_00000000-0000-4000-8000-000000000001",
          sessionId: "session_existing",
          audienceId: "audience_00000000-0000-4000-8000-000000000001",
          submittedAt: "2026-07-05T00:00:00.000Z",
          answers: {},
          contactConsent: false,
          contactAnswers: {},
        },
      })),
    });
    const response = { cookie: vi.fn() } as any;
    await controller.joinSession(
      "123456",
      { nickname: "orbit" },
      createRequest({ userAgent: "vitest-survey" }),
      response,
    );
    const signedAudienceToken = response.cookie.mock.calls[0][1] as string;

    await expect(
      controller.getSurvey(
        "session_existing",
        createRequest({
          signedAudienceToken,
          userAgent: "vitest-survey",
        }),
      ),
    ).resolves.toEqual({ survey: null });
    await expect(
      controller.submitSurvey(
        "session_existing",
        { answers: {}, contactConsent: false, contactAnswers: {} },
        createRequest({
          signedAudienceToken,
          userAgent: "vitest-survey",
        }),
      ),
    ).resolves.toMatchObject({ response: { contactConsent: false } });

    expect(service.getAudienceSurveyForm).toHaveBeenCalledWith({
      sessionId: "session_existing",
      audienceId: expect.stringMatching(/^audience_[0-9a-f-]{36}$/),
      tokenHash: expect.any(String),
    });
    expect(service.submitSurveyResponse).toHaveBeenCalledWith({
      sessionId: "session_existing",
      audienceId: expect.stringMatching(/^audience_[0-9a-f-]{36}$/),
      tokenHash: expect.any(String),
      body: { answers: {}, contactConsent: false, contactAnswers: {} },
    });
  });
});
