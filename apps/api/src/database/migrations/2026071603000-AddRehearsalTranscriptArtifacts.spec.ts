import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { AddRehearsalTranscriptArtifacts2026071603000 } from "./2026071603000-AddRehearsalTranscriptArtifacts";

describe("AddRehearsalTranscriptArtifacts migration", () => {
  it("links both private transcript assets to a rehearsal run", async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        return [];
      }),
    } as unknown as QueryRunner;
    await new AddRehearsalTranscriptArtifacts2026071603000().up(queryRunner);
    const sql = queries.join(" ").replace(/\s+/g, " ");
    expect(sql).toContain("transcript_json_file_id text NULL");
    expect(sql).toContain("transcript_text_file_id text NULL");
  });
});
