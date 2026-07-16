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
    const controller = new ActivityRunsController(auth as never, projects as never, runs as never);

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
});
