import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateJobs2026062700200 implements MigrationInterface {
  name = "CreateJobs2026062700200";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        job_id text PRIMARY KEY,
        project_id text NOT NULL,
        type text NOT NULL,
        status text NOT NULL,
        progress integer NOT NULL DEFAULT 0,
        message text NOT NULL DEFAULT '',
        payload jsonb,
        result jsonb,
        error jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS jobs_project_status_idx
      ON jobs (project_id, status)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS jobs_type_status_idx
      ON jobs (type, status)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS jobs_type_status_idx`);
    await queryRunner.query(`DROP INDEX IF EXISTS jobs_project_status_idx`);
    await queryRunner.query(`DROP TABLE IF EXISTS jobs`);
  }
}
