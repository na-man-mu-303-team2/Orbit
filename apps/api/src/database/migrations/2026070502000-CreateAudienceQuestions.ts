import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAudienceQuestions2026070502000
  implements MigrationInterface
{
  name = "CreateAudienceQuestions2026070502000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audience_questions (
        question_id text PRIMARY KEY,
        question_group_id text NOT NULL,
        session_id text NOT NULL REFERENCES presentation_sessions(session_id)
          ON DELETE CASCADE,
        audience_id text NOT NULL REFERENCES audience_participants(audience_id)
          ON DELETE CASCADE,
        text text NOT NULL,
        status text NOT NULL CHECK (status IN ('pending', 'answered')),
        embedding_json jsonb,
        merge_target_question_id text,
        submitted_at timestamptz NOT NULL DEFAULT now(),
        answered_at timestamptz
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audience_questions_session_status
      ON audience_questions (session_id, status, submitted_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audience_questions_audience
      ON audience_questions (session_id, audience_id, submitted_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_audience_questions_audience
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_audience_questions_session_status
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS audience_questions`);
  }
}
