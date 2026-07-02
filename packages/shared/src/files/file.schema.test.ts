import { describe, expect, it } from "vitest";
import {
  assetUploadUrlRequestSchema,
  filePurposeSchema,
  maxRehearsalAudioUploadSizeBytes,
} from "./file.schema";

describe("filePurposeSchema", () => {
  it("accepts internal design assets", () => {
    expect(filePurposeSchema.parse("design-asset")).toBe("design-asset");
  });
});

describe("assetUploadUrlRequestSchema", () => {
  it("accepts rehearsal audio uploads with audio MIME types", () => {
    const result = assetUploadUrlRequestSchema.parse({
      originalName: "rehearsal.webm",
      mimeType: "audio/webm",
      size: maxRehearsalAudioUploadSizeBytes,
      purpose: "rehearsal-audio",
    });

    expect(result.mimeType).toBe("audio/webm");
  });

  it("accepts OpenAI-compatible rehearsal audio MIME aliases", () => {
    for (const mimeType of ["audio/mp3", "audio/x-m4a"] as const) {
      const result = assetUploadUrlRequestSchema.parse({
        originalName: "rehearsal.audio",
        mimeType,
        size: 1024,
        purpose: "rehearsal-audio",
      });

      expect(result.mimeType).toBe(mimeType);
    }
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

  it("rejects direct uploads for internal design assets", () => {
    const result = assetUploadUrlRequestSchema.safeParse({
      originalName: "design.png",
      mimeType: "image/png",
      size: 1024,
      purpose: "design-asset",
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

  it("rejects rehearsal audio MIME types that OpenAI report STT does not accept", () => {
    for (const mimeType of ["audio/ogg", "audio/flac"] as const) {
      const result = assetUploadUrlRequestSchema.safeParse({
        originalName: "rehearsal.audio",
        mimeType,
        size: 1024,
        purpose: "rehearsal-audio",
      });

      expect(result.success).toBe(false);
    }
  });

  it("rejects rehearsal audio above the OpenAI upload limit", () => {
    const result = assetUploadUrlRequestSchema.safeParse({
      originalName: "rehearsal.webm",
      mimeType: "audio/webm",
      size: maxRehearsalAudioUploadSizeBytes + 1,
      purpose: "rehearsal-audio",
    });

    expect(result.success).toBe(false);
  });
});
