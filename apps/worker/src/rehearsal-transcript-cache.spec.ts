import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  REHEARSAL_TRANSCRIPT_TTL_SECONDS,
  RedisRehearsalTranscriptCache
} from "./rehearsal-transcript-cache";

const redisMock = vi.hoisted(() => ({
  set: vi.fn(),
  get: vi.fn(),
  quit: vi.fn(),
  disconnect: vi.fn()
}));

vi.mock("ioredis", () => ({
  default: class RedisMock {
    status = "ready";
    set = redisMock.set;
    get = redisMock.get;
    quit = redisMock.quit;
    disconnect = redisMock.disconnect;
  }
}));

describe("RedisRehearsalTranscriptCache semantic evidence", () => {
  beforeEach(() => {
    Object.values(redisMock).forEach((mock) => mock.mockReset());
    redisMock.set.mockResolvedValue("OK");
  });

  it("stores timestamped segments under a separate 30 minute TTL key", async () => {
    const cache = new RedisRehearsalTranscriptCache("redis://localhost:6379");

    await cache.setSemanticEvidence("run-1", {
      segments: [{ startMs: 0, endMs: 1_500, text: "핵심 의미" }]
    });

    expect(redisMock.set).toHaveBeenCalledWith(
      "rehearsal:semantic-evidence:run-1",
      JSON.stringify({
        segments: [{ startMs: 0, endMs: 1_500, text: "핵심 의미" }]
      }),
      "EX",
      REHEARSAL_TRANSCRIPT_TTL_SECONDS
    );
  });

  it("validates cached evidence and does not retain an empty segment list", async () => {
    const cache = new RedisRehearsalTranscriptCache("redis://localhost:6379");
    redisMock.get.mockResolvedValue(
      JSON.stringify({ segments: [{ startMs: 0, endMs: 500, text: "발화" }] })
    );

    await expect(cache.getSemanticEvidence("run-1")).resolves.toEqual({
      segments: [{ startMs: 0, endMs: 500, text: "발화" }]
    });
    await cache.setSemanticEvidence("run-2", { segments: [] });

    expect(redisMock.set).not.toHaveBeenCalled();
  });
});
