import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateSessionSurveys2026070504000 implements MigrationInterface {
  name = "CreateSessionSurveys2026070504000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS session_survey_forms (
        survey_id text PRIMARY KEY,
        session_id text NOT NULL UNIQUE REFERENCES presentation_sessions(
          session_id
        ) ON DELETE CASCADE,
        title text NOT NULL,
        questions_json jsonb NOT NULL,
        contact_json jsonb NOT NULL,
        locked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS session_survey_responses (
        response_id text PRIMARY KEY,
        survey_id text NOT NULL REFERENCES session_survey_forms(survey_id)
          ON DELETE CASCADE,
        session_id text NOT NULL REFERENCES presentation_sessions(session_id)
          ON DELETE CASCADE,
        audience_id text NOT NULL REFERENCES audience_participants(audience_id)
          ON DELETE CASCADE,
        answers_json jsonb NOT NULL,
        contact_consent boolean NOT NULL,
        contact_answers_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        submitted_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (survey_id, audience_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_session_survey_responses_session
      ON session_survey_responses (session_id, submitted_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_session_survey_responses_session
    `);
    await queryRunner.query(
      `DROP TABLE IF EXISTS session_survey_responses`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS session_survey_forms`);
  }
}
