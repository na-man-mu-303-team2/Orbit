import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateProjectMembers2026062902000 implements MigrationInterface {
  name = "CreateProjectMembers2026062902000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS project_members (
        project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
        user_id text NOT NULL,
        role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
        status text NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (project_id, user_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_project_members_user_project
      ON project_members (user_id, project_id)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_project_members_unique_accepted_owner
      ON project_members (project_id)
      WHERE role = 'owner' AND status = 'accepted'
    `);
    await queryRunner.query(`
      INSERT INTO project_members (project_id, user_id, role, status, created_at)
      SELECT project_id, created_by, 'owner', 'accepted', created_at
      FROM projects
      ON CONFLICT (project_id, user_id) DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_project_members_user_project
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_project_members_unique_accepted_owner
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS project_members`);
  }
}
