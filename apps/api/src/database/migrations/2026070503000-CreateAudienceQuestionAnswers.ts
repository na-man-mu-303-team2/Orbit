import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAudienceQuestionAnswers2026070503000
  implements MigrationInterface
{
  name = "CreateAudienceQuestionAnswers2026070503000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE presentation_sessions
      ADD COLUMN IF NOT EXISTS selected_reference_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audience_question_answers (
        question_id text PRIMARY KEY REFERENCES audience_questions(question_id)
          ON DELETE CASCADE,
        session_id text NOT NULL REFERENCES presentation_sessions(session_id)
          ON DELETE CASCADE,
        audience_id text NOT NULL REFERENCES audience_participants(audience_id)
          ON DELETE CASCADE,
        answer_text text,
        source_references_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        confidence numeric,
        failure_reason text CHECK (
          failure_reason IN ('low-confidence', 'no-grounding', 'timeout', 'worker-error')
        ),
        feedback text CHECK (feedback IN ('resolved', 'unresolved')),
        escalated_to_presenter boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audience_question_answers_session
      ON audience_question_answers (session_id, created_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_audience_question_answers_session
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS audience_question_answers`);
    await queryRunner.query(`
      ALTER TABLE presentation_sessions
      DROP COLUMN IF EXISTS selected_reference_ids_json
    `);
  }
}
