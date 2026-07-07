import { authSessionCookieName } from "../auth/auth.constants";
import type { AuthService } from "../auth/auth.service";
import type { SignedCookieRequest } from "../auth/current-user";
import type { ProjectsService } from "../projects/projects.service";
import { describe, expect, it, vi } from "vitest";
import { RehearsalsController } from "./rehearsals.controller";
import type { RehearsalsService } from "./rehearsals.service";

describe("RehearsalsController", () => {
  it("requires project write permission before creating a rehearsal run", async () => {
    const { controller, projectsService, rehearsalsService } = createController();

    await controller.createRun("project-a", { deckId: "deck-a" }, signedRequest());

    expect(projectsService.assertCanWriteProject).toHaveBeenCalledWith(
      "project-a",
      "user-1",
    );
    expect(rehearsalsService.createRun).toHaveBeenCalledWith("project-a", {
      deckId: "deck-a",
    });
    expect(
      projectsService.assertCanWriteProject.mock.invocationCallOrder[0],
    ).toBeLessThan(rehearsalsService.createRun.mock.invocationCallOrder[0]);
  });

  it("requires project read permission before returning a rehearsal report", async () => {
    const { controller, projectsService, rehearsalsService } = createController();

    await controller.getReport("run-1", signedRequest());

    expect(rehearsalsService.getRunProjectId).toHaveBeenCalledWith("run-1");
    expect(projectsService.assertCanReadProject).toHaveBeenCalledWith(
      "project-a",
      "user-1",
    );
    expect(rehearsalsService.getReport).toHaveBeenCalledWith("run-1");
    expect(
      projectsService.assertCanReadProject.mock.invocationCallOrder[0],
    ).toBeLessThan(rehearsalsService.getReport.mock.invocationCallOrder[0]);
  });

  it("does not call the rehearsal service without a signed session", async () => {
    const { controller, rehearsalsService } = createController();

    await expect(
      controller.getReport(
        "run-1",
        { signedCookies: {} } as unknown as SignedCookieRequest,
      ),
    ).rejects.toThrow("Authentication required");
    expect(rehearsalsService.getReport).not.toHaveBeenCalled();
  });
});

function createController() {
  const authService = {
    me: vi.fn(async () => ({
      user: { userId: "user-1", email: "user@example.com" },
    })),
  } as unknown as AuthService;
  const projectsService = {
    assertCanReadProject: vi.fn(async () => ({ projectId: "project-a" })),
    assertCanWriteProject: vi.fn(async () => ({ projectId: "project-a" })),
  };
  const rehearsalsService = {
    createRun: vi.fn(async () => ({ run: { runId: "run-1" } })),
    getReport: vi.fn(async () => ({ report: null })),
    getRunProjectId: vi.fn(async () => "project-a"),
  };

  return {
    controller: new RehearsalsController(
      authService,
      projectsService as unknown as ProjectsService,
      rehearsalsService as unknown as RehearsalsService,
    ),
    projectsService,
    rehearsalsService,
  };
}

function signedRequest(): SignedCookieRequest {
  return {
    signedCookies: {
      [authSessionCookieName]: "session-1",
    },
  } as unknown as SignedCookieRequest;
}
