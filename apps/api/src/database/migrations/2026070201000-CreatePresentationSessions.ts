import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePresentationSessions2026070201000 implements MigrationInterface {
  name = "CreatePresentationSessions2026070201000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS presentation_sessions (
        session_id text PRIMARY KEY,
        session_password_hash text NOT NULL,
        project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
        status text NOT NULL CHECK (status IN ('open', 'closed')),
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_presentation_sessions_project_status_expires_at
      ON presentation_sessions (project_id, status, expires_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_presentation_sessions_project_status_expires_at
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS presentation_sessions`);
  }
}
