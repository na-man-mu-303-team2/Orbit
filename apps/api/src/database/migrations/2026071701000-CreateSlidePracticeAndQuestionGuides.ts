import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateSlidePracticeAndQuestionGuides2026071701000 implements MigrationInterface {
  name = "CreateSlidePracticeAndQuestionGuides2026071701000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE slide_practice_reports (
        report_id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
        created_by text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        client_request_id text NOT NULL,
        deck_id text NOT NULL,
        deck_version integer NOT NULL CHECK (deck_version > 0),
        slide_id text NOT NULL,
        slide_order integer NOT NULL CHECK (slide_order >= 0),
        metric_definition_version integer NOT NULL CHECK (metric_definition_version > 0),
        classifier_version integer NOT NULL CHECK (classifier_version > 0),
        report_json jsonb NOT NULL CHECK (jsonb_typeof(report_json) = 'object'),
        created_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        CONSTRAINT uq_slide_practice_client UNIQUE (project_id, created_by, client_request_id),
        CONSTRAINT uq_slide_practice_project_report UNIQUE (project_id, report_id),
        CONSTRAINT fk_slide_practice_deck FOREIGN KEY (project_id, deck_id)
          REFERENCES decks(project_id, deck_id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_slide_practice_history
      ON slide_practice_reports (project_id, created_by, deck_id, slide_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_slide_practice_expiry
      ON slide_practice_reports (expires_at)
    `);

    await queryRunner.query(`
      CREATE TABLE user_voice_baselines (
        user_id text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        device_id_hash text NOT NULL,
        baseline_version integer NOT NULL CHECK (baseline_version > 0),
        sample_count integer NOT NULL CHECK (sample_count > 0),
        metrics_json jsonb NOT NULL CHECK (jsonb_typeof(metrics_json) = 'object'),
        updated_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        PRIMARY KEY (user_id, device_id_hash)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_user_voice_baseline_expiry
      ON user_voice_baselines (expires_at)
    `);

    await queryRunner.query(`
      CREATE TABLE slide_question_guides (
        guide_id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
        deck_id text NOT NULL,
        deck_version integer NOT NULL CHECK (deck_version > 0),
        slide_id text NOT NULL,
        slide_content_hash text NOT NULL CHECK (slide_content_hash ~ '^[a-f0-9]{64}$'),
        source_snapshot_json jsonb NOT NULL CHECK (jsonb_typeof(source_snapshot_json) = 'object'),
        client_request_id text NOT NULL,
        status text NOT NULL CHECK (status IN ('queued','running','succeeded','failed')),
        generation_job_id text REFERENCES jobs(job_id) ON DELETE SET NULL,
        created_by text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        question_count integer NOT NULL CHECK (question_count = 3),
        schema_version integer NOT NULL CHECK (schema_version = 1),
        prompt_version text NOT NULL,
        model text,
        error_code text,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        generated_at timestamptz,
        CONSTRAINT uq_slide_question_guide_client UNIQUE (project_id, created_by, client_request_id),
        CONSTRAINT uq_slide_question_guide_project UNIQUE (project_id, guide_id),
        CONSTRAINT fk_slide_question_guide_deck FOREIGN KEY (project_id, deck_id)
          REFERENCES decks(project_id, deck_id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_slide_question_guide_lookup
      ON slide_question_guides (project_id, deck_id, slide_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_slide_question_guide_current_source
      ON slide_question_guides (
        project_id, created_by, deck_id, deck_version, slide_id,
        slide_content_hash, prompt_version
      )
      WHERE status = 'succeeded'
    `);

    await queryRunner.query(`
      CREATE TABLE slide_question_guide_items (
        guide_id text NOT NULL,
        project_id text NOT NULL,
        question_id text NOT NULL,
        question_order integer NOT NULL CHECK (question_order BETWEEN 1 AND 3),
        item_json jsonb NOT NULL CHECK (jsonb_typeof(item_json) = 'object'),
        created_at timestamptz NOT NULL,
        PRIMARY KEY (guide_id, question_id),
        CONSTRAINT uq_slide_question_guide_item_order UNIQUE (guide_id, question_order),
        CONSTRAINT fk_slide_question_guide_item_parent FOREIGN KEY (project_id, guide_id)
          REFERENCES slide_question_guides(project_id, guide_id) ON DELETE CASCADE
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS slide_question_guide_items`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_slide_question_guide_current_source`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_slide_question_guide_lookup`);
    await queryRunner.query(`DROP TABLE IF EXISTS slide_question_guides`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_user_voice_baseline_expiry`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_voice_baselines`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_slide_practice_expiry`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_slide_practice_history`);
    await queryRunner.query(`DROP TABLE IF EXISTS slide_practice_reports`);
  }
}
