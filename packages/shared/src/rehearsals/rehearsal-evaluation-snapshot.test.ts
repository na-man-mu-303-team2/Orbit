import { describe, expect, it } from "vitest";

import { deckSchema } from "../deck/deck.schema";
import { createRehearsalEvaluationSnapshot } from "./rehearsal-evaluation-snapshot";
import { rehearsalEvaluationSnapshotSchema } from "./rehearsal.schema";

describe("createRehearsalEvaluationSnapshot", () => {
  it("captures only reviewed cues without presenter source content", () => {
    const snapshot = createRehearsalEvaluationSnapshot(
      deckSchema.parse(deckFixture()),
      "2026-07-10T08:00:00.000Z"
    );

    expect(snapshot).toMatchObject({
      deckId: "deck_snapshot",
      deckVersion: 4,
      capturedAt: "2026-07-10T08:00:00.000Z"
    });
    expect(snapshot.slides[0]?.estimatedSeconds).toBe(600);
    expect(snapshot.slides[0]?.semanticCues.map((cue) => cue.cueId)).toEqual([
      "scue_approved",
      "scue_excluded"
    ]);
    expect(snapshot.slides[0]?.semanticCues[0]?.freshness).toBe("stale");

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("발표자 전용 원문");
    expect(serialized).not.toContain("슬라이드 요소 원문");
    expect(serialized).not.toContain("speakerNotes");
    expect(serialized).not.toContain("elements");
    expect(snapshot.deckContentHash).toBeNull();
    expect(snapshot.evaluationPlan).toBeNull();
  });

  it("rejects suggested cues in persisted snapshots", () => {
    const snapshot = createRehearsalEvaluationSnapshot(
      deckSchema.parse(deckFixture()),
      "2026-07-10T08:00:00.000Z"
    );

    const result = rehearsalEvaluationSnapshotSchema.safeParse({
      ...snapshot,
      slides: [
        {
          ...snapshot.slides[0],
          semanticCues: [
            {
              ...snapshot.slides[0]?.semanticCues[0],
              reviewStatus: "suggested"
            }
          ]
        }
      ]
    });

    expect(result.success).toBe(false);
  });
});

function deckFixture() {
  return {
    deckId: "deck_snapshot",
    projectId: "project_snapshot",
    title: "Snapshot Deck",
    version: 4,
    targetDurationMinutes: 10,
    canvas: {
      preset: "wide-16-9",
      width: 1920,
      height: 1080,
      aspectRatio: "16:9"
    },
    slides: [
      {
        slideId: "slide_1",
        order: 1,
        title: "Opening",
        speakerNotes: "발표자 전용 원문",
        keywords: [
          {
            keywordId: "kw_1",
            text: "ORBIT",
            synonyms: ["발표 도우미"],
            abbreviations: [],
            required: true
          }
        ],
        elements: [
          {
            elementId: "el_1",
            type: "text",
            x: 0,
            y: 0,
            width: 100,
            height: 40,
            props: { text: "슬라이드 요소 원문" }
          }
        ],
        semanticCues: [
          semanticCue("scue_approved", "approved", "stale"),
          semanticCue("scue_excluded", "excluded", "current"),
          semanticCue("scue_suggested", "suggested", "current")
        ]
      }
    ]
  };
}

function semanticCue(
  cueId: string,
  reviewStatus: "suggested" | "approved" | "excluded",
  freshness: "current" | "stale"
) {
  return {
    cueId,
    slideId: "slide_1",
    meaning: `의미 ${cueId}`,
    importance: "core",
    reviewStatus,
    freshness,
    origin: "ai",
    revision: 2,
    required: true,
    priority: 1,
    candidateKeywords: ["ORBIT"],
    aliases: {},
    requiredConcepts: ["발표 도우미"],
    nliHypotheses: ["발표자는 ORBIT이 발표를 돕는다고 설명했다"],
    negativeHints: [],
    targetElementIds: [],
    triggerActionIds: []
  };
}
