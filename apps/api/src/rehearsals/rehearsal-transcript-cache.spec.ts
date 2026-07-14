import { beforeEach, describe, expect, it, vi } from "vitest";
import { RedisRehearsalTranscriptCache } from "./rehearsal-transcript-cache";

const redisMock = vi.hoisted(() => ({
  get: vi.fn(),
  exists: vi.fn(),
  quit: vi.fn(),
  disconnect: vi.fn()
}));

vi.mock("ioredis", () => ({
  default: class RedisMock {
    status = "ready";
    get = redisMock.get;
    exists = redisMock.exists;
    quit = redisMock.quit;
    disconnect = redisMock.disconnect;
  }
}));

vi.mock("@orbit/config", () => ({
  loadOrbitConfig: () => ({ REDIS_URL: "redis://localhost:6379" })
}));

describe("RedisRehearsalTranscriptCache semantic evidence", () => {
  beforeEach(() => {
    Object.values(redisMock).forEach((mock) => mock.mockReset());
  });

  it("checks the evidence key without loading transcript segments into the API", async () => {
    redisMock.exists.mockResolvedValue(1);
    const cache = new RedisRehearsalTranscriptCache();

    await expect(cache.hasSemanticEvidence("run-1")).resolves.toBe(true);

    expect(redisMock.exists).toHaveBeenCalledWith(
      "rehearsal:semantic-evidence:run-1"
    );
    expect(redisMock.get).not.toHaveBeenCalled();
  });
});
