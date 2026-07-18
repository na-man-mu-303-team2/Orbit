import { describe, expect, it, vi } from "vitest";
import type { QueryRunner } from "typeorm";

import { CreateSlidePracticeAndQuestionGuides2026071701000 } from "./2026071701000-CreateSlidePracticeAndQuestionGuides";

describe("CreateSlidePracticeAndQuestionGuides2026071701000", () => {
  it("creates private practice, baseline, guide, and item tables", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    await new CreateSlidePracticeAndQuestionGuides2026071701000().up({ query } as unknown as QueryRunner);
    const sql = query.mock.calls.map(([statement]) => statement).join("\n");
    expect(sql).toContain("CREATE TABLE slide_practice_reports");
    expect(sql).toContain("CREATE TABLE user_voice_baselines");
    expect(sql).toContain("CREATE TABLE slide_question_guides");
    expect(sql).toContain("CREATE TABLE slide_question_guide_items");
    expect(sql).toContain("source_snapshot_json jsonb NOT NULL");
    expect(sql).toContain("uq_slide_practice_client");
    expect(sql).toContain("created_by text NOT NULL REFERENCES users");
  });

  it("drops child tables before parent tables", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    await new CreateSlidePracticeAndQuestionGuides2026071701000().down({ query } as unknown as QueryRunner);
    expect(query.mock.calls[0]?.[0]).toContain("slide_question_guide_items");
    expect(query.mock.calls.at(-1)?.[0]).toContain("slide_practice_reports");
  });
});
