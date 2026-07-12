import { deckSchema, presentationBriefSchema } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import {
  buildRehearsalEvaluationPlan,
  deckContentHash,
  sha256Canonical,
} from "./evaluation-plan";

describe("evaluation plan", () => {
  it("builds the same hash and criteria regardless of object key order", () => {
    expect(sha256Canonical({ b: 2, a: 1 })).toBe(sha256Canonical({ a: 1, b: 2 }));
    expect(deckContentHash(deck())).toMatch(/^[a-f0-9]{64}$/);
  });

  it("freezes Brief, Lens, approved references, and versioned criteria", () => {
    const brief = presentationBriefSchema.parse({
      briefId: "brief_1",
      projectId: "project_1",
      revision: 2,
      audience: "decision-maker",
      purpose: "persuade",
      evaluatorLensRef: { lensId: "decision-maker", revision: 1 },
      targetDurationMinutes: 8,
      desiredOutcome: "승인을 얻는다.",
      requirements: [],
      terminology: [],
      challengeTopics: [],
      approvedReferences: [{ fileId: "file_1", fileContentHash: "a".repeat(64) }],
      createdAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:00:00.000Z",
    });
    const plan = buildRehearsalEvaluationPlan({ deck: deck(), brief, sourceGoalSetRef: null });

    expect(plan.briefRef).toEqual({ mode: "briefed", briefId: "brief_1", revision: 2 });
    expect(plan.evaluatorLensRef.lensId).toBe("decision-maker");
    expect(plan.approvedReferences).toHaveLength(1);
    expect(plan.criteria.some((criterion) => criterion.category === "timing")).toBe(true);
  });
});

function deck() {
  return deckSchema.parse({
    deckId: "deck_1",
    projectId: "project_1",
    title: "테스트 덱",
    version: 1,
    targetDurationMinutes: 10,
    canvas: { preset: "wide-16-9", width: 1920, height: 1080, aspectRatio: "16:9" },
    slides: [
      {
        slideId: "slide_1",
        order: 1,
        title: "도입",
        elements: [],
        keywords: [],
        semanticCues: [],
      },
    ],
  });
}
