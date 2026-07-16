import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ActivityRunsController } from "./activity-runs.controller";

describe("ActivityRunsController", () => {
  it("rejects viewer access to presenter Activity commands", async () => {
    const auth = { me: vi.fn().mockResolvedValue({ user: { userId: "viewer_1" } }) };
    const projects = {
      assertCanWriteProject: vi
        .fn()
        .mockRejectedValue(new ForbiddenException("Project editor permission required"))
    };
    const runs = { ensureCurrentRun: vi.fn() };
    const controller = new ActivityRunsController(
      auth as never,
      projects as never,
      runs as never,
      {} as never,
      {} as never
    );

    await expect(
      controller.ensureCurrentRun(
        "project_1",
        "session_1",
        "activity_1",
        {},
        { signedCookies: { orbit_session: "signed" } } as never
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(runs.ensureCurrentRun).not.toHaveBeenCalled();
  });

  it("returns the public projection through an authenticated presenter boundary", async () => {
    const auth = { me: vi.fn().mockResolvedValue({ user: { userId: "editor_1" } }) };
    const projects = { assertCanWriteProject: vi.fn().mockResolvedValue(undefined) };
    const results = {
      getPublicResult: vi.fn().mockResolvedValue({
        result: { activityRunId: "activity_run_1", responseCount: 3 }
      })
    };
    const controller = new ActivityRunsController(
      auth as never,
      projects as never,
      {} as never,
      results as never,
      {} as never
    );

    await expect(
      controller.getPublicResults(
        "project_1",
        "session_1",
        "activity_run_1",
        { signedCookies: { orbit_session: "signed" } } as never
      )
    ).resolves.toEqual({
      result: { activityRunId: "activity_run_1", responseCount: 3 }
    });
    expect(results.getPublicResult).toHaveBeenCalledWith(
      "project_1",
      "session_1",
      "activity_run_1"
    );
  });

  it("allows an editor to moderate a text entry", async () => {
    const auth = { me: vi.fn().mockResolvedValue({ user: { userId: "editor_1" } }) };
    const projects = { assertCanWriteProject: vi.fn().mockResolvedValue(undefined) };
    const moderation = { moderate: vi.fn().mockResolvedValue({ result: { revision: 5 } }) };
    const controller = new ActivityRunsController(
      auth as never,
      projects as never,
      {} as never,
      {} as never,
      moderation as never
    );

    await expect(controller.moderateTextEntry(
      "project_1",
      "session_1",
      "activity_text_1",
      { moderationStatus: "approved", expectedRevision: 4 },
      { signedCookies: { orbit_session: "signed" } } as never
    )).resolves.toEqual({ result: { revision: 5 } });
    expect(moderation.moderate).toHaveBeenCalledWith(
      "project_1",
      "session_1",
      "activity_text_1",
      { moderationStatus: "approved", expectedRevision: 4 }
    );
  });
});
