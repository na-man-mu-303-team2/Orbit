import { describe, expect, it, vi } from "vitest";

import { CreateAiDeckStoryReviews2026071604000 } from "./2026071604000-CreateAiDeckStoryReviews";

describe("CreateAiDeckStoryReviews migration", () => {
  it("creates one lifecycle table without storing plan or artifact ids", async () => {
    const query = vi.fn(async () => undefined);
    await new CreateAiDeckStoryReviews2026071604000().up({ query } as never);

    const sql = query.mock.calls.flat().join(" ");
    expect(sql).toContain("CREATE TABLE ai_deck_story_reviews");
    expect(sql).toContain("pipeline_job_id text PRIMARY KEY");
    expect(sql).toContain("regeneration_count");
    expect(sql).not.toContain("artifact_id");
    expect(sql).not.toContain("plan_json");
  });

  it("drops the lifecycle table on local rollback", async () => {
    const query = vi.fn(async () => undefined);
    await new CreateAiDeckStoryReviews2026071604000().down({ query } as never);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("DROP TABLE IF EXISTS ai_deck_story_reviews"),
    );
  });
});
