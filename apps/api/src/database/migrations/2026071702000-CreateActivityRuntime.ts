import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateActivityRuntime2026071702000 implements MigrationInterface {
  name = "CreateActivityRuntime2026071702000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE activity_runs (
        activity_run_id text PRIMARY KEY,
        project_id text NOT NULL,
        session_id text NOT NULL,
        activity_id text NOT NULL,
        source_slide_id text NOT NULL,
        version integer NOT NULL CHECK (version > 0),
        supersedes_activity_run_id text,
        definition_snapshot jsonb NOT NULL,
        definition_fingerprint text NOT NULL,
        status text NOT NULL CHECK (status IN ('draft', 'open', 'closed', 'results')),
        revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
        is_current boolean NOT NULL DEFAULT true,
        response_count integer NOT NULL DEFAULT 0 CHECK (response_count >= 0),
        opened_at timestamptz,
        closed_at timestamptz,
        revealed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_activity_runs_project_run UNIQUE (project_id, activity_run_id),
        CONSTRAINT uq_activity_runs_session_activity_version UNIQUE (session_id, activity_id, version),
        CONSTRAINT fk_activity_runs_session FOREIGN KEY (project_id, session_id)
          REFERENCES presentation_sessions(project_id, session_id) ON DELETE CASCADE,
        CONSTRAINT fk_activity_runs_supersedes FOREIGN KEY (project_id, supersedes_activity_run_id)
          REFERENCES activity_runs(project_id, activity_run_id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_activity_runs_current
      ON activity_runs (session_id, activity_id)
      WHERE is_current
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_activity_runs_one_open_per_session
      ON activity_runs (session_id)
      WHERE status = 'open'
    `);
    await queryRunner.query(`
      CREATE INDEX idx_activity_runs_session_created
      ON activity_runs (project_id, session_id, created_at DESC)
    `);
    await queryRunner.query(`
      ALTER TABLE presentation_sessions
      ADD CONSTRAINT fk_presentation_sessions_active_activity_run
      FOREIGN KEY (project_id, active_activity_run_id)
      REFERENCES activity_runs(project_id, activity_run_id)
      ON DELETE SET NULL (active_activity_run_id)
      DEFERRABLE INITIALLY DEFERRED
    `);
    await queryRunner.query(`
      CREATE TABLE activity_responses (
        response_id text PRIMARY KEY,
        project_id text NOT NULL,
        activity_run_id text NOT NULL,
        audience_id text NOT NULL,
        answers_json jsonb NOT NULL,
        display_name text,
        last_client_mutation_id text NOT NULL,
        revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
        submitted_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_activity_responses_project_response UNIQUE (project_id, response_id),
        CONSTRAINT uq_activity_responses_run_audience UNIQUE (activity_run_id, audience_id),
        CONSTRAINT fk_activity_responses_run FOREIGN KEY (project_id, activity_run_id)
          REFERENCES activity_runs(project_id, activity_run_id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_activity_responses_run_updated
      ON activity_responses (project_id, activity_run_id, updated_at DESC)
    `);
    await queryRunner.query(`
      CREATE TABLE activity_text_entries (
        entry_id text PRIMARY KEY,
        project_id text NOT NULL,
        response_id text NOT NULL,
        question_id text NOT NULL,
        text_value text NOT NULL,
        moderation_status text NOT NULL DEFAULT 'pending'
          CHECK (moderation_status IN ('pending', 'approved', 'hidden')),
        answered_at timestamptz,
        revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_activity_text_entries_project_entry UNIQUE (project_id, entry_id),
        CONSTRAINT uq_activity_text_entries_response_question UNIQUE (response_id, question_id),
        CONSTRAINT fk_activity_text_entries_response FOREIGN KEY (project_id, response_id)
          REFERENCES activity_responses(project_id, response_id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_activity_text_entries_response_status
      ON activity_text_entries (project_id, response_id, moderation_status)
    `);
    await queryRunner.query(`
      CREATE TABLE activity_result_snapshots (
        snapshot_id text PRIMARY KEY,
        project_id text NOT NULL,
        session_id text NOT NULL,
        activity_run_id text NOT NULL,
        aggregate_json jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_activity_result_snapshots_run UNIQUE (activity_run_id),
        CONSTRAINT fk_activity_result_snapshots_session FOREIGN KEY (project_id, session_id)
          REFERENCES presentation_sessions(project_id, session_id) ON DELETE CASCADE,
        CONSTRAINT fk_activity_result_snapshots_run FOREIGN KEY (project_id, activity_run_id)
          REFERENCES activity_runs(project_id, activity_run_id) ON DELETE CASCADE
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE presentation_sessions
      DROP CONSTRAINT IF EXISTS fk_presentation_sessions_active_activity_run
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS activity_result_snapshots`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_activity_text_entries_response_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS activity_text_entries`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_activity_responses_run_updated`);
    await queryRunner.query(`DROP TABLE IF EXISTS activity_responses`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_activity_runs_session_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_activity_runs_one_open_per_session`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_activity_runs_current`);
    await queryRunner.query(`DROP TABLE IF EXISTS activity_runs`);
  }
}
