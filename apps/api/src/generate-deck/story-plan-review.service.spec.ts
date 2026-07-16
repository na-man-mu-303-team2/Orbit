import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import {
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
