import { describe, expect, it, vi } from "vitest";

import { AuthService } from "../auth/auth.service";
import { ProjectsService } from "../projects/projects.service";
import { SlidePracticeController } from "./slide-practice.controller";
import { SlidePracticeService } from "./slide-practice.service";

function createController() {
  const authService = {
    me: vi.fn(async () => ({ user: { userId: "user-1" } })),
  } as unknown as AuthService;
  const projectsService = {
    assertCanWriteProject: vi.fn(),
  } as unknown as ProjectsService;
  const slidePracticeService = {
    createAnalysis: vi.fn(async () => ({ analysis: {}, upload: {} })),
  } as unknown as SlidePracticeService;

  return {
    controller: new SlidePracticeController(
      authService,
      projectsService,
      slidePracticeService,
    ),
    projectsService,
    slidePracticeService,
  };
}

function createRequest(origin: string) {
  return {
    get: vi.fn((header: string) => (header === "origin" ? origin : undefined)),
    signedCookies: { orbit_session: "session-1" },
  } as any;
}

describe("SlidePracticeController", () => {
  it("forwards the normalized browser origin when creating an audio analysis", async () => {
    const { controller, projectsService, slidePracticeService } = createController();
    const body = { deckId: "deck-1" };

    await controller.createAnalysis(
      "project-1",
      body,
      createRequest("http://127.0.0.1:5174/path?ignored=true"),
    );

    expect(projectsService.assertCanWriteProject).toHaveBeenCalledWith(
      "project-1",
      "user-1",
    );
    expect(slidePracticeService.createAnalysis).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      body,
      "http://127.0.0.1:5174",
    );
  });

  it("does not forward a non-http origin", async () => {
    const { controller, slidePracticeService } = createController();

    await controller.createAnalysis(
      "project-1",
      {},
      createRequest("chrome-extension://unsafe"),
    );

    expect(slidePracticeService.createAnalysis).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      {},
      null,
    );
  });
});
