import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateProjectMembers2026063001000 implements MigrationInterface {
  name = "CreateProjectMembers2026063001000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS project_members (
        project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
        user_id text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
        status text NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (project_id, user_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_project_members_user_status
      ON project_members (user_id, status)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_project_members_project_status
      ON project_members (project_id, status)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_project_members_project_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_project_members_user_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS project_members`);
  }
}
