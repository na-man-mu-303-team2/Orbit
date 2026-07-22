import { slideRedesignProgressChannel } from "@orbit/shared";
import type { PinoLogger } from "nestjs-pino";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RealtimeGateway } from "./realtime.gateway";

const redis = vi.hoisted(() => ({
  handlers: new Map<string, (...args: string[]) => void>(),
  subscribe: vi.fn(async () => 1),
  off: vi.fn(),
  quit: vi.fn(async () => "OK"),
  disconnect: vi.fn(),
  status: "ready",
}));

vi.mock("@orbit/config", () => ({
  loadOrbitConfig: vi.fn(() => ({ REDIS_URL: "redis://localhost:6379" })),
}));

vi.mock("ioredis", () => ({
  default: class {
    on(event: string, handler: (...args: string[]) => void) {
      redis.handlers.set(event, handler);
      return this;
    }
    off = redis.off;
    subscribe = redis.subscribe;
    quit = redis.quit;
    disconnect = redis.disconnect;
    get status() {
      return redis.status;
    }
  },
}));

describe("SlideRedesignProgressSubscriber", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    redis.handlers.clear();
    redis.status = "ready";
  });

  it("forwards only validated progress events and does not log raw payloads", async () => {
    const { SlideRedesignProgressSubscriber } =
      await import("./slide-redesign-progress.subscriber");
    const publishSlideRedesignProgress = vi.fn();
    const warn = vi.fn();
    const subscriber = new SlideRedesignProgressSubscriber(
      { publishSlideRedesignProgress } as unknown as RealtimeGateway,
      { warn } as unknown as PinoLogger,
    );
    await subscriber.onModuleInit();
    const handleMessage = redis.handlers.get("message");
    if (!handleMessage) throw new Error("message handler was not registered");
    const event = progressEvent();

    handleMessage(slideRedesignProgressChannel, JSON.stringify(event));
    handleMessage(slideRedesignProgressChannel, "SECRET_RAW_PAYLOAD{");

    expect(redis.subscribe).toHaveBeenCalledWith(slideRedesignProgressChannel);
    expect(publishSlideRedesignProgress).toHaveBeenCalledWith(event);
    expect(warn).toHaveBeenCalledWith(
      { event: "slide_redesign.progress.invalid_event" },
      "Invalid slide redesign progress event ignored.",
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain("SECRET_RAW_PAYLOAD");
    await subscriber.onModuleDestroy();
  });
});

function progressEvent() {
  return {
    roomId: "project-1",
    sessionId: "session-1",
    userId: "system",
    sentAt: "2026-07-22T00:00:00.000Z",
    payload: {
      jobId: "job-redesign-1",
      projectId: "project-1",
      sessionId: "session-1",
      stage: "interpreting",
      completedStages: [],
    },
  };
}
