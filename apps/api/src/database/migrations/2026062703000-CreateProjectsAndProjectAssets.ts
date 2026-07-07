import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateProjectsAndProjectAssets2026062703000 implements MigrationInterface {
  name = "CreateProjectsAndProjectAssets2026062703000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS projects (
        project_id text PRIMARY KEY,
        workspace_id text NOT NULL,
        title text NOT NULL,
        created_by text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_workspace_created_at
      ON projects (workspace_id, created_at)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS project_assets (
        file_id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
        storage_key text NOT NULL,
        original_name text NOT NULL,
        mime_type text NOT NULL,
        size integer NOT NULL CHECK (size > 0),
        url text NOT NULL,
        purpose text NOT NULL,
        status text NOT NULL CHECK (status IN ('pending', 'uploaded')),
        created_at timestamptz NOT NULL DEFAULT now(),
        uploaded_at timestamptz
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_project_assets_project_status_created_at
      ON project_assets (project_id, status, created_at)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_project_assets_project_status_created_at
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS project_assets`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_projects_workspace_created_at`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS projects`);
  }
}
