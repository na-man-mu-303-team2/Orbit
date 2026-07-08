import { createHmac } from "node:crypto";
import { loadOrbitConfig } from "@orbit/config";
import { audiencePrivateRoomId, audienceSessionRoomId } from "@orbit/realtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Socket } from "socket.io";
import {
  audienceAccessCookieName,
  createAudienceAccessToken,
} from "../presentation-sessions/audience-access-cookie";

type GatewayModule = typeof import("./audience-realtime.gateway");

const session = {
  sessionId: "session_existing",
  projectId: "project_1",
  deckId: "deck_1",
  presenterUserId: "user_1",
  joinCode: "123456",
  status: "live" as const,
  entryStatus: "open" as const,
  audienceSlideRenderMode: "image-first" as const,
  createdAt: "2026-07-05T00:00:00.000Z",
  startedAt: "2026-07-05T00:01:00.000Z",
  endedAt: null,
  surveyClosesAt: null,
  rawDataDeleteAfter: "2026-08-04T00:00:00.000Z",
};

const participant = {
  audienceId: "audience_00000000-0000-4000-8000-000000000001",
  sessionId: session.sessionId,
  nickname: "orbit",
  joinedAt: "2026-07-05T00:00:01.000Z",
  lastSeenAt: "2026-07-05T00:00:01.000Z",
  joinedBeforeEnd: true,
};

const state = {
  sessionId: session.sessionId,
  slideId: "slide_1",
  slideIndex: 0,
  effectState: {},
  activeInteractionId: null,
  updatedAt: "2026-07-05T00:02:00.000Z",
};

const features = {
  sessionId: session.sessionId,
  qnaEnabled: false,
  aiQnaEnabled: false,
  pollsEnabled: false,
  quizzesEnabled: false,
  reactionsEnabled: false,
  surveyEnabled: false,
  updatedAt: "2026-07-05T00:02:00.000Z",
};

describe("AudienceRealtimeGateway", () => {
  beforeEach(() => {
    vi.resetModules();
    setTestEnv();
  });

  it("joins audience session and private rooms with a signed audience cookie", async () => {
    const { gateway, service } = await createGateway();
    const client = createSocket({
      cookie: createAudienceCookie(),
      userAgent: "vitest-audience",
    });

    const event = await gateway.handleAudienceJoin(client, {
      sessionId: session.sessionId,
    });

    expect(service.getAudienceState).toHaveBeenCalledWith(
      session.sessionId,
      participant.audienceId,
      expect.any(String),
    );
    expect(client.join).toHaveBeenCalledWith(
      audienceSessionRoomId(session.sessionId),
    );
    expect(client.join).toHaveBeenCalledWith(
      audiencePrivateRoomId({
        sessionId: session.sessionId,
        audienceId: participant.audienceId,
      }),
    );
    expect(client.emit).toHaveBeenCalledWith(
      "audience:state",
      expect.objectContaining({
        type: "audience:state",
        payload: expect.objectContaining({
          participant,
          state,
        }),
      }),
    );
    expect(event).toMatchObject({
      type: "audience:state",
      sessionId: session.sessionId,
    });
  });

  it("rejects audience room join without a valid audience cookie", async () => {
    const { gateway, service } = await createGateway();
    const client = createSocket();

    await expect(
      gateway.handleAudienceJoin(client, { sessionId: session.sessionId }),
    ).resolves.toEqual({
      event: "audience:error",
      data: { message: "Audience access required." },
    });

    expect(service.getAudienceState).not.toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it("requires presenter write access before broadcasting slide state", async () => {
    const { gateway, service, serverEmit } = await createGateway();
    const client = createSocket({
      cookie: createAuthCookie("auth_session_1"),
    });

    const event = await gateway.handleSlideStateUpdate(client, {
      sessionId: session.sessionId,
      slideId: "slide_2",
      slideIndex: 1,
      effectState: { highlightId: "shape_2" },
    });

    expect(service.updateAudienceRealtimeState).toHaveBeenCalledWith({
      sessionId: session.sessionId,
      actorId: "user_1",
      slideId: "slide_2",
      slideIndex: 1,
      effectState: { highlightId: "shape_2" },
      activeInteractionId: undefined,
    });
    expect(serverEmit).toHaveBeenCalledWith(
      "audience:slide-state",
      expect.objectContaining({
        type: "audience:slide-state",
        payload: {
          state: expect.objectContaining({
            slideId: "slide_2",
            effectState: { highlightId: "shape_2" },
          }),
        },
      }),
    );
    expect(event).toMatchObject({
      type: "audience:slide-state",
      roomId: audienceSessionRoomId(session.sessionId),
    });
  });

  it("requires presenter write access before broadcasting feature settings", async () => {
    const { gateway, service, serverEmit } = await createGateway();
    const client = createSocket({
      cookie: createAuthCookie("auth_session_1"),
    });

    const event = await gateway.handleFeatureSettingsUpdate(client, {
      sessionId: session.sessionId,
      settings: { pollsEnabled: true },
    });

    expect(service.updateAudienceFeatureSettings).toHaveBeenCalledWith({
      projectId: session.projectId,
      sessionId: session.sessionId,
      actorId: "user_1",
      settings: { pollsEnabled: true },
    });
    expect(serverEmit).toHaveBeenCalledWith(
      "audience:feature-settings",
      expect.objectContaining({
        type: "audience:feature-settings",
        payload: {
          features: expect.objectContaining({
            pollsEnabled: true,
          }),
        },
      }),
    );
    expect(event).toMatchObject({
      type: "audience:feature-settings",
      roomId: audienceSessionRoomId(session.sessionId),
    });
  });

  it("broadcasts REST feature settings updates to audience rooms", async () => {
    const { gateway, serverEmit, serverTo } = await createGateway();

    const event = gateway.broadcastFeatureSettings({
      sessionId: session.sessionId,
      userId: "user_1",
      features: {
        ...features,
        pollsEnabled: true,
        updatedAt: "2026-07-05T00:03:00.000Z",
      },
    });

    expect(serverTo).toHaveBeenCalledWith(
      audienceSessionRoomId(session.sessionId),
    );
    expect(serverEmit).toHaveBeenCalledWith(
      "audience:feature-settings",
      expect.objectContaining({
        type: "audience:feature-settings",
        payload: {
          features: expect.objectContaining({
            pollsEnabled: true,
          }),
        },
      }),
    );
    expect(event).toMatchObject({
      type: "audience:feature-settings",
      roomId: audienceSessionRoomId(session.sessionId),
      userId: "user_1",
    });
  });

  it("broadcasts audience reactions to audience and presenter rooms", async () => {
    const { gateway, serverEmit, serverTo } = await createGateway();

    const event = gateway.broadcastReaction({
      sessionId: session.sessionId,
      audienceId: participant.audienceId,
      reaction: "clap",
    });

    expect(serverEmit).toHaveBeenCalledTimes(2);
    expect(serverTo).toHaveBeenNthCalledWith(
      1,
      audienceSessionRoomId(session.sessionId),
    );
    expect(serverTo).toHaveBeenNthCalledWith(
      2,
      "presentation:session_existing:presenter",
    );
    expect(serverEmit).toHaveBeenNthCalledWith(
      1,
      "audience:reaction",
      expect.objectContaining({
        type: "audience:reaction",
        roomId: audienceSessionRoomId(session.sessionId),
        payload: {
          sessionId: session.sessionId,
          audienceId: participant.audienceId,
          reaction: "clap",
        },
      }),
    );
    expect(serverEmit).toHaveBeenNthCalledWith(
      2,
      "audience:reaction",
      expect.objectContaining({
        type: "audience:reaction",
      }),
    );
    expect(event).toMatchObject({
      type: "audience:reaction",
      sessionId: session.sessionId,
      userId: participant.audienceId,
    });
  });

  it("broadcasts session-ended events with public session payloads", async () => {
    const { gateway, serverEmit } = await createGateway();

    const event = gateway.broadcastSessionEnded({
      ...session,
      status: "ended",
      entryStatus: "closed",
      endedAt: "2026-07-05T00:30:00.000Z",
      startedAt: "2026-07-05T00:00:00.000Z",
      surveyClosesAt: "2026-07-05T01:30:00.000Z",
      rawDataDeleteAfter: "2026-08-04T00:00:00.000Z",
    } as any);

    expect(serverEmit).toHaveBeenCalledWith(
      "audience:session-ended",
      expect.objectContaining({
        type: "audience:session-ended",
        payload: {
          session: {
            sessionId: session.sessionId,
            projectId: session.projectId,
            joinCode: session.joinCode,
            status: "ended",
            entryStatus: "closed",
          },
        },
      }),
    );
    expect(JSON.stringify(event.payload)).not.toContain("presenterUserId");
  });

  it("broadcasts AI answers only to the asker private room", async () => {
    const { gateway, serverEmit, serverTo } = await createGateway();

    const event = gateway.broadcastPrivateAnswer({
      sessionId: session.sessionId,
      audienceId: participant.audienceId,
      question: {
        questionId: "question_00000000-0000-4000-8000-000000000001",
        questionGroupId: "question_00000000-0000-4000-8000-000000000001",
        sessionId: session.sessionId,
        audienceId: participant.audienceId,
        text: "질문입니다",
        status: "pending",
        submittedAt: "2026-07-05T00:00:00.000Z",
        answeredAt: null,
      },
      answer: {
        questionId: "question_00000000-0000-4000-8000-000000000001",
        sessionId: session.sessionId,
        audienceId: participant.audienceId,
        answerText: "비공개 답변",
        sourceReferences: ["deck-slide:소개"],
        confidence: 0.91,
        failureReason: null,
        feedback: null,
        escalatedToPresenter: false,
        createdAt: "2026-07-05T00:00:01.000Z",
      },
    });

    expect(serverTo).toHaveBeenCalledWith(
      audiencePrivateRoomId({
        sessionId: session.sessionId,
        audienceId: participant.audienceId,
      }),
    );
    expect(serverTo).not.toHaveBeenCalledWith(
      audienceSessionRoomId(session.sessionId),
    );
    expect(serverEmit).toHaveBeenCalledWith(
      "audience:private-answer",
      expect.objectContaining({
        type: "audience:private-answer",
        payload: expect.objectContaining({
          answer: expect.objectContaining({ answerText: "비공개 답변" }),
        }),
      }),
    );
    expect(event.roomId).toBe(
      audiencePrivateRoomId({
        sessionId: session.sessionId,
        audienceId: participant.audienceId,
      }),
    );
  });

  it("rejects presenter slide updates without auth", async () => {
    const { gateway, service, serverEmit } = await createGateway();
    const client = createSocket();

    await expect(
      gateway.handleSlideStateUpdate(client, {
        sessionId: session.sessionId,
        slideId: "slide_2",
        slideIndex: 1,
        effectState: {},
      }),
    ).resolves.toEqual({
      event: "audience:error",
      data: { message: "Presenter permission required." },
    });

    expect(service.updateAudienceRealtimeState).not.toHaveBeenCalled();
    expect(serverEmit).not.toHaveBeenCalled();
  });

  it("rejects presenter feature updates without auth", async () => {
    const { gateway, service, serverEmit } = await createGateway();
    const client = createSocket();

    await expect(
      gateway.handleFeatureSettingsUpdate(client, {
        sessionId: session.sessionId,
        settings: { pollsEnabled: true },
      }),
    ).resolves.toEqual({
      event: "audience:error",
      data: { message: "Presenter permission required." },
    });

    expect(service.updateAudienceFeatureSettings).not.toHaveBeenCalled();
    expect(serverEmit).not.toHaveBeenCalled();
  });
});

async function createGateway() {
  const { AudienceRealtimeGateway }: GatewayModule =
    await import("./audience-realtime.gateway");
  const service = {
    getAudienceState: vi.fn(async () => ({
      session: {
        sessionId: session.sessionId,
        projectId: session.projectId,
        joinCode: session.joinCode,
        status: session.status,
        entryStatus: session.entryStatus,
      },
      participant,
      state,
      features,
    })),
    getActiveSessionById: vi.fn(async () => session),
    updateAudienceRealtimeState: vi.fn(async () => ({
      ...state,
      slideId: "slide_2",
      slideIndex: 1,
      effectState: { highlightId: "shape_2" },
      updatedAt: "2026-07-05T00:03:00.000Z",
    })),
    updateAudienceFeatureSettings: vi.fn(async () => ({
      features: {
        ...features,
        pollsEnabled: true,
        updatedAt: "2026-07-05T00:03:00.000Z",
      },
    })),
  };
  const auth = {
    me: vi.fn(async () => ({ user: { userId: "user_1" } })),
  };
  const projects = {
    assertCanWriteProject: vi.fn(async () => ({
      projectId: session.projectId,
    })),
  };
  const gateway = new AudienceRealtimeGateway(
    auth as any,
    service as any,
    projects as any,
  );
  const serverEmit = vi.fn();
  const serverTo = vi.fn(() => ({ emit: serverEmit }));
  gateway.server = {
    to: serverTo,
  } as any;

  return { auth, gateway, projects, serverEmit, serverTo, service };
}

function createSocket(
  args: { cookie?: string; userAgent?: string } = {},
): Socket {
  return {
    data: {},
    handshake: {
      headers: {
        cookie: args.cookie ?? "",
        "user-agent": args.userAgent ?? "vitest-audience",
      },
    },
    join: vi.fn(async () => undefined),
    emit: vi.fn(),
  } as unknown as Socket;
}

function createAudienceCookie() {
  const config = loadOrbitConfig(process.env, { service: "api" });
  const token = createAudienceAccessToken(
    config,
    session,
    participant.audienceId,
    "vitest-audience",
  );

  return serializeSignedCookie(
    audienceAccessCookieName,
    token,
    config.COOKIE_SECRET,
  );
}

function createAuthCookie(sessionId: string) {
  const config = loadOrbitConfig(process.env, { service: "api" });
  return serializeSignedCookie(
    "orbit_session",
    sessionId,
    config.COOKIE_SECRET,
  );
}

function serializeSignedCookie(name: string, value: string, secret: string) {
  return `${name}=${encodeURIComponent(`s:${signCookieValue(value, secret)}`)}`;
}

function signCookieValue(value: string, secret: string) {
  return `${value}.${createHmac("sha256", secret)
    .update(value)
    .digest("base64")
    .replace(/=+$/, "")}`;
}

function setTestEnv() {
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
}
