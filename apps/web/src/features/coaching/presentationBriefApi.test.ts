import { describe, expect, it, vi } from "vitest";
import { PresentationBriefConflictError, putPresentationBrief } from "./presentationBriefApi";

describe("presentation Brief API", () => {
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
});
