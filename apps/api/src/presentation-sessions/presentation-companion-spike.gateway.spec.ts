import { loadOrbitConfig } from "@orbit/config";
import { createHmac } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { describe, expect, it, vi } from "vitest";

vi.mock("@orbit/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@orbit/config")>();
  return {
    ...actual,
    loadOrbitConfig: () => ({
      APP_ENV: "test",
      WEB_ORIGIN: "http://localhost:5173",
      COOKIE_SECRET: "companion-spike-cookie-secret"
    })
  };
});

import { authSessionCookieName } from "../auth/auth.constants";
import { PresentationCompanionSpikeGateway } from "./presentation-companion-spike.gateway";

const config = loadOrbitConfig(process.env, { service: "api" });

function signedCookie(name: string, value: string) {
  const signature = createHmac("sha256", config.COOKIE_SECRET)
    .update(value)
    .digest("base64")
    .replace(/=+$/, "");
  return `${name}=${encodeURIComponent(`s:${value}.${signature}`)}`;
}

function client(id: string, cookie = ""): Socket {
  return {
    id,
    handshake: { headers: { cookie } },
    data: {},
    join: vi.fn().mockResolvedValue(undefined),
    emit: vi.fn()
  } as unknown as Socket;
}

function server() {
  const emissions: Array<{ event: string; payload: unknown; target: string }> = [];
  const value = {
    to: vi.fn((target: string) => ({
      emit: vi.fn((event: string, payload: unknown) => {
        emissions.push({ event, payload, target });
      })
    }))
  } as unknown as Server;
  return { emissions, value };
}

function gateway() {
  const auth = {
    me: vi.fn().mockResolvedValue({ user: { userId: "user_1" } })
  };
  const projects = {
    assertCanWriteProject: vi.fn().mockResolvedValue({})
  };
  const instance = new PresentationCompanionSpikeGateway(
    auth as never,
    projects as never
  );
  const socketServer = server();
  instance.server = socketServer.value;
  return { auth, instance, projects, socketServer };
}

async function joinedClients() {
  const fixture = gateway();
  const host = client(
    "host_socket",
    signedCookie(authSessionCookieName, "auth_session_1")
  );
  const created = await fixture.instance.createSession(host, {
    hostKind: "presentation",
    projectId: "project_1"
  });
  if (!("spikeId" in created)) {
    throw new Error("Expected spike session creation to succeed");
  }
  const companion = client("companion_socket");
  await fixture.instance.joinCompanion(companion, {
    spikeId: created.spikeId
  });
  return { ...fixture, companion, host, spikeId: created.spikeId };
}

describe("PresentationCompanionSpikeGateway", () => {
  it("creates a bounded spike session for an authorized presenter", async () => {
    const { auth, instance, projects } = gateway();
    const socket = client(
      "host_socket",
      signedCookie(authSessionCookieName, "auth_session_1")
    );

    const result = await instance.createSession(socket, {
      hostKind: "rehearsal",
      projectId: "project_1"
    });

    expect(result).toMatchObject({
      created: true,
      hostKind: "rehearsal"
    });
    expect("spikeId" in result && result.spikeId).toMatch(/^spike_/);
    expect(auth.me).toHaveBeenCalledWith("auth_session_1");
    expect(projects.assertCanWriteProject).toHaveBeenCalledWith(
      "project_1",
      "user_1"
    );
    expect(socket.join).toHaveBeenCalledOnce();
  });

  it("rejects session creation without a signed presenter cookie", async () => {
    const { instance } = gateway();
    const socket = client("host_socket");

    await expect(
      instance.createSession(socket, {
        hostKind: "presentation",
        projectId: "project_1"
      })
    ).resolves.toEqual({
      data: {
        code: "SPIKE_AUTH_REQUIRED",
        message: "Presenter access required."
      },
      event: "presentation-companion-spike:error"
    });
    expect(socket.join).not.toHaveBeenCalled();
  });

  it("relays validated ink from the active companion to the host", async () => {
    const { companion, instance, socketServer, spikeId } =
      await joinedClients();
    const ink = {
      phase: "move",
      points: [{ pressure: 0.5, t: 12, x: 0.2, y: 0.7 }],
      sentAtMs: 100,
      sequence: 2,
      spikeId,
      strokeId: "stroke_1"
    };

    expect(instance.relayInk(companion, ink)).toEqual({
      relayed: true,
      spikeId
    });
    expect(socketServer.emissions).toContainEqual({
      event: "presentation-companion-spike:ink",
      payload: ink,
      target: "host_socket"
    });
  });

  it("rejects out-of-bounds ink without forwarding it", async () => {
    const { companion, instance, socketServer, spikeId } =
      await joinedClients();
    const previousEmissionCount = socketServer.emissions.length;

    expect(
      instance.relayInk(companion, {
        phase: "move",
        points: [{ pressure: 0.5, t: 12, x: 1.1, y: 0.7 }],
        sentAtMs: 100,
        sequence: 2,
        spikeId,
        strokeId: "stroke_1"
      })
    ).toEqual({
      data: { code: "SPIKE_INVALID", message: "Invalid spike payload." },
      event: "presentation-companion-spike:error"
    });
    expect(socketServer.emissions).toHaveLength(previousEmissionCount);
  });

  it("stops a replaced companion from sending signaling or ink", async () => {
    const { companion, instance, socketServer, spikeId } =
      await joinedClients();
    const replacement = client("replacement_socket");
    await instance.joinCompanion(replacement, { spikeId });

    expect(
      instance.relaySignal(companion, {
        signal: {
          description: { sdp: "v=0", type: "answer" },
          kind: "description"
        },
        spikeId
      })
    ).toEqual({
      data: {
        code: "SPIKE_UNAVAILABLE",
        message: "Spike session is unavailable."
      },
      event: "presentation-companion-spike:error"
    });
    expect(socketServer.emissions).toContainEqual({
      event: "presentation-companion-spike:revoked",
      payload: { reason: "replaced", spikeId },
      target: "companion_socket"
    });
  });

  it("notifies the host when the companion disconnects", async () => {
    const { companion, instance, socketServer, spikeId } =
      await joinedClients();

    instance.handleDisconnect(companion);

    expect(socketServer.emissions).toContainEqual({
      event: "presentation-companion-spike:presence",
      payload: {
        connected: false,
        reason: "companion-disconnected",
        spikeId
      },
      target: "host_socket"
    });
  });
});
