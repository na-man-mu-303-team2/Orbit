import { describe, expect, it } from "vitest";
import { assetUploadUrlRequestSchema } from "./file.schema";

describe("assetUploadUrlRequestSchema", () => {
  it("accepts rehearsal audio uploads with audio MIME types", () => {
    const result = assetUploadUrlRequestSchema.parse({
      originalName: "rehearsal.webm",
      mimeType: "audio/webm",
      size: 1024,
      purpose: "rehearsal-audio",
    });

    expect(result.mimeType).toBe("audio/webm");
  });

  it("rejects audio MIME types for non-rehearsal purposes", () => {
    const result = assetUploadUrlRequestSchema.safeParse({
      originalName: "rehearsal.webm",
      mimeType: "audio/webm",
      size: 1024,
      purpose: "reference-material",
    });

    expect(result.success).toBe(false);
  });

  it("rejects document MIME types for rehearsal audio uploads", () => {
    const result = assetUploadUrlRequestSchema.safeParse({
      originalName: "slides.pdf",
      mimeType: "application/pdf",
      size: 1024,
      purpose: "rehearsal-audio",
    });

    expect(result.success).toBe(false);
  });
});
