import { MigrationInterface, QueryRunner } from "typeorm";

export class ReplaceRehearsalSummaryWithProjectComment2026070802000 implements MigrationInterface {
  name = "ReplaceRehearsalSummaryWithProjectComment2026070802000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS project_rehearsal_summaries`);
    await queryRunner.query(`
      ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS progress_comment text
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE projects DROP COLUMN IF EXISTS progress_comment`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS project_rehearsal_summaries (
        project_id            text PRIMARY KEY REFERENCES projects(project_id) ON DELETE CASCADE,
        updated_at            timestamptz NOT NULL DEFAULT now(),
        run_count             integer NOT NULL DEFAULT 0,
        run_duration_series   jsonb NOT NULL DEFAULT '[]'::jsonb,
        slide_avg_timings     jsonb NOT NULL DEFAULT '[]'::jsonb,
        progress_comment      text
      )
    `);
  }
}
