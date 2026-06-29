import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateRehearsalRuns2026062901000 implements MigrationInterface {
  name = "CreateRehearsalRuns2026062901000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE project_assets
      ADD COLUMN IF NOT EXISTS deleted_at timestamptz
    `);
    await queryRunner.query(`
      DO $$
      DECLARE
        status_constraint text;
      BEGIN
        SELECT c.conname
        INTO status_constraint
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'project_assets'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) LIKE '%status%';

        IF status_constraint IS NOT NULL THEN
          EXECUTE format('ALTER TABLE project_assets DROP CONSTRAINT %I', status_constraint);
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE project_assets
      ADD CONSTRAINT project_assets_status_check
      CHECK (status IN ('pending', 'uploaded', 'deleted'))
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS rehearsal_runs (
        run_id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
        deck_id text NOT NULL,
        audio_file_id text REFERENCES project_assets(file_id) ON DELETE SET NULL,
        job_id text,
        status text NOT NULL CHECK (status IN ('created', 'uploading', 'processing', 'succeeded', 'failed')),
        error jsonb,
        raw_audio_deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_rehearsal_runs_project_created_at
      ON rehearsal_runs (project_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_rehearsal_runs_status
      ON rehearsal_runs (status)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_rehearsal_runs_status`);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_rehearsal_runs_project_created_at
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS rehearsal_runs`);
    await queryRunner.query(`
      ALTER TABLE project_assets
      DROP CONSTRAINT IF EXISTS project_assets_status_check
    `);
    await queryRunner.query(`
      UPDATE project_assets
      SET status = 'uploaded',
          deleted_at = NULL
      WHERE status = 'deleted'
    `);
    await queryRunner.query(`
      ALTER TABLE project_assets
      ADD CONSTRAINT project_assets_status_check
      CHECK (status IN ('pending', 'uploaded'))
    `);
    await queryRunner.query(`
      ALTER TABLE project_assets
      DROP COLUMN IF EXISTS deleted_at
    `);
  }
}
