import { describe, expect, it, vi } from "vitest";
import type { QueryRunner } from "typeorm";

import { AddSlidePracticeContentHash2026072101000 } from "./2026072101000-AddSlidePracticeContentHash";

describe("AddSlidePracticeContentHash2026072101000", () => {
  it("adds nullable comparable content hash columns and a lowercase SHA-256 constraint", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    await new AddSlidePracticeContentHash2026072101000().up({ query } as unknown as QueryRunner);
    const sql = query.mock.calls.map(([statement]) => statement).join("\n");

    expect(sql).toContain("ALTER TABLE slide_practice_audio_analyses");
    expect(sql).toContain("ALTER TABLE slide_practice_reports");
    expect(sql).toContain("ADD COLUMN content_hash_version text");
    expect(sql).toContain("ADD COLUMN slide_content_hash text");
    expect(sql).toContain("slide_content_hash ~ '^[a-f0-9]{64}$'");
    expect(sql).toContain("content_hash_version = 'slide-text-v1'");
    expect(sql).toContain("idx_slide_practice_comparable_history");
    expect(sql).toContain("slide_content_hash,\n        created_at DESC");
    expect(sql).not.toMatch(/ADD COLUMN (content_hash_version|slide_content_hash) text NOT NULL/);
  });

  it("drops the index, constraints, and columns in dependency order", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    await new AddSlidePracticeContentHash2026072101000().down({ query } as unknown as QueryRunner);
    const sql = query.mock.calls.map(([statement]) => statement).join("\n");

    expect(query.mock.calls[0]?.[0]).toContain("DROP INDEX IF EXISTS idx_slide_practice_comparable_history");
    expect(sql).toContain("DROP CONSTRAINT IF EXISTS ck_slide_practice_report_content_hash");
    expect(sql).toContain("DROP CONSTRAINT IF EXISTS ck_slide_practice_analysis_content_hash");
    expect(sql).toContain("DROP COLUMN IF EXISTS slide_content_hash");
    expect(sql).toContain("DROP COLUMN IF EXISTS content_hash_version");
  });
});
