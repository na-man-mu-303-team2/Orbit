import { describe, expect, it } from "vitest";

import {
  completePresentationAudioRequestSchema,
  createPresentationRunRequestSchema,
  presentationAnalysisJobPayloadSchema,
  presentationRunSchema,
} from "./presentation.schema";

const run = {
  runId: "presentation_run_1",
  projectId: "project_1",
  sessionId: "session_1",
  deckId: "deck_1",
  deckVersion: 4,
  recordingMode: "microphone" as const,
  audioFileId: null,
  jobId: null,
  status: "created" as const,
  error: null,
  voiceReport: null,
  detailedReport: null,
  startedAt: "2026-07-20T00:00:00.000Z",
  endedAt: null,
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T00:00:00.000Z",
};

describe("Presentation run contract", () => {
  it("keeps the presentation session identity and Deck version on the run", () => {
    expect(presentationRunSchema.safeParse(run).success).toBe(true);
    expect(
      presentationRunSchema.safeParse({ ...run, sessionId: undefined }).success,
    ).toBe(false);
  });

  it("supports microphone and no-audio starts without accepting unknown fields", () => {
    expect(
      createPresentationRunRequestSchema.parse({ expectedDeckVersion: 4 }),
    ).toEqual({ expectedDeckVersion: 4, recordingMode: "microphone" });
    expect(
      createPresentationRunRequestSchema.safeParse({
        expectedDeckVersion: 4,
        recordingMode: "none",
        rehearsalRunId: "run_forbidden",
      }).success,
    ).toBe(false);
  });

  it("uses separate completion commands for uploaded and absent audio", () => {
    expect(
      completePresentationAudioRequestSchema.safeParse({ fileId: "file_1" })
        .success,
    ).toBe(true);
    expect(
      completePresentationAudioRequestSchema.safeParse({ withoutAudio: true })
        .success,
    ).toBe(true);
    expect(
      completePresentationAudioRequestSchema.safeParse({
        fileId: "file_1",
        withoutAudio: true,
      }).success,
    ).toBe(false);
  });

  it("requires the analysis job to stay bound to the presentation session", () => {
    expect(
      presentationAnalysisJobPayloadSchema.safeParse({
        jobId: "job_1",
        projectId: "project_1",
        sessionId: "session_1",
        runId: "presentation_run_1",
        deckId: "deck_1",
        audioFileId: "file_1",
      }).success,
    ).toBe(true);
    expect(
      presentationAnalysisJobPayloadSchema.safeParse({
        jobId: "job_1",
        projectId: "project_1",
        runId: "presentation_run_1",
        deckId: "deck_1",
        audioFileId: "file_1",
      }).success,
    ).toBe(false);
  });
});
