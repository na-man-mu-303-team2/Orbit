import { describe, expect, it, vi } from "vitest";
import type { QueryRunner } from "typeorm";

import { CreateSlidePracticeAudioAnalyses2026071703000 } from "./2026071703000-CreateSlidePracticeAudioAnalyses";

describe("CreateSlidePracticeAudioAnalyses2026071703000", () => {
  it("stores only private-audio references and derived report references", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    await new CreateSlidePracticeAudioAnalyses2026071703000().up({ query } as unknown as QueryRunner);
    const sql = query.mock.calls.map(([statement]) => statement).join("\n");
    expect(sql).toContain("CREATE TABLE slide_practice_audio_analyses");
    expect(sql).toContain("audio_file_id text NOT NULL");
    expect(sql).toContain("report_id text");
    expect(sql).toContain("ON DELETE SET NULL (report_id)");
    expect(sql).not.toMatch(/\b(transcript|audio_bytes|audio_base64)\s+(text|jsonb|bytea)/i);
  });
});
