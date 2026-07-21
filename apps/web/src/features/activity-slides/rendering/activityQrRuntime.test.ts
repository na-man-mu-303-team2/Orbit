import { afterEach, describe, expect, it, vi } from "vitest";

import { activityApi } from "../api/activityApi";
import { loadActivityQrRuntimeState } from "./activityQrRuntime";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("activity QR runtime lookup", () => {
  it("uses only read endpoints and never prepares a run while rendering", async () => {
    vi.spyOn(activityApi, "getCurrentSession").mockResolvedValue({
      audienceUrl: "https://orbit.example/audience/session_1",
      session: { sessionId: "session_1" } as never
    });
    vi.spyOn(activityApi, "getCurrentRun").mockResolvedValue({
      run: { activityId: "activity_1" } as never
    });
    const ensureRun = vi.spyOn(activityApi, "ensureRun");

    await expect(
      loadActivityQrRuntimeState({
        activityId: "activity_1",
        deckId: "deck_1",
        projectId: "project_1"
      })
    ).resolves.toEqual({
      status: "ready",
      audienceUrl: "https://orbit.example/audience/session_1/a/activity_1"
    });

    expect(activityApi.getCurrentSession).toHaveBeenCalledWith("project_1", "deck_1");
    expect(activityApi.getCurrentRun).toHaveBeenCalledWith(
      "project_1",
      "session_1",
      "activity_1"
    );
    expect(ensureRun).not.toHaveBeenCalled();
  });
});
