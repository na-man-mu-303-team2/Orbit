import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUniqueOpenPresentationSession2026070202000 implements MigrationInterface {
  name = "AddUniqueOpenPresentationSession2026070202000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH ranked_open_sessions AS (
        SELECT
          session_id,
          row_number() OVER (
            PARTITION BY project_id
            ORDER BY created_at DESC, session_id DESC
          ) AS row_number
        FROM presentation_sessions
        WHERE status = 'open'
      )
      UPDATE presentation_sessions
      SET status = 'closed'
      WHERE session_id IN (
        SELECT session_id
        FROM ranked_open_sessions
        WHERE row_number > 1
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_presentation_sessions_one_open_per_project
      ON presentation_sessions (project_id)
      WHERE status = 'open'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_presentation_sessions_one_open_per_project
    `);
  }
}
