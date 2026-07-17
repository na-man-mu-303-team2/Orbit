import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateSlidePracticeAudioAnalyses2026071703000 implements MigrationInterface {
  name = "CreateSlidePracticeAudioAnalyses2026071703000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE slide_practice_audio_analyses (
        analysis_id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
        created_by text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        client_request_id text NOT NULL,
        practice_session_id text NOT NULL,
        deck_id text NOT NULL,
        deck_version integer NOT NULL CHECK (deck_version > 0),
        slide_id text NOT NULL,
        slide_order integer NOT NULL CHECK (slide_order >= 0),
        started_at timestamptz NOT NULL,
        duration_ms integer CHECK (duration_ms BETWEEN 1 AND 300000),
        device_id_hash text,
        status text NOT NULL CHECK (status IN ('uploading','queued','processing','succeeded','failed','cancelled')),
        audio_file_id text NOT NULL,
        analysis_job_id text REFERENCES jobs(job_id) ON DELETE SET NULL,
        report_id text,
        error_code text CHECK (error_code IN ('TRANSCRIPTION_FAILED','AUDIO_ANALYSIS_FAILED','REPORT_PERSIST_FAILED')),
        cleanup_state text NOT NULL CHECK (cleanup_state IN ('pending','deleted','not-required')),
        raw_audio_deleted_at timestamptz,
        raw_audio_delete_deadline_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        completed_at timestamptz,
        CONSTRAINT uq_slide_practice_analysis_client UNIQUE (project_id, created_by, client_request_id),
        CONSTRAINT uq_slide_practice_analysis_project UNIQUE (project_id, analysis_id),
        CONSTRAINT fk_slide_practice_analysis_deck FOREIGN KEY (project_id, deck_id)
          REFERENCES decks(project_id, deck_id) ON DELETE RESTRICT,
        CONSTRAINT fk_slide_practice_analysis_audio FOREIGN KEY (project_id, audio_file_id)
          REFERENCES project_assets(project_id, file_id) ON DELETE RESTRICT,
        CONSTRAINT fk_slide_practice_analysis_report FOREIGN KEY (project_id, report_id)
          REFERENCES slide_practice_reports(project_id, report_id) ON DELETE SET NULL (report_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_slide_practice_analysis_status
      ON slide_practice_audio_analyses (status, updated_at)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_slide_practice_analysis_audio_expiry
      ON slide_practice_audio_analyses (raw_audio_delete_deadline_at)
      WHERE raw_audio_deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_slide_practice_analysis_expiry
      ON slide_practice_audio_analyses (expires_at)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_slide_practice_analysis_expiry`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_slide_practice_analysis_audio_expiry`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_slide_practice_analysis_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS slide_practice_audio_analyses`);
  }
}
