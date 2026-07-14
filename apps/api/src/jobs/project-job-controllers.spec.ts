import { describe, expect, it, vi } from "vitest";
import { authSessionCookieName } from "../auth/auth.constants";
import type { AuthService } from "../auth/auth.service";
import type { SignedCookieRequest } from "../auth/current-user";
import { GenerateDeckController } from "../generate-deck/generate-deck.controller";
import { PptxOoxmlGenerationsController } from "../pptx-ooxml-generations/pptx-ooxml-generations.controller";
import type { ProjectsService } from "../projects/projects.service";

describe("project job controllers", () => {
  it("requires write permission before creating AI deck generation jobs", async () => {
    const { authService, projectsService } = createAuthHarness();
    const service = { createJob: vi.fn(async () => ({ job: { jobId: "job-1" } })) };
    const controller = new GenerateDeckController(
      authService,
      service as never,
      projectsService as unknown as ProjectsService,
    );

    await controller.createJob("project-a", { topic: "deck" }, signedRequest());

    expect(projectsService.assertCanWriteProject).toHaveBeenCalledWith(
      "project-a",
      "user-1",
    );
    expect(service.createJob).toHaveBeenCalledWith(
      "project-a",
      { topic: "deck" },
      "user-1"
    );
  });

  it("requires write permission before creating PPTX OOXML generation jobs", async () => {
    const { authService, projectsService } = createAuthHarness();
    const service = {
      createGeneration: vi.fn(async () => ({ job: { jobId: "job-1" } })),
    };
    const controller = new PptxOoxmlGenerationsController(
      authService,
      service as never,
      projectsService as unknown as ProjectsService,
    );

    await controller.createGeneration(
      "project-a",
      { fileId: "file-1" },
      signedRequest(),
    );

    expect(projectsService.assertCanWriteProject).toHaveBeenCalledWith(
      "project-a",
      "user-1",
    );
    expect(service.createGeneration).toHaveBeenCalledWith("project-a", {
      fileId: "file-1",
    });
  });
});

function createAuthHarness() {
  return {
    authService: {
      me: vi.fn(async () => ({
        user: { userId: "user-1", email: "user@example.com" },
      })),
    } as unknown as AuthService,
    projectsService: {
      assertCanWriteProject: vi.fn(async () => ({ projectId: "project-a" })),
    },
  };
}

function signedRequest(): SignedCookieRequest {
  return {
    signedCookies: {
      [authSessionCookieName]: "session-1",
    },
  } as unknown as SignedCookieRequest;
}
