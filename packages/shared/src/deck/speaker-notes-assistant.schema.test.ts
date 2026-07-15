import { describe, expect, it } from "vitest";

import {
  speakerNotesSuggestionJobPayloadSchema,
  speakerNotesSuggestionProviderRequestSchema,
  speakerNotesSuggestionResultSchema
} from "./speaker-notes-assistant.schema";

describe("speaker notes assistant contract", () => {
  it("keeps raw notes out of the queue payload", () => {
    const payload = speakerNotesSuggestionJobPayloadSchema.parse({
      jobId: "job_notes_1",
      projectId: "project_1",
      request: {
        deckId: "deck_1",
        slideId: "slide_1",
        baseVersion: 3,
        mode: "naturalize"
      }
    });

    expect(JSON.stringify(payload)).not.toContain("currentNotes");
    expect(
      speakerNotesSuggestionJobPayloadSchema.safeParse({
        ...payload,
        currentNotes: "큐에 실리면 안 되는 발표자 원문"
      }).success
    ).toBe(false);
  });

  it("validates the bounded provider request", () => {
    expect(
      speakerNotesSuggestionProviderRequestSchema.parse({
        mode: "draft",
        slideTitle: "문제 정의",
        slideContent: ["기존 발표 준비 흐름은 복잡합니다."],
        currentNotes: "",
        targetSpeakerNotesChars: 220,
        charsPerMinute: 320
      })
    ).toMatchObject({ mode: "draft", targetSpeakerNotesChars: 220 });
  });

  it("rejects empty suggestions", () => {
    expect(
      speakerNotesSuggestionResultSchema.safeParse({
        slideId: "slide_1",
        baseVersion: 3,
        mode: "draft",
        suggestedNotes: "",
        summary: "초안을 만들었습니다.",
        warnings: [],
        metrics: { characterCount: 0 }
      }).success
    ).toBe(false);
  });
});
