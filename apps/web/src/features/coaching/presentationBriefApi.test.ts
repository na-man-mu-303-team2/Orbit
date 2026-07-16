import { describe, expect, it, vi } from "vitest";
import {
  fetchEvaluatorLenses,
  presentationBriefQueryKey,
  PresentationBriefConflictError,
  putPresentationBrief,
} from "./presentationBriefApi";

describe("presentation Brief API", () => {
  it("shares the project-scoped Brief query key", () => {
    expect(presentationBriefQueryKey("project-a")).toEqual([
      "presentation-brief",
      "project-a",
    ]);
  });

  it("loads the evaluator lens registry used by the brief screen", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ items: [
      { ref: { lensId: "general-novice", revision: 1 }, label: "처음 듣는 청중", description: "처음 듣는 관점", priorityOrder: ["structure", "semantic", "timing", "delivery"] },
      { ref: { lensId: "decision-maker", revision: 1 }, label: "의사결정자", description: "결정 관점", priorityOrder: ["semantic", "structure", "timing", "delivery"] },
      { ref: { lensId: "strict-reviewer", revision: 1 }, label: "엄격한 검토자", description: "검증 관점", priorityOrder: ["semantic", "delivery", "structure", "timing"] },
    ] }), { status: 200 }));

    await expect(fetchEvaluatorLenses(fetcher)).resolves.toHaveLength(3);
    expect(fetcher).toHaveBeenCalledWith("/api/v1/evaluator-lenses", { credentials: "include" });
  });

  it("preserves a safe dedicated conflict type", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ code: "REVISION_CONFLICT" }), { status: 409 }));
    await expect(putPresentationBrief("project-a", {
      expectedRevision: 0,
      audience: "decision-maker",
      purpose: "persuade",
      evaluatorLensRef: { lensId: "decision-maker", revision: 1 },
      targetDurationMinutes: 10,
      desiredOutcome: "승인",
      requirements: [],
      terminology: [],
      challengeTopics: [],
      approvedReferenceFileIds: [],
    }, fetcher)).rejects.toBeInstanceOf(PresentationBriefConflictError);
  });

  it("preserves source-not-ready guidance instead of reporting a revision conflict", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      code: "SOURCE_NOT_READY",
      message: "참고자료 추출이 아직 완료되지 않았습니다.",
    }), { status: 409 }));

    await expect(putPresentationBrief("project-a", {
      expectedRevision: 0,
      audience: "decision-maker",
      purpose: "persuade",
      evaluatorLensRef: { lensId: "decision-maker", revision: 1 },
      targetDurationMinutes: 10,
      desiredOutcome: "승인",
      requirements: [],
      terminology: [],
      challengeTopics: [],
      approvedReferenceFileIds: ["file-reference"],
    }, fetcher)).rejects.toThrow("참고자료 추출이 아직 완료되지 않았습니다.");
  });
});
