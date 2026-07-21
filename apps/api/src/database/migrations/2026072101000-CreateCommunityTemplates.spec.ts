import { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { CreateCommunityTemplates2026072101000 } from "./2026072101000-CreateCommunityTemplates";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query.trim());
    }),
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("CreateCommunityTemplates migration", () => {
  it("creates immutable template, usage, and idempotency storage with privacy-safe FK policies", async () => {
    const migration = new CreateCommunityTemplates2026072101000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS community_templates");
    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS community_template_usages",
    );
    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS community_template_use_requests",
    );
    expect(sql).toContain(
      "owner_user_id text REFERENCES users(user_id) ON DELETE SET NULL",
    );
    expect(sql).toContain(
      "source_project_id text REFERENCES projects(project_id) ON DELETE SET NULL",
    );
    expect(sql).toContain("CHECK (source_deck_version > 0)");
    expect(sql).toContain(
      "CHECK (category IN ('business', 'education', 'portfolio', 'event'))",
    );
    expect(sql).toContain("CHECK (use_count > 0)");
    expect(sql).toContain("client_request_id uuid NOT NULL");
    expect(sql).toContain("PRIMARY KEY (user_id, client_request_id)");
    expect(sql).toContain("idx_community_templates_title_lower");
    expect(sql).toContain("idx_community_template_usages_user_recent");
  });

  it("drops indexes and tables in dependency-safe reverse order", async () => {
    const migration = new CreateCommunityTemplates2026072101000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.down(queryRunner);

    expect(queries).toEqual([
      "DROP TABLE IF EXISTS community_template_use_requests",
      "DROP INDEX IF EXISTS idx_community_template_usages_user_recent",
      "DROP TABLE IF EXISTS community_template_usages",
      "DROP INDEX IF EXISTS idx_community_templates_title_lower",
      "DROP INDEX IF EXISTS idx_community_templates_category_created",
      "DROP INDEX IF EXISTS idx_community_templates_created",
      "DROP TABLE IF EXISTS community_templates",
    ]);
  });
});
