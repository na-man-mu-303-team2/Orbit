import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "../auth/auth.service";
import { ProjectsService } from "../projects/projects.service";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";

function createController(serviceOverrides: Partial<FilesService> = {}) {
  const service = {
    createUploadUrl: vi.fn(),
    completeUpload: vi.fn(),
    readUploadedAssetContent: vi.fn(),
    list: vi.fn(),
    ...serviceOverrides,
  } as unknown as FilesService;
  const authService = {
    me: vi.fn(async () => ({ user: { userId: "user_1" } })),
  } as unknown as AuthService;
  const projectsService = {
    assertCanReadProject: vi.fn(),
    assertCanWriteProject: vi.fn(),
  } as unknown as ProjectsService;
  const controller = new FilesController(authService, service, projectsService);

  return { authService, controller, projectsService, service };
}

function createRequest(origin?: string) {
  return {
    get: vi.fn((header: string) => (header === "origin" ? origin : undefined)),
    signedCookies: {
      orbit_session: "session_1",
    },
  } as any;
}

describe("FilesController", () => {
  it("rejects unsupported upload mime types before service execution", async () => {
    const { controller, service } = createController();

    await expect(
      controller.createUploadUrl(
        "project_1",
        {
          originalName: "sample.exe",
          mimeType: "application/x-msdownload",
          size: 1024,
          purpose: "reference-material",
        },
        {
          get: vi.fn(),
        } as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.createUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects oversized upload requests before service execution", async () => {
    const { controller, service } = createController();

    await expect(
      controller.createUploadUrl(
        "project_1",
        {
          originalName: "large.pdf",
          mimeType: "application/pdf",
          size: 51 * 1024 * 1024,
          purpose: "reference-material",
        },
        {
          get: vi.fn(),
        } as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.createUploadUrl).not.toHaveBeenCalled();
  });

  it("checks write permission and forwards the browser origin when creating a local upload URL", async () => {
    const { controller, projectsService, service } = createController();

    await controller.createUploadUrl(
      "project_1",
      {
        originalName: "sample.png",
        mimeType: "image/png",
        size: 1024,
        purpose: "reference-material",
      },
      createRequest("http://127.0.0.1:5173"),
    );

    expect(projectsService.assertCanWriteProject).toHaveBeenCalledWith(
      "project_1",
      "user_1",
    );
    expect(service.createUploadUrl).toHaveBeenCalledWith(
      "project_1",
      {
        originalName: "sample.png",
        mimeType: "image/png",
        size: 1024,
        purpose: "reference-material",
      },
      "http://127.0.0.1:5173",
    );
  });

  it("reads uploaded asset content through the service", async () => {
    const { controller, projectsService, service } = createController({
      readUploadedAssetContent: vi.fn(async () => ({
        body: Buffer.from("png"),
        contentType: "image/png",
      })),
    });
    const response = {
      setHeader: vi.fn(),
    } as any;

    const file = await controller.readContent(
      "project_1",
      "file_1",
      createRequest(),
      response,
    );

    expect(projectsService.assertCanReadProject).toHaveBeenCalledWith(
      "project_1",
      "user_1",
    );
    expect(service.readUploadedAssetContent).toHaveBeenCalledWith(
      "project_1",
      "file_1",
    );
    expect(response.setHeader).toHaveBeenCalledWith("content-type", "image/png");
    expect(file).toBeDefined();
  });
});
