import { describe, expect, it } from "vitest";

import { projectAiDeckPreview } from "./ai-deck-preview.service";

describe("projectAiDeckPreview", () => {
  it("returns only safe Story outline fields before layout", () => {
    const preview = projectAiDeckPreview({
      job: {
        job_id: "job-1",
        project_id: "project-1",
        status: "running",
        progress: 40,
        error: null,
        updated_at: "2026-07-17T00:00:00.000Z",
      },
      planningRows: [
        {
          stage: "content-planning",
          payload_json: {
            rawInput: { prompt: "secret", sourceRecords: ["secret"] },
            contentPlan: {
              slidePlans: [
                {
                  order: 1,
                  title: "첫 장",
                  message: "핵심 메시지",
                  speakerNotes: "비공개 발표자 대본",
                  sourceRefs: ["source-secret"],
                },
              ],
            },
          },
        },
      ],
      imageRows: [],
      qualityRow: null,
      deckRow: null,
    });

    expect(preview).toMatchObject({
      status: "composing",
      outline: [{ order: 1, title: "첫 장", message: "핵심 메시지" }],
      deck: null,
    });
    expect(JSON.stringify(preview)).not.toContain("secret");
    expect(JSON.stringify(preview)).not.toContain("발표자 대본");
  });

  it("keeps a safe failure status without exposing provider errors", () => {
    const preview = projectAiDeckPreview({
      job: {
        job_id: "job-1",
        project_id: "project-1",
        status: "failed",
        progress: 70,
        error: {
          code: "AI_DECK_IMAGE_FAILED",
          message: "provider response must stay private",
          retryable: true,
        },
        updated_at: "2026-07-17T00:00:00.000Z",
      },
      planningRows: [],
      imageRows: [],
      qualityRow: null,
      deckRow: null,
    });

    expect(preview.error).toEqual({
      code: "AI_DECK_IMAGE_FAILED",
      message: "슬라이드를 생성하지 못했습니다.",
      retryable: true,
    });
  });
});
