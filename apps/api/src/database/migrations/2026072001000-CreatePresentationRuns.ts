import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePresentationRuns2026072001000 implements MigrationInterface {
  name = "CreatePresentationRuns2026072001000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS presentation_runs (
        run_id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
        session_id text NOT NULL UNIQUE REFERENCES presentation_sessions(session_id) ON DELETE CASCADE,
        deck_id text NOT NULL,
        deck_version integer NOT NULL CHECK (deck_version > 0),
        deck_snapshot_json jsonb NOT NULL,
        recording_mode text NOT NULL CHECK (recording_mode IN ('microphone', 'none')),
        audio_file_id text REFERENCES project_assets(file_id) ON DELETE SET NULL,
        job_id text,
        status text NOT NULL CHECK (
          status IN ('created', 'uploading', 'processing', 'succeeded', 'failed', 'cancelled')
        ),
        error jsonb,
        voice_report_json jsonb,
        raw_audio_deleted_at timestamptz,
        raw_audio_delete_deadline_at timestamptz,
        started_at timestamptz NOT NULL,
        ended_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_presentation_runs_project_created_at
      ON presentation_runs (project_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_presentation_runs_status
      ON presentation_runs (status)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_presentation_runs_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_presentation_runs_project_created_at`);
    await queryRunner.query(`DROP TABLE IF EXISTS presentation_runs`);
  }
}
