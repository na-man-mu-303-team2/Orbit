import type { RehearsalRunComparison } from "@orbit/shared";
import { describe, expect, it, vi } from "vitest";
import { fetchRehearsalRunComparison } from "./reportApi";

describe("fetchRehearsalRunComparison", () => {
  it("requests the current rehearsal comparison with credentials", async () => {
    const comparison = comparisonFixture();
    const fetcher = vi.fn(async () => jsonResponse(comparison));

    await expect(
      fetchRehearsalRunComparison("project demo/1", "run current/1", fetcher),
    ).resolves.toEqual(comparison);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/projects/project%20demo%2F1/rehearsals/run%20current%2F1/comparison",
      { credentials: "include" },
    );
  });

  it("returns null for an unavailable or invalid comparison", async () => {
    await expect(
      fetchRehearsalRunComparison(
        "project_1",
        "run_1",
        async () => new Response("missing", { status: 404 }),
      ),
    ).resolves.toBeNull();
    await expect(
      fetchRehearsalRunComparison(
        "project_1",
        "run_1",
        async () => jsonResponse({ currentRunId: "run_1" }),
      ),
    ).resolves.toBeNull();
    await expect(
      fetchRehearsalRunComparison(
        "project_1",
        "run_1",
        async () => new Response("not-json", { status: 200 }),
      ),
    ).resolves.toBeNull();
  });
});

function comparisonFixture(): RehearsalRunComparison {
  return {
    currentRunId: "run current/1",
    previousRunId: "run_previous",
    improved: [],
    repeated: [],
    newIssues: [],
    incomparable: [],
    briefing: [],
  };
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
