import { loadOrbitConfig } from "@orbit/config";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { z } from "zod";

import { authSessionCookieName } from "../auth/auth.constants";
import { AuthService } from "../auth/auth.service";
import { resolveAllowedWebOrigins } from "../common/web-origin";
import { ProjectsService } from "../projects/projects.service";

const config = loadOrbitConfig(process.env, { service: "api" });
const spikeSessionTtlMs = 30 * 60 * 1000;
const spikeEventPrefix = "presentation-companion-spike";

const createSpikeSessionSchema = z
  .object({
    hostKind: z.enum(["presentation", "rehearsal"]),
    projectId: z.string().trim().min(1).max(200)
  })
  .strict();

const joinSpikeSessionSchema = z
  .object({
    spikeId: z.string().trim().min(1).max(100)
  })
  .strict();

const spikePointSchema = z
  .object({
    pressure: z.number().finite().min(0).max(1),
    t: z.number().finite().nonnegative().max(120_000),
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1)
  })
  .strict();

const spikeInkSchema = z
  .object({
    phase: z.enum(["start", "move", "end"]),
    points: z.array(spikePointSchema).min(1).max(64),
    sentAtMs: z.number().finite().nonnegative(),
    sequence: z.number().int().nonnegative(),
    spikeId: z.string().trim().min(1).max(100),
    strokeId: z.string().trim().min(1).max(100)
  })
  .strict();

const spikeInkAppliedSchema = z
  .object({
    appliedAtMs: z.number().finite().nonnegative(),
    sequence: z.number().int().nonnegative(),
    spikeId: z.string().trim().min(1).max(100),
    strokeId: z.string().trim().min(1).max(100)
  })
  .strict();

const spikeCapabilitiesSchema = z
  .object({
    coalescedEvents: z.boolean(),
    hoverObserved: z.boolean(),
    pointerEvents: z.boolean(),
    pressureObserved: z.boolean(),
    screenHeight: z.number().int().positive().max(10_000),
    screenWidth: z.number().int().positive().max(10_000),
    spikeId: z.string().trim().min(1).max(100),
    touchPoints: z.number().int().nonnegative().max(20),
    webRtc: z.boolean()
  })
  .strict();

const spikeMetricSchema = z
  .object({
    count: z.number().int().nonnegative().max(1_000_000),
    durationMs: z.number().finite().nonnegative().max(24 * 60 * 60 * 1000),
    maxMs: z.number().finite().nonnegative().max(120_000),
    p50Ms: z.number().finite().nonnegative().max(120_000),
    p95Ms: z.number().finite().nonnegative().max(120_000),
    spikeId: z.string().trim().min(1).max(100)
  })
  .strict();

const sessionDescriptionSchema = z
  .object({
    sdp: z.string().min(1).max(200_000),
    type: z.enum(["answer", "offer"])
  })
  .strict();

const iceCandidateSchema = z
  .object({
    candidate: z.string().max(4_096),
    sdpMid: z.string().max(256).nullable(),
    sdpMLineIndex: z.number().int().nonnegative().max(1_024).nullable(),
    usernameFragment: z.string().max(256).nullable().optional()
  })
  .strict();

const spikeSignalSchema = z
  .object({
    signal: z.discriminatedUnion("kind", [
      z.object({ description: sessionDescriptionSchema, kind: z.literal("description") }).strict(),
      z.object({ candidate: iceCandidateSchema, kind: z.literal("ice") }).strict(),
      z.object({ kind: z.literal("end") }).strict()
    ]),
    spikeId: z.string().trim().min(1).max(100)
  })
  .strict();

type SpikeSession = {
  companionSocketId: string | null;
  createdAtMs: number;
  expiresAtMs: number;
  hostKind: "presentation" | "rehearsal";
  hostSocketId: string;
  projectId: string;
  spikeId: string;
};

@WebSocketGateway({
  cors: {
    credentials: true,
    origin: resolveAllowedWebOrigins(config.WEB_ORIGIN)
  }
})
export class PresentationCompanionSpikeGateway
  implements OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly sessions = new Map<string, SpikeSession>();

  constructor(
    private readonly authService: AuthService,
    private readonly projectsService: ProjectsService
  ) {}

  @SubscribeMessage(`${spikeEventPrefix}:create`)
  async createSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown
  ) {
    if (config.APP_ENV === "production") {
      return spikeError("SPIKE_DISABLED", "Companion spike is disabled.");
    }

    const parsed = createSpikeSessionSchema.safeParse(body);
    const authSessionId = readSignedCookie(client, authSessionCookieName);
    if (!parsed.success || !authSessionId) {
      return spikeError("SPIKE_AUTH_REQUIRED", "Presenter access required.");
    }

    try {
      const { user } = await this.authService.me(authSessionId);
      await this.projectsService.assertCanWriteProject(
        parsed.data.projectId,
        user.userId
      );
    } catch {
      return spikeError("SPIKE_AUTH_REQUIRED", "Presenter access required.");
    }

    this.pruneExpiredSessions();
    this.removeSessionsForHost(client.id);

    const now = Date.now();
    const spikeId = `spike_${randomUUID()}`;
    const session: SpikeSession = {
      companionSocketId: null,
      createdAtMs: now,
      expiresAtMs: now + spikeSessionTtlMs,
      hostKind: parsed.data.hostKind,
      hostSocketId: client.id,
      projectId: parsed.data.projectId,
      spikeId
    };
    this.sessions.set(spikeId, session);
    await client.join(hostRoom(spikeId));
    client.data.companionSpikeId = spikeId;
    client.data.companionSpikeRole = "host";

    return {
      created: true,
      expiresAt: new Date(session.expiresAtMs).toISOString(),
      hostKind: session.hostKind,
      spikeId
    };
  }

  @SubscribeMessage(`${spikeEventPrefix}:join`)
  async joinCompanion(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown
  ) {
    const parsed = joinSpikeSessionSchema.safeParse(body);
    if (!parsed.success) {
      return spikeError("SPIKE_INVALID", "Spike session is unavailable.");
    }

    const session = this.getActiveSession(parsed.data.spikeId);
    if (!session) {
      return spikeError("SPIKE_UNAVAILABLE", "Spike session is unavailable.");
    }

    const previousCompanionSocketId = session.companionSocketId;
    session.companionSocketId = client.id;
    await client.join(companionRoom(session.spikeId));
    client.data.companionSpikeId = session.spikeId;
    client.data.companionSpikeRole = "companion";

    if (
      previousCompanionSocketId &&
      previousCompanionSocketId !== client.id
    ) {
      this.server
        .to(previousCompanionSocketId)
        .emit(`${spikeEventPrefix}:revoked`, {
          reason: "replaced",
          spikeId: session.spikeId
        });
    }
    this.server.to(session.hostSocketId).emit(`${spikeEventPrefix}:presence`, {
      connected: true,
      spikeId: session.spikeId
    });

    return {
      expiresAt: new Date(session.expiresAtMs).toISOString(),
      hostKind: session.hostKind,
      joined: true,
      spikeId: session.spikeId
    };
  }

  @SubscribeMessage(`${spikeEventPrefix}:ping`)
  ping(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown
  ) {
    const parsed = joinSpikeSessionSchema.safeParse(body);
    const session = parsed.success
      ? this.getSessionForClient(client, parsed.data.spikeId, "companion")
      : null;
    if (!session) {
      return spikeError("SPIKE_UNAVAILABLE", "Spike session is unavailable.");
    }
    return {
      serverReceivedAt: new Date().toISOString(),
      spikeId: session.spikeId
    };
  }

  @SubscribeMessage(`${spikeEventPrefix}:ink`)
  relayInk(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown
  ) {
    return this.relay(
      client,
      body,
      spikeInkSchema,
      "companion",
      "host",
      "ink"
    );
  }

  @SubscribeMessage(`${spikeEventPrefix}:ink-applied`)
  relayInkApplied(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown
  ) {
    return this.relay(
      client,
      body,
      spikeInkAppliedSchema,
      "host",
      "companion",
      "ink-applied"
    );
  }

  @SubscribeMessage(`${spikeEventPrefix}:capabilities`)
  relayCapabilities(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown
  ) {
    return this.relay(
      client,
      body,
      spikeCapabilitiesSchema,
      "companion",
      "host",
      "capabilities"
    );
  }

  @SubscribeMessage(`${spikeEventPrefix}:metric`)
  relayMetric(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown
  ) {
    return this.relay(
      client,
      body,
      spikeMetricSchema,
      "companion",
      "host",
      "metric"
    );
  }

  @SubscribeMessage(`${spikeEventPrefix}:signal`)
  relaySignal(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown
  ) {
    const parsed = spikeSignalSchema.safeParse(body);
    if (!parsed.success) {
      return spikeError("SPIKE_INVALID", "Invalid spike signaling payload.");
    }

    const role = readClientRole(client);
    if (role !== "host" && role !== "companion") {
      return spikeError("SPIKE_AUTH_REQUIRED", "Join the spike session first.");
    }
    const session = this.getSessionForClient(
      client,
      parsed.data.spikeId,
      role
    );
    if (!session) {
      return spikeError("SPIKE_UNAVAILABLE", "Spike session is unavailable.");
    }

    const targetSocketId =
      role === "host" ? session.companionSocketId : session.hostSocketId;
    if (!targetSocketId) {
      return spikeError("SPIKE_PEER_UNAVAILABLE", "Spike peer is unavailable.");
    }

    this.server
      .to(targetSocketId)
      .emit(`${spikeEventPrefix}:signal`, parsed.data);
    return { relayed: true, spikeId: session.spikeId };
  }

  handleDisconnect(client: Socket): void {
    const spikeId = readClientSpikeId(client);
    if (!spikeId) return;
    const session = this.sessions.get(spikeId);
    if (!session) return;

    if (session.hostSocketId === client.id) {
      this.sessions.delete(spikeId);
      if (session.companionSocketId) {
        this.server
          .to(session.companionSocketId)
          .emit(`${spikeEventPrefix}:presence`, {
            connected: false,
            reason: "host-disconnected",
            spikeId
          });
      }
      return;
    }

    if (session.companionSocketId === client.id) {
      session.companionSocketId = null;
      this.server.to(session.hostSocketId).emit(`${spikeEventPrefix}:presence`, {
        connected: false,
        reason: "companion-disconnected",
        spikeId
      });
    }
  }

  private relay<T extends { spikeId: string }>(
    client: Socket,
    body: unknown,
    schema: z.ZodType<T>,
    sourceRole: "companion" | "host",
    targetRole: "companion" | "host",
    eventSuffix: string
  ) {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return spikeError("SPIKE_INVALID", "Invalid spike payload.");
    }

    const session = this.getSessionForClient(
      client,
      parsed.data.spikeId,
      sourceRole
    );
    if (!session) {
      return spikeError("SPIKE_AUTH_REQUIRED", "Join the spike session first.");
    }

    const targetSocketId =
      targetRole === "host"
        ? session.hostSocketId
        : session.companionSocketId;
    if (!targetSocketId) {
      return spikeError("SPIKE_PEER_UNAVAILABLE", "Spike peer is unavailable.");
    }
    this.server
      .to(targetSocketId)
      .emit(`${spikeEventPrefix}:${eventSuffix}`, parsed.data);
    return { relayed: true, spikeId: session.spikeId };
  }

  private getSessionForClient(
    client: Socket,
    spikeId: string,
    role: "companion" | "host"
  ): SpikeSession | null {
    const session = this.getActiveSession(spikeId);
    if (!session || readClientRole(client) !== role) return null;
    if (readClientSpikeId(client) !== spikeId) return null;
    if (role === "host" && session.hostSocketId !== client.id) return null;
    if (
      role === "companion" &&
      session.companionSocketId !== client.id
    ) {
      return null;
    }
    return session;
  }

  private getActiveSession(spikeId: string): SpikeSession | null {
    const session = this.sessions.get(spikeId);
    if (!session) return null;
    if (session.expiresAtMs <= Date.now()) {
      this.sessions.delete(spikeId);
      return null;
    }
    return session;
  }

  private pruneExpiredSessions(): void {
    const now = Date.now();
    for (const [spikeId, session] of this.sessions) {
      if (session.expiresAtMs <= now) {
        this.sessions.delete(spikeId);
      }
    }
  }

  private removeSessionsForHost(hostSocketId: string): void {
    for (const [spikeId, session] of this.sessions) {
      if (session.hostSocketId === hostSocketId) {
        this.sessions.delete(spikeId);
      }
    }
  }
}

function hostRoom(spikeId: string) {
  return `${spikeEventPrefix}:${spikeId}:host`;
}

function companionRoom(spikeId: string) {
  return `${spikeEventPrefix}:${spikeId}:companion`;
}

function readClientRole(client: Socket): "companion" | "host" | null {
  const value = client.data.companionSpikeRole;
  return value === "companion" || value === "host" ? value : null;
}

function readClientSpikeId(client: Socket): string | null {
  const value = client.data.companionSpikeId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readSignedCookie(client: Socket, name: string): string | null {
  const header = firstHeader(client.handshake.headers.cookie);
  const prefix = `${name}=`;
  const pair = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!pair) return null;

  const encoded = pair.slice(prefix.length);
  let value = encoded;
  try {
    value = decodeURIComponent(encoded);
  } catch {
    value = encoded;
  }
  const unsigned = cookieParser.signedCookie(value, config.COOKIE_SECRET);
  return typeof unsigned === "string" && unsigned.length > 0 ? unsigned : null;
}

function firstHeader(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function spikeError(code: string, message: string) {
  return {
    data: { code, message },
    event: `${spikeEventPrefix}:error`
  };
}
