import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import {
  applyStoryPlanDesignSelection,
  applyStoryPlanEdit,
  projectStoryPlanReview,
  StoryPlanReviewService,
} from "./story-plan-review.service";

const artifact = {
  payload_json: {
    rawInput: {
      research_quality: "partial",
      research_issue_codes: ["independent-missing"],
      repair_reason_codes: ["CONTENT_CAPACITY"],
      source_records: [
        {
          sourceId: "source-secret",
          sourceType: "web",
          title: "공식 안내",
          url: "https://secret.example",
          content: "raw secret content",
          authority: "official",
        },
      ],
    },
    contentPlan: {
      outline: { title: "ORBIT", slide_titles: ["핵심"] },
      slidePlans: [
        {
          order: 1,
          slide_type: "summary",
          title: "핵심",
          message: "핵심 메시지",
          speaker_notes: "발표자 노트",
          target_seconds: 60,
          source_refs: ["source-secret"],
        },
      ],
      slideCount: 1,
      timingPlan: { targetSpokenSeconds: 60 },
      repairReasonCodes: ["CONTENT_CAPACITY"],
    },
  },
  updated_at: "2026-07-16T00:00:00.000Z",
};

describe("StoryPlanReviewService", () => {
  it("projects only safe source metadata and known quality warnings", () => {
    const response = projectStoryPlanReview({
      job: {
        job_id: "job-1",
        project_id: "project-1",
        status: "running",
        payload: {
          request: {
            topic: "ORBIT",
            metadata: { tone: "friendly" },
          },
          storyReviewRequired: true,
        },
        error: null,
      },
      review: {
        status: "review-pending",
        revision: 1,
        regeneration_count: 0,
        last_error_json: null,
      },
      artifact,
    });

    expect(response.plan?.slides[0]?.sources).toEqual([
      { title: "공식 안내", type: "web", authority: "official" },
    ]);
    expect(JSON.stringify(response)).not.toContain("source-secret");
    expect(JSON.stringify(response)).not.toContain("secret.example");
    expect(JSON.stringify(response)).not.toContain("raw secret content");
    expect(response.plan?.qualityWarnings.map((warning) => warning.code)).toEqual([
      "RESEARCH_PARTIAL",
      "AUTO_REPAIRED",
    ]);
    expect(response.styleContext).toEqual({ topic: "ORBIT", tone: "friendly" });
  });

  it("applies the approved palette and font without changing story content", () => {
    const selection = designSelection();
    const result = applyStoryPlanDesignSelection(
      artifact.payload_json,
      selection,
      "friendly",
    );

    expect(result).toMatchObject({
      rawInput: {
        design_prompt:
          "tone=friendly; palette=warm-amber; font=Pretendard; mediaPolicy=minimal; base=brandlogy-modern",
        design: {
          paletteOverride: selection.paletteOverride,
          fontOverride: selection.fontOverride,
        },
      },
      contentPlan: artifact.payload_json.contentPlan,
    });
  });

  it("reorders slides and updates speaker notes in the content artifact", () => {
    const first = artifact.payload_json.contentPlan.slidePlans[0]!;
    const payload = {
      ...artifact.payload_json,
      contentPlan: {
        ...artifact.payload_json.contentPlan,
        outline: { title: "ORBIT", slide_titles: ["첫째", "둘째"] },
        slidePlans: [
          { ...first, order: 1, title: "첫째" },
          { ...first, order: 2, title: "둘째", speaker_notes: "둘째 대본" },
        ],
        slideCount: 2,
      },
    };

    const reordered = applyStoryPlanEdit(payload, {
      kind: "reorder",
      expectedRevision: 1,
      orders: [2, 1],
    });
    expect(reordered).toMatchObject({
      contentPlan: {
        outline: { slide_titles: ["둘째", "첫째"], slideTitles: ["둘째", "첫째"] },
        slidePlans: [
          { order: 1, title: "둘째" },
          { order: 2, title: "첫째" },
        ],
      },
    });

    expect(
      applyStoryPlanEdit(reordered, {
        kind: "speaker-notes",
        expectedRevision: 2,
        order: 1,
        speakerNotes: "사용자가 수정한 대본",
      }),
    ).toMatchObject({
      contentPlan: {
        slidePlans: [
          {
            order: 1,
            speaker_notes: "사용자가 수정한 대본",
            speakerNotes: "사용자가 수정한 대본",
          },
          { order: 2 },
        ],
      },
    });
    expect(() =>
      applyStoryPlanEdit(payload, {
        kind: "reorder",
        expectedRevision: 1,
        orders: [3, 1],
      }),
    ).toThrow(ConflictException);
  });

  it("rejects stale approval before creating a design checkpoint", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM ai_deck_story_reviews")) {
        return [{ status: "review-pending", revision: 2, regeneration_count: 0 }];
      }
      if (sql.includes("FROM jobs")) {
        return [{ job_id: "job-1", project_id: "project-1", status: "running" }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const dataSource = {
      transaction: vi.fn(async (run: (manager: { query: typeof query }) => unknown) =>
        run({ query }),
      ),
    };
    const service = new StoryPlanReviewService(dataSource as never, { info: vi.fn() } as never);

    await expect(
      service.approve("project-1", "job-1", { expectedRevision: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO ai_deck_generation_stages"))).toBe(false);
  });
});

function designSelection() {
  return {
    paletteOptionId: "warm-amber",
    paletteOverride: {
      primary: "#D97706",
      secondary: "#92400E",
      background: "#FFFBEB",
      surface: "#FFFFFF",
      muted: "#FEF3C7",
      border: "#FDE68A",
      text: "#1C1917",
      accentColor: "#2563EB",
    },
    fontOverride: {
      fontId: "pretendard",
      name: "Pretendard",
      headingFontFamily: "Pretendard",
      bodyFontFamily: "Pretendard",
      fallbackFamily: "Arial",
      weights: [400, 700],
      supportsKorean: true,
      pptxEmbeddable: true,
      moodTags: ["professional"],
      license: "SIL Open Font License 1.1",
      sourceUrl: "https://example.com/font",
      recommendedTitleSize: 48,
      recommendedBodySize: 22,
      lineHeight: 1.15,
      widthFactor: 1,
      overflowRisk: "low" as const,
    },
  };
}
