import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { PresentationSessionsController } from "./presentation-sessions.controller";
import { PresentationSessionsService } from "./presentation-sessions.service";

const features = {
  sessionId: "session_existing",
  qnaEnabled: false,
  aiQnaEnabled: false,
  pollsEnabled: true,
  quizzesEnabled: false,
  reactionsEnabled: false,
  surveyEnabled: false,
  updatedAt: "2026-07-05T00:04:00.000Z",
};

function createController() {
  const auth = {
    me: vi.fn(async () => ({ user: { userId: "user_1" } })),
  };
  const service = {
    getAudienceFeatureSettings: vi.fn(async () => ({ features })),
    updateAudienceFeatureSettings: vi.fn(async () => ({ features })),
  } as unknown as PresentationSessionsService;
  const projects = {
    assertCanReadProject: vi.fn(async () => ({ projectId: "project_1" })),
    assertCanWriteProject: vi.fn(async () => ({ projectId: "project_1" })),
  };
  const controller = new PresentationSessionsController(
    auth as any,
    service,
    projects as any,
  );

  return { auth, controller, projects, service };
}

function createRequest(sessionId: string | false | undefined = "auth_1") {
  return {
    signedCookies: {
      orbit_session: sessionId,
    },
  } as any;
}

describe("PresentationSessionsController", () => {
  it("returns feature settings after project read permission", async () => {
    const { controller, projects, service } = createController();

    await expect(
      controller.getFeatureSettings(
        "project_1",
        "session_existing",
        createRequest(),
      ),
    ).resolves.toEqual({ features });

    expect(projects.assertCanReadProject).toHaveBeenCalledWith(
      "project_1",
      "user_1",
    );
    expect(service.getAudienceFeatureSettings).toHaveBeenCalledWith(
      "project_1",
      "session_existing",
    );
  });

  it("updates feature settings after project write permission", async () => {
    const { controller, projects, service } = createController();

    await expect(
      controller.updateFeatureSettings(
        "project_1",
        "session_existing",
        { pollsEnabled: true },
        createRequest(),
      ),
    ).resolves.toEqual({ features });

    expect(projects.assertCanWriteProject).toHaveBeenCalledWith(
      "project_1",
      "user_1",
    );
    expect(service.updateAudienceFeatureSettings).toHaveBeenCalledWith({
      projectId: "project_1",
      sessionId: "session_existing",
      actorId: "user_1",
      settings: { pollsEnabled: true },
    });
  });

  it("rejects invalid feature update bodies before service calls", async () => {
    const { controller, service } = createController();

    await expect(
      controller.updateFeatureSettings(
        "project_1",
        "session_existing",
        {},
        createRequest(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.updateAudienceFeatureSettings).not.toHaveBeenCalled();
  });

  it("rejects presenter feature endpoints without auth", async () => {
    const { controller, projects, service } = createController();

    await expect(
      controller.getFeatureSettings(
        "project_1",
        "session_existing",
        createRequest(false),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(projects.assertCanReadProject).not.toHaveBeenCalled();
    expect(service.getAudienceFeatureSettings).not.toHaveBeenCalled();
  });
});
