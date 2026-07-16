import { describe, expect, it } from "vitest";

import {
  focusedPracticeAnalysisJobPayloadSchema,
  privateAudioCleanupJobPayloadSchema,
} from "./private-audio-cleanup.schema";

describe("coaching Job payload privacy", () => {
  it("keeps analysis payloads identifier-only", () => {
    expect(
      focusedPracticeAnalysisJobPayloadSchema.parse({
        jobId: "job_1",
        projectId: "project_1",
        attemptId: "attempt_1",
      }).attemptId,
    ).toBe("attempt_1");

    expect(
      focusedPracticeAnalysisJobPayloadSchema.safeParse({
        jobId: "job_1",
        projectId: "project_1",
        attemptId: "attempt_1",
        transcript: "민감한 원문",
      }).success,
    ).toBe(false);
  });

  it("rejects storage keys and unsupported cleanup reasons", () => {
    expect(
      privateAudioCleanupJobPayloadSchema.safeParse({
        jobId: "job_1",
        projectId: "project_1",
        fileId: "file_1",
        subjectType: "focused-practice-attempt",
        subjectId: "attempt_1",
        reason: "terminal-delete-retry",
        cleanupGeneration: 1,
        storageKey: "private/path",
      }).success,
    ).toBe(false);
  });
});

