import { describe, expect, it } from "vitest";
import { maxRehearsalAudioUploadSizeBytes } from "../files/file.schema";
import {
  createRehearsalAudioUploadUrlRequestSchema,
  rehearsalRunSchema,
} from "./rehearsal.schema";

describe("rehearsalRunSchema", () => {
  it("accepts deleted raw audio tracking on completed runs", () => {
    const run = rehearsalRunSchema.parse({
      runId: "run_1",
      projectId: "project_demo_1",
      deckId: "deck_demo_1",
      audioFileId: "file_audio_1",
      jobId: "job_1",
      status: "succeeded",
      error: null,
      rawAudioDeletedAt: "2026-06-29T00:00:10.000Z",
      createdAt: "2026-06-29T00:00:00.000Z",
      updatedAt: "2026-06-29T00:00:10.000Z",
    });

    expect(run.status).toBe("succeeded");
    expect(run.rawAudioDeletedAt).toBe("2026-06-29T00:00:10.000Z");
  });
});

describe("createRehearsalAudioUploadUrlRequestSchema", () => {
  it("accepts audio MIME types without exposing purpose in the request", () => {
    const request = createRehearsalAudioUploadUrlRequestSchema.parse({
      originalName: "rehearsal.webm",
      mimeType: "audio/webm",
      size: maxRehearsalAudioUploadSizeBytes,
    });

    expect(request.mimeType).toBe("audio/webm");
  });

  it("accepts OpenAI-compatible MIME aliases", () => {
    for (const mimeType of ["audio/mp3", "audio/x-m4a"] as const) {
      const request = createRehearsalAudioUploadUrlRequestSchema.parse({
        originalName: "rehearsal.audio",
        mimeType,
        size: 1024,
      });

      expect(request.mimeType).toBe(mimeType);
    }
  });

  it("rejects non-audio MIME types", () => {
    const result = createRehearsalAudioUploadUrlRequestSchema.safeParse({
      originalName: "slides.pdf",
      mimeType: "application/pdf",
      size: 1024,
    });

    expect(result.success).toBe(false);
  });

  it("rejects MIME types unsupported by OpenAI report STT", () => {
    for (const mimeType of ["audio/ogg", "audio/flac"] as const) {
      const result = createRehearsalAudioUploadUrlRequestSchema.safeParse({
        originalName: "rehearsal.audio",
        mimeType,
        size: 1024,
      });

      expect(result.success).toBe(false);
    }
  });

  it("rejects audio above the OpenAI upload limit", () => {
    const result = createRehearsalAudioUploadUrlRequestSchema.safeParse({
      originalName: "rehearsal.webm",
      mimeType: "audio/webm",
      size: maxRehearsalAudioUploadSizeBytes + 1,
    });

    expect(result.success).toBe(false);
  });
});
