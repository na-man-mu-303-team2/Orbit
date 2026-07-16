import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { AddRehearsalTranscriptArtifacts2026071603000 } from "./2026071603000-AddRehearsalTranscriptArtifacts";

describe("AddRehearsalTranscriptArtifacts migration", () => {
  it("links JSON and text transcript assets to a rehearsal run", async () => {
    const { queries, queryRunner } = queryRunnerSpy();

    await new AddRehearsalTranscriptArtifacts2026071603000().up(queryRunner);

    const sql = compactSql(queries.join("\n"));
    expect(sql).toContain("ADD COLUMN transcript_json_file_id text");
    expect(sql).toContain("ADD COLUMN transcript_text_file_id text");
    expect(sql).toContain(
      "FOREIGN KEY (project_id, transcript_json_file_id) REFERENCES project_assets(project_id, file_id) ON DELETE SET NULL (transcript_json_file_id)",
    );
    expect(sql).toContain(
      "FOREIGN KEY (project_id, transcript_text_file_id) REFERENCES project_assets(project_id, file_id) ON DELETE SET NULL (transcript_text_file_id)",
    );
  });

  it("removes transcript asset links on revert", async () => {
    const { queries, queryRunner } = queryRunnerSpy();

    await new AddRehearsalTranscriptArtifacts2026071603000().down(queryRunner);

    const sql = compactSql(queries.join("\n"));
    expect(sql).toContain(
      "DROP CONSTRAINT IF EXISTS fk_rehearsal_runs_transcript_text_file",
    );
    expect(sql).toContain("DROP COLUMN IF EXISTS transcript_text_file_id");
    expect(sql).toContain("DROP COLUMN IF EXISTS transcript_json_file_id");
  });
});

function queryRunnerSpy() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      return [];
    }),
  } as unknown as QueryRunner;
  return { queries, queryRunner };
}

function compactSql(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
