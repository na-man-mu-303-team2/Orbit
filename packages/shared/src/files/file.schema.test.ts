import { describe, expect, it } from "vitest";
import {
  assetUploadUrlRequestSchema,
  createAssetUploadUrlRequestSchema,
  filePurposeSchema,
  maxRehearsalAudioUploadSizeBytes,
} from "./file.schema";

describe("filePurposeSchema", () => {
  it("accepts internal design assets", () => {
    expect(filePurposeSchema.parse("design-asset")).toBe("design-asset");
  });
});

describe("assetUploadUrlRequestSchema", () => {
  it("reserves all private audio purposes from generic uploads", () => {
    for (const purpose of [
      "rehearsal-audio",
      "focused-practice-audio",
      "qna-answer-audio",
    ] as const) {
      expect(
        assetUploadUrlRequestSchema.safeParse({
          originalName: "private.webm",
          mimeType: "audio/webm",
          size: 1024,
          purpose,
        }).success,
      ).toBe(false);
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

  it("uses the configured private audio upload limit when validating reserved input", () => {
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

  it("caps configured rehearsal audio upload limits at the implemented report STT maximum", () => {
    const schema = createAssetUploadUrlRequestSchema({
      maxRehearsalAudioUploadSizeBytes: 209_715_200,
    });

    const result = schema.safeParse({
      originalName: "rehearsal.flac",
      mimeType: "audio/flac",
      size: maxRehearsalAudioUploadSizeBytes + 1,
      purpose: "rehearsal-audio",
    });

    expect(result.success).toBe(false);
  });
});
