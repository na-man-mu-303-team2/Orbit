import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";

describe("FilesController", () => {
  it("rejects unsupported upload mime types before service execution", () => {
    const service = {
      createUploadUrl: vi.fn(),
      completeUpload: vi.fn(),
      list: vi.fn(),
    } as unknown as FilesService;
    const controller = new FilesController(service);

    expect(() =>
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
    ).toThrow(BadRequestException);
    expect(service.createUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects oversized upload requests before service execution", () => {
    const service = {
      createUploadUrl: vi.fn(),
      completeUpload: vi.fn(),
      list: vi.fn(),
    } as unknown as FilesService;
    const controller = new FilesController(service);

    expect(() =>
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
    ).toThrow(BadRequestException);
    expect(service.createUploadUrl).not.toHaveBeenCalled();
  });

  it("forwards the browser origin when creating a local upload URL", () => {
    const service = {
      createUploadUrl: vi.fn(),
      completeUpload: vi.fn(),
      list: vi.fn(),
    } as unknown as FilesService;
    const controller = new FilesController(service);

    controller.createUploadUrl(
      "project_1",
      {
        originalName: "sample.png",
        mimeType: "image/png",
        size: 1024,
        purpose: "reference-material",
      },
      {
        get: vi.fn((header: string) =>
          header === "origin" ? "http://127.0.0.1:5173" : undefined,
        ),
      } as any,
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
});
