import { GoneException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { PptxImportsService } from "./pptx-imports.service";

describe("PptxImportsService", () => {
  it("blocks legacy PPTX import creation", async () => {
    const service = new PptxImportsService();

    await expect(
      service.createImport("project-a", { fileId: "file-a" })
    ).rejects.toBeInstanceOf(GoneException);
  });
});
