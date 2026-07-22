import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { authSessionCookieName } from "../auth/auth.constants";
import type { AuthService } from "../auth/auth.service";
import type { ProjectsService } from "../projects/projects.service";
import { DecksController } from "./decks.controller";
import type { DecksService } from "./decks.service";

describe("DecksController notes preview", () => {
  it("requires owner or editor permission before reading preview metadata", async () => {
    const { controller, decksService, projectsService } = createController();

    await controller.getPptxNotesPreview(
      "project-a",
      "slide-a",
      signedRequest(),
    );

    expect(projectsService.assertCanWriteProject).toHaveBeenCalledWith(
      "project-a",
      "user-a",
    );
    expect(decksService.getPptxNotesPreview).toHaveBeenCalledWith(
      "project-a",
      "slide-a",
    );
  });

  it("does not query preview metadata when a viewer lacks editor permission", async () => {
    const { controller, decksService, projectsService } = createController();
    vi.mocked(projectsService.assertCanWriteProject).mockRejectedValue(
      new ForbiddenException("Project editor permission required"),
    );

    await expect(
      controller.getPptxNotesPreview("project-a", "slide-a", signedRequest()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(decksService.getPptxNotesPreview).not.toHaveBeenCalled();
  });
});

function createController() {
  const authService = {
    me: vi.fn(async () => ({ user: { userId: "user-a" } })),
  } as unknown as AuthService;
  const decksService = {
    getPptxNotesPreview: vi.fn(async () => ({
      notesPreview: {
        slideId: "slide-a",
        status: "unavailable",
        assetUrl: null,
      },
    })),
  } as unknown as DecksService;
  const projectsService = {
    assertCanWriteProject: vi.fn(async () => ({ projectId: "project-a" })),
  } as unknown as ProjectsService;
  return {
    authService,
    decksService,
    projectsService,
    controller: new DecksController(authService, decksService, projectsService),
  };
}

function signedRequest() {
  return {
    signedCookies: { [authSessionCookieName]: "session-a" },
  } as never;
}
