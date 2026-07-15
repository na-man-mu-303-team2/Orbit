import { describe, expect, it, vi } from "vitest";

import {
  createSpeakerNotesSuggestionJob,
  formatSpeakerNotesDuration,
  getSpeakerNotesLengthGuidance,
  waitForSpeakerNotesSuggestionJob,
} from "./speakerNotesAssistant";

describe("speaker notes assistant model", () => {
  it("classifies the local length without sending text anywhere", () => {
    expect(
      getSpeakerNotesLengthGuidance("짧은 메모입니다.", {
        charsPerMinute: 300,
        targetSpeakerNotesChars: 100,
      }),
    ).toMatchObject({
      characterCount: 8,
      estimatedSeconds: 2,
      tone: "short",
      targetCharacters: 100,
    });
  });

  it("formats presenter-friendly duration labels", () => {
    expect(formatSpeakerNotesDuration(42)).toBe("약 42초");
    expect(formatSpeakerNotesDuration(75)).toBe("약 1분 15초");
    expect(formatSpeakerNotesDuration()).toBeNull();
  });

  it("creates an ID-only request and validates the completed result", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          job: {
            jobId: "job_notes_1",
            projectId: "project_1",
            type: "speaker-notes-suggestion",
            status: "queued",
            progress: 0,
            message: "queued",
            result: null,
            error: null,
            createdAt: "2026-07-15T00:00:00.000Z",
            updatedAt: "2026-07-15T00:00:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          jobId: "job_notes_1",
          projectId: "project_1",
          type: "speaker-notes-suggestion",
          status: "succeeded",
          progress: 100,
          message: "done",
          result: {
            slideId: "slide_1",
            baseVersion: 2,
            mode: "draft",
            suggestedNotes: "자연스러운 발표 초안입니다.",
            summary: "초안을 만들었습니다.",
            warnings: [],
            metrics: { characterCount: 12, estimatedSeconds: 3 },
          },
          error: null,
          createdAt: "2026-07-15T00:00:00.000Z",
          updatedAt: "2026-07-15T00:00:01.000Z",
        }),
      );

    const job = await createSpeakerNotesSuggestionJob(
      "project_1",
      {
        deckId: "deck_1",
        slideId: "slide_1",
        baseVersion: 2,
        mode: "draft",
      },
      fetcher,
    );
    const result = await waitForSpeakerNotesSuggestionJob(
      job.jobId,
      fetcher,
      { pollIntervalMs: 0 },
    );

    expect(result.suggestedNotes).toContain("발표 초안");
    expect(String(fetcher.mock.calls[0]?.[1]?.body)).not.toContain("speakerNotes");
  });
});
