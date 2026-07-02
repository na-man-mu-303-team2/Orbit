import { describe, expect, it } from "vitest";
import {
  assetUploadUrlRequestSchema,
  createAssetUploadUrlRequestSchema,
  maxRehearsalAudioUploadSizeBytes,
} from "./file.schema";

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
    for (const mimeType of ["audio/mp3", "audio/flac", "audio/x-m4a"] as const) {
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

  it("rejects document MIME types for rehearsal audio uploads", () => {
    const result = assetUploadUrlRequestSchema.safeParse({
      originalName: "slides.pdf",
      mimeType: "application/pdf",
      size: 1024,
      purpose: "rehearsal-audio",
    });

    expect(result.success).toBe(false);
  });

  it("rejects rehearsal audio MIME types outside the report STT contract", () => {
    for (const mimeType of ["audio/ogg"] as const) {
      const result = assetUploadUrlRequestSchema.safeParse({
        originalName: "rehearsal.audio",
        mimeType,
        size: 1024,
        purpose: "rehearsal-audio",
      });

      expect(result.success).toBe(false);
    }
  });

  it("rejects rehearsal audio above the rehearsal upload limit", () => {
    const result = assetUploadUrlRequestSchema.safeParse({
      originalName: "rehearsal.webm",
      mimeType: "audio/webm",
      size: maxRehearsalAudioUploadSizeBytes + 1,
      purpose: "rehearsal-audio",
    });

    expect(result.success).toBe(false);
  });

  it("uses the configured rehearsal audio upload limit when provided", () => {
    const schema = createAssetUploadUrlRequestSchema({
      maxRehearsalAudioUploadSizeBytes: 1024,
    });

    const result = schema.safeParse({
      originalName: "rehearsal.flac",
      mimeType: "audio/flac",
      size: 1025,
      purpose: "rehearsal-audio",
    });

    expect(result.success).toBe(false);
  });
});
