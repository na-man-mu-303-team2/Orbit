import {
  audiencePresenterRoomId,
  audiencePrivateRoomId,
  audienceSessionRoomId,
  createRealtimeEvent,
} from "@orbit/realtime";
import { loadOrbitConfig } from "@orbit/config";
import {
  audienceFeatureSettingsPayloadSchema,
  audienceReactionPayloadSchema,
  audienceSessionEndedPayloadSchema,
  audienceSlideStatePayloadSchema,
  updateAudienceFeatureSettingsRequestSchema,
  type AudienceRealtimeState,
  type PresentationSession,
  type ReactionType,
} from "@orbit/shared";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import cookieParser from "cookie-parser";
import { z } from "zod";
import { Server, Socket } from "socket.io";
import { authSessionCookieName } from "../auth/auth.constants";
import { AuthService } from "../auth/auth.service";
import { resolveAllowedWebOrigins } from "../common/web-origin";
import { ProjectsService } from "../projects/projects.service";
import {
  audienceAccessCookieName,
  hashAudienceAccessToken,
  verifyAudienceAccessToken,
} from "../presentation-sessions/audience-access-cookie";
import { PresentationSessionsService } from "../presentation-sessions/presentation-sessions.service";

const orbitConfig = loadOrbitConfig(process.env, { service: "api" });
const realtimeCorsOrigins = resolveAllowedWebOrigins(orbitConfig.WEB_ORIGIN);
const audienceJoinBodySchema = z.object({ sessionId: z.string().min(1) });
const audienceFeatureSettingsUpdateBodySchema = z
  .object({
    sessionId: z.string().min(1),
    settings: updateAudienceFeatureSettingsRequestSchema,
  })
  .strict();
const audienceSlideStateUpdateBodySchema = z
  .object({
    sessionId: z.string().min(1),
    slideId: z.string().min(1).nullable(),
    slideIndex: z.number().int().nonnegative().nullable(),
    effectState: z.record(z.unknown()).default({}),
    activeInteractionId: z.string().min(1).nullable().optional(),
  })
  .strict();

@WebSocketGateway({
  cors: {
    credentials: true,
    origin: realtimeCorsOrigins,
  },
})
export class AudienceRealtimeGateway {
  private readonly stateSnapshots = new Map<string, AudienceRealtimeState>();

  constructor(
    private readonly authService: AuthService,
    private readonly presentationSessionsService: PresentationSessionsService,
    private readonly projectsService: ProjectsService,
  ) {}

  @WebSocketServer()
  server!: Server;

  @SubscribeMessage("audience:join")
  async handleAudienceJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ) {
    const { sessionId } = audienceJoinBodySchema.parse(body);
    const access = this.readAudienceAccess(client, sessionId);
    if (!access) {
      return emitAudienceError(client, "Audience access required.");
    }

    const recovery = await this.presentationSessionsService.getAudienceState(
      sessionId,
      access.audienceId,
      access.tokenHash,
    );
    const state = this.stateSnapshots.get(sessionId) ?? recovery.state;
    this.stateSnapshots.set(sessionId, state);

    await client.join(audienceSessionRoomId(sessionId));
    await client.join(
      audiencePrivateRoomId({
        sessionId,
        audienceId: access.audienceId,
      }),
    );
    client.data.audienceSessionId = sessionId;
    client.data.audienceId = access.audienceId;

    const event = createRealtimeEvent({
      type: "audience:state",
      roomId: audienceSessionRoomId(sessionId),
      sessionId,
      userId: access.audienceId,
      payload: {
        ...recovery,
        state,
      },
    });

    client.emit("audience:state", event);
    return event;
  }

  @SubscribeMessage("audience:presenter-join")
  async handlePresenterJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ) {
    const { sessionId } = audienceJoinBodySchema.parse(body);
    const presenter = await this.requirePresenterWriteAccess(client, sessionId);
    if (!presenter) {
      return emitAudienceError(client, "Presenter permission required.");
    }

    await client.join(audiencePresenterRoomId(sessionId));
    client.data.audiencePresenterSessionId = sessionId;
    client.data.userId = presenter.userId;

    const event = createRealtimeEvent({
      type: "audience:join",
      roomId: audiencePresenterRoomId(sessionId),
      sessionId,
      userId: presenter.userId,
      payload: { sessionId },
    });

    client.emit("audience:presenter-joined", event);
    return event;
  }

  @SubscribeMessage("audience:slide-state:update")
  async handleSlideStateUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ) {
    const input = audienceSlideStateUpdateBodySchema.parse(body);
    const presenter = await this.requirePresenterWriteAccess(
      client,
      input.sessionId,
    );
    if (!presenter) {
      return emitAudienceError(client, "Presenter permission required.");
    }

    const state =
      await this.presentationSessionsService.updateAudienceRealtimeState({
        sessionId: input.sessionId,
        actorId: presenter.userId,
        slideId: input.slideId,
        slideIndex: input.slideIndex,
        effectState: input.effectState,
        activeInteractionId: input.activeInteractionId,
      });
    this.stateSnapshots.set(input.sessionId, state);

    const payload = audienceSlideStatePayloadSchema.parse({ state });
    const event = createRealtimeEvent({
      type: "audience:slide-state",
      roomId: audienceSessionRoomId(input.sessionId),
      sessionId: input.sessionId,
      userId: presenter.userId,
      payload,
    });

    this.server
      .to(audienceSessionRoomId(input.sessionId))
      .emit("audience:slide-state", event);
    return event;
  }

  @SubscribeMessage("audience:feature-settings:update")
  async handleFeatureSettingsUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ) {
    const input = audienceFeatureSettingsUpdateBodySchema.parse(body);
    const presenter = await this.requirePresenterWriteAccess(
      client,
      input.sessionId,
    );
    if (!presenter) {
      return emitAudienceError(client, "Presenter permission required.");
    }

    const response =
      await this.presentationSessionsService.updateAudienceFeatureSettings({
        projectId: presenter.projectId,
        sessionId: input.sessionId,
        actorId: presenter.userId,
        settings: input.settings,
      });

    const payload = audienceFeatureSettingsPayloadSchema.parse(response);
    const event = createRealtimeEvent({
      type: "audience:feature-settings",
      roomId: audienceSessionRoomId(input.sessionId),
      sessionId: input.sessionId,
      userId: presenter.userId,
      payload,
    });

    this.server
      .to(audienceSessionRoomId(input.sessionId))
      .emit("audience:feature-settings", event);
    return event;
  }

  broadcastReaction(input: {
    sessionId: string;
    audienceId: string;
    reaction: ReactionType;
  }) {
    const payload = audienceReactionPayloadSchema.parse(input);
    const event = createRealtimeEvent({
      type: "audience:reaction",
      roomId: audienceSessionRoomId(input.sessionId),
      sessionId: input.sessionId,
      userId: input.audienceId,
      payload,
    });

    this.server
      .to(audienceSessionRoomId(input.sessionId))
      .emit("audience:reaction", event);
    this.server
      .to(audiencePresenterRoomId(input.sessionId))
      .emit("audience:reaction", event);
    return event;
  }

  broadcastSessionEnded(session: PresentationSession) {
    const payload = audienceSessionEndedPayloadSchema.parse({
      session: {
        sessionId: session.sessionId,
        projectId: session.projectId,
        joinCode: session.joinCode,
        status: session.status,
        entryStatus: session.entryStatus,
      },
    });
    const event = createRealtimeEvent({
      type: "audience:session-ended",
      roomId: audienceSessionRoomId(session.sessionId),
      sessionId: session.sessionId,
      userId: session.presenterUserId,
      payload,
    });

    this.server
      .to(audienceSessionRoomId(session.sessionId))
      .emit("audience:session-ended", event);
    return event;
  }

  private readAudienceAccess(client: Socket, sessionId: string) {
    const token = readSignedCookieValue(client, audienceAccessCookieName);
    if (!token) {
      return null;
    }

    const payload = verifyAudienceAccessToken(
      orbitConfig,
      token,
      readUserAgent(client),
    );
    if (!payload || payload.sessionId !== sessionId) {
      return null;
    }

    return {
      audienceId: payload.audienceId,
      tokenHash: hashAudienceAccessToken(orbitConfig, token),
    };
  }

  private async requirePresenterWriteAccess(client: Socket, sessionId: string) {
    const authSessionId = readSignedCookieValue(client, authSessionCookieName);
    if (!authSessionId) {
      return null;
    }

    try {
      const [{ user }, session] = await Promise.all([
        this.authService.me(authSessionId),
        this.presentationSessionsService.getActiveSessionById(sessionId),
      ]);
      await this.projectsService.assertCanWriteProject(
        session.projectId,
        user.userId,
      );
      return {
        projectId: session.projectId,
        userId: user.userId,
      };
    } catch {
      return null;
    }
  }
}

function readSignedCookieValue(client: Socket, name: string): string | null {
  const signedValue = readCookieValue(
    firstHeader(client.handshake.headers.cookie),
    name,
  );
  if (!signedValue) {
    return null;
  }

  const unsigned = cookieParser.signedCookie(
    signedValue,
    orbitConfig.COOKIE_SECRET,
  );
  return typeof unsigned === "string" && unsigned.length > 0 ? unsigned : null;
}

function readCookieValue(cookieHeader: string, name: string): string {
  const prefix = `${name}=`;
  const pair = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!pair) {
    return "";
  }

  const value = pair.slice(prefix.length);
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readUserAgent(client: Socket): string {
  return firstHeader(client.handshake.headers["user-agent"]);
}

function firstHeader(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] || "";
  }
  return value || "";
}

function emitAudienceError(client: Socket, message: string) {
  const payload = {
    event: "audience:error",
    data: { message },
  };
  client.emit("audience:error", payload.data);
  return payload;
}
