import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateFocusedPractice2026071104000 implements MigrationInterface {
  name = "CreateFocusedPractice2026071104000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE focused_practice_sessions (
        practice_session_id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
        deck_id text NOT NULL,
        source_full_run_id text NOT NULL,
        source_goal_set_id text NOT NULL,
        client_request_id text NOT NULL,
        goal_ids_json jsonb NOT NULL CHECK (jsonb_typeof(goal_ids_json) = 'array'),
        target_scope_json jsonb NOT NULL CHECK (jsonb_typeof(target_scope_json) = 'object'),
        snapshot_json jsonb NOT NULL CHECK (jsonb_typeof(snapshot_json) = 'object'),
        compatibility_state text NOT NULL CHECK (compatibility_state IN ('current','stale')),
        status text NOT NULL CHECK (status IN ('active','completed','cancelled')),
        data_origin text NOT NULL CHECK (data_origin IN ('live','fixture')),
        created_by text NOT NULL,
        created_at timestamptz NOT NULL,
        completed_at timestamptz,
        CONSTRAINT uq_focused_session_client UNIQUE (project_id, client_request_id),
        CONSTRAINT uq_focused_session_project_session UNIQUE (project_id, practice_session_id),
        CONSTRAINT fk_focused_session_run FOREIGN KEY (project_id, source_full_run_id)
          REFERENCES rehearsal_runs(project_id, run_id) ON DELETE CASCADE,
        CONSTRAINT fk_focused_session_goal_set FOREIGN KEY (project_id, source_goal_set_id)
          REFERENCES practice_goal_sets(project_id, goal_set_id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE TABLE focused_practice_attempts (
        attempt_id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
        practice_session_id text NOT NULL,
        client_request_id text NOT NULL,
        attempt_number integer NOT NULL CHECK (attempt_number > 0),
        status text NOT NULL CHECK (status IN ('created','uploading','queued','processing','succeeded','failed','cancelled')),
        result text CHECK (result IN ('passed','needs-retry','unmeasured')),
        audio_file_id text,
        analysis_job_id text,
        cleanup_state text NOT NULL CHECK (cleanup_state IN ('not-required','pending','deleted','exhausted')),
        cleanup_generation integer NOT NULL CHECK (cleanup_generation > 0),
        raw_audio_deleted_at timestamptz,
        raw_audio_delete_deadline_at timestamptz NOT NULL,
        duration_ms integer CHECK (duration_ms BETWEEN 1 AND 300000),
        slide_timeline_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        goal_outcomes_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        error_code text,
        created_at timestamptz NOT NULL,
        completed_at timestamptz,
        CONSTRAINT uq_focused_attempt_client UNIQUE (practice_session_id, client_request_id),
        CONSTRAINT uq_focused_attempt_number UNIQUE (practice_session_id, attempt_number),
        CONSTRAINT uq_focused_attempt_project_attempt UNIQUE (project_id, attempt_id),
        CONSTRAINT fk_focused_attempt_session FOREIGN KEY (project_id, practice_session_id)
          REFERENCES focused_practice_sessions(project_id, practice_session_id) ON DELETE CASCADE,
        CONSTRAINT fk_focused_attempt_audio FOREIGN KEY (project_id, audio_file_id)
          REFERENCES project_assets(project_id, file_id) ON DELETE RESTRICT,
        CONSTRAINT fk_focused_attempt_job FOREIGN KEY (analysis_job_id)
          REFERENCES jobs(job_id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_focused_attempt_non_terminal
      ON focused_practice_attempts (practice_session_id)
      WHERE status IN ('created','uploading','queued','processing')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_focused_attempt_non_terminal`);
    await queryRunner.query(`DROP TABLE IF EXISTS focused_practice_attempts`);
    await queryRunner.query(`DROP TABLE IF EXISTS focused_practice_sessions`);
  }
}
