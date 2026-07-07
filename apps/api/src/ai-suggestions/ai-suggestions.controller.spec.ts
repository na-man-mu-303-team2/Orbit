import { describe, expect, it, vi } from "vitest";
import { authSessionCookieName } from "../auth/auth.constants";
import type { AuthService } from "../auth/auth.service";
import type { SignedCookieRequest } from "../auth/current-user";
import type { ProjectsService } from "../projects/projects.service";
import { AiSuggestionsController } from "./ai-suggestions.controller";
import type { AiSuggestionsService } from "./ai-suggestions.service";

describe("AiSuggestionsController", () => {
  it("requires read permission before listing suggestions", async () => {
    const { controller, projectsService, service } = createController();

    await controller.list("project-a", { status: "pending" }, signedRequest());

    expect(projectsService.assertCanReadProject).toHaveBeenCalledWith(
      "project-a",
      "user-1",
    );
    expect(service.list).toHaveBeenCalledWith("project-a", { status: "pending" });
  });

  it("requires write permission before applying a suggestion", async () => {
    const { controller, projectsService, service } = createController();

    await controller.apply("project-a", "suggestion-1", signedRequest());

    expect(projectsService.assertCanWriteProject).toHaveBeenCalledWith(
      "project-a",
      "user-1",
    );
    expect(service.apply).toHaveBeenCalledWith("project-a", "suggestion-1");
    expect(
      projectsService.assertCanWriteProject.mock.invocationCallOrder[0],
    ).toBeLessThan(service.apply.mock.invocationCallOrder[0]);
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
  const service = {
    list: vi.fn(async () => ({ suggestions: [] })),
    apply: vi.fn(async () => ({ suggestion: { suggestionId: "suggestion-1" } })),
  };

  return {
    controller: new AiSuggestionsController(
      authService,
      service as unknown as AiSuggestionsService,
      projectsService as unknown as ProjectsService,
    ),
    projectsService,
    service,
  };
}

function signedRequest(): SignedCookieRequest {
  return {
    signedCookies: {
      [authSessionCookieName]: "session-1",
    },
  } as unknown as SignedCookieRequest;
}
