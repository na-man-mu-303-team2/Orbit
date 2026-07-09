import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { authSessionCookieName } from "../auth/auth.constants";
import type { AuthService } from "../auth/auth.service";
import type { SignedCookieRequest } from "../auth/current-user";
import type { ProjectsService } from "../projects/projects.service";
import { ExtractController } from "./extract.controller";
import { ExtractService } from "./extract.service";

const files = [
  {
    originalname: "sample.pdf",
    mimetype: "application/pdf",
    buffer: Buffer.from("pdf")
  }
];

describe("ExtractController", () => {
  it("uses the multipart projectId when extracting references", async () => {
    const { controller, projectsService, service } = createController();

    await controller.extract(
      files,
      { projectId: "project_ai_1" },
      signedRequest()
    );

    expect(service.extract).toHaveBeenCalledWith(files, "project_ai_1", undefined);
    expect(projectsService.assertCanWriteProject).toHaveBeenCalledWith(
      "project_ai_1",
      "user-1"
    );
  });

  it("rejects extraction when projectId is omitted", async () => {
    const { controller } = createController();

    await expect(
      controller.extract(files, {}, signedRequest())
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("forwards multipart fileIds for project asset backed references", async () => {
    const { controller, service } = createController();

    await controller.extract(
      files,
      {
        projectId: "project_ai_1",
        fileIds: ["file_design_1"]
      },
      signedRequest()
    );

    expect(service.extract).toHaveBeenCalledWith(files, "project_ai_1", [
      "file_design_1"
    ]);
  });
});

function createController() {
  const authService = {
    me: vi.fn(async () => ({
      user: { userId: "user-1", email: "user@example.com" }
    }))
  } as unknown as AuthService;
  const projectsService = {
    assertCanWriteProject: vi.fn(async () => ({ projectId: "project_ai_1" }))
  };
  const service = {
    extract: vi.fn(async () => ({
      files: [],
      job: {
        jobId: "job_1",
        projectId: "project_ai_1",
        type: "reference-extract",
        status: "queued",
        progress: 0,
        message: "Job queued",
        result: null,
        error: null,
        createdAt: "2026-06-29T00:00:00.000Z",
        updatedAt: "2026-06-29T00:00:00.000Z"
      }
    }))
  };
  return {
    controller: new ExtractController(
      authService,
      projectsService as unknown as ProjectsService,
      service as unknown as ExtractService
    ),
    projectsService,
    service
  };
}

function signedRequest(): SignedCookieRequest {
  return {
    signedCookies: { [authSessionCookieName]: "session-1" }
  } as unknown as SignedCookieRequest;
}
