import { demoIds } from "@orbit/shared";
import { describe, expect, it, vi } from "vitest";
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
    const service = createService();
    const controller = new ExtractController(service);

    await controller.extract(files, { projectId: "project_ai_1" });

    expect(service.extract).toHaveBeenCalledWith(files, "project_ai_1");
  });

  it("falls back to the demo project when projectId is omitted", async () => {
    const service = createService();
    const controller = new ExtractController(service);

    await controller.extract(files, {});

    expect(service.extract).toHaveBeenCalledWith(files, demoIds.projectId);
  });
});

function createService() {
  return {
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
  } as unknown as ExtractService;
}
