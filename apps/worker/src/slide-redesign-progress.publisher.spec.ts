import { slideRedesignProgressChannel } from "@orbit/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SlideRedesignProgressRedisPublisher } from "./slide-redesign-progress.publisher";

const redis = vi.hoisted(() => ({
  publish: vi.fn(async () => 1),
  quit: vi.fn(async () => "OK"),
  disconnect: vi.fn(),
  status: "ready",
}));

vi.mock("ioredis", () => ({
  default: class {
    publish = redis.publish;
    quit = redis.quit;
    disconnect = redis.disconnect;
    get status() {
      return redis.status;
    }
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  redis.status = "ready";
});

describe("SlideRedesignProgressRedisPublisher", () => {
  it("validates and publishes the common envelope to the private channel", async () => {
    const publisher = new SlideRedesignProgressRedisPublisher(
      "redis://localhost:6379",
    );
    const event = progressEvent();

    await publisher.publish(event);

    expect(redis.publish).toHaveBeenCalledWith(
      slideRedesignProgressChannel,
      JSON.stringify(event),
    );
    await publisher.close();
    expect(redis.quit).toHaveBeenCalledTimes(1);
  });

  it("rejects mismatched project routing before publishing", async () => {
    const publisher = new SlideRedesignProgressRedisPublisher(
      "redis://localhost:6379",
    );

    await expect(
      publisher.publish({ ...progressEvent(), roomId: "project-other" }),
    ).rejects.toThrow();
    expect(redis.publish).not.toHaveBeenCalled();
  });
});

function progressEvent() {
  return {
    roomId: "project-1",
    sessionId: "session-1",
    userId: "system" as const,
    sentAt: "2026-07-22T00:00:00.000Z",
    payload: {
      jobId: "job-redesign-1",
      projectId: "project-1",
      sessionId: "session-1",
      stage: "interpreting" as const,
      completedStages: [],
    },
  };
}
