import { describe, expect, it } from "vitest";

import {
  briefRequirementInputSchema,
  presentationBriefDraftSchema,
  presentationBriefSchema,
  putPresentationBriefRequestSchema,
} from "./presentation-brief.schema";

const content = {
  audience: "decision-maker" as const,
  purpose: "persuade" as const,
  evaluatorLensRef: { lensId: "decision-maker" as const, revision: 1 as const },
  targetDurationMinutes: 10,
  desiredOutcome: "다음 분기 예산 승인을 얻는다.",
  requirements: [],
  terminology: [],
  challengeTopics: ["비용"],
};

describe("presentationBriefSchema", () => {
  it("parses a bounded Brief without source text", () => {
    const result = presentationBriefSchema.parse({
      ...content,
      briefId: "brief_1",
      projectId: "project_1",
      revision: 1,
      approvedReferences: [
        { fileId: "file_1", fileContentHash: "a".repeat(64) },
      ],
      createdAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:00:00.000Z",
    });

    expect(result.revision).toBe(1);
    expect(result.origin).toBe("manual");
    expect(JSON.stringify(result)).not.toContain("cleanedText");
  });

  it("validates an identity-free draft extracted from an imported deck", () => {
    const result = presentationBriefDraftSchema.parse({
      ...content,
      requirements: [
        {
          kind: "must-cover",
          text: "핵심 수치를 설명한다.",
          reviewStatus: "approved",
        },
      ],
    });

    expect(result.requirements[0]?.text).toBe("핵심 수치를 설명한다.");
  });

  it("rejects duplicate references and unknown raw content", () => {
    const request = {
      ...content,
      expectedRevision: 0,
      approvedReferenceFileIds: ["file_1", "file_1"],
      rawReferenceText: "저장하면 안 되는 원문",
    };

    expect(putPresentationBriefRequestSchema.safeParse(request).success).toBe(false);
  });

  it("requires existing requirement identity and revision together", () => {
    expect(
      briefRequirementInputSchema.safeParse({
        requirementId: "requirement_1",
        kind: "must-cover",
        text: "핵심 수치를 설명한다.",
        reviewStatus: "approved",
      }).success,
    ).toBe(false);
  });
});
