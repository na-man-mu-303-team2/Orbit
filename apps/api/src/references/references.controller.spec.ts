import { describe, expect, it, vi } from "vitest";
import { authSessionCookieName } from "../auth/auth.constants";
import type { AuthService } from "../auth/auth.service";
import type { SignedCookieRequest } from "../auth/current-user";
import type { ProjectsService } from "../projects/projects.service";
import { ReferencesController } from "./references.controller";
import type { ReferencesService } from "./references.service";

describe("ReferencesController", () => {
  it("requires project read permission before searching reference chunks", async () => {
    const { controller, projectsService, service } = createController();
    const body = { query: "발표", limit: 3 };

    await controller.searchReferences("project-a", body, signedRequest());

    expect(projectsService.assertCanReadProject).toHaveBeenCalledWith(
      "project-a",
      "user-1",
    );
    expect(service.search).toHaveBeenCalledWith("project-a", body);
    expect(
      projectsService.assertCanReadProject.mock.invocationCallOrder[0],
    ).toBeLessThan(service.search.mock.invocationCallOrder[0]);
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
  };
  const service = {
    search: vi.fn(async () => ({ matches: [] })),
  };

  return {
    controller: new ReferencesController(
      authService,
      projectsService as unknown as ProjectsService,
      service as unknown as ReferencesService,
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
