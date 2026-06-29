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
      controller.createUploadUrl("project_1", {
        originalName: "sample.exe",
        mimeType: "application/x-msdownload",
        size: 1024,
        purpose: "reference-material",
      }),
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
      controller.createUploadUrl("project_1", {
        originalName: "large.pdf",
        mimeType: "application/pdf",
        size: 51 * 1024 * 1024,
        purpose: "reference-material",
      }),
    ).toThrow(BadRequestException);
    expect(service.createUploadUrl).not.toHaveBeenCalled();
  });
});
