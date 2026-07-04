import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAudienceInteractions2026070501000
  implements MigrationInterface
{
  name = "CreateAudienceInteractions2026070501000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS project_interaction_library (
        library_interaction_id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
        title text NOT NULL,
        kind text NOT NULL CHECK (kind IN ('poll', 'quiz')),
        questions_json jsonb NOT NULL,
        result_visibility text NOT NULL CHECK (
          result_visibility IN ('hidden', 'manual', 'after-close', 'live')
        ),
        quiz_scoring text NOT NULL CHECK (
          quiz_scoring IN ('none', 'correct-count', 'speed-bonus')
        ),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS session_interactions (
        interaction_id text PRIMARY KEY,
        session_id text NOT NULL REFERENCES presentation_sessions(session_id)
          ON DELETE CASCADE,
        library_interaction_id text REFERENCES project_interaction_library(
          library_interaction_id
        ) ON DELETE SET NULL,
        kind text NOT NULL CHECK (kind IN ('poll', 'quiz')),
        title text NOT NULL,
        questions_json jsonb NOT NULL,
        result_visibility text NOT NULL CHECK (
          result_visibility IN ('hidden', 'manual', 'after-close', 'live')
        ),
        quiz_scoring text NOT NULL CHECK (
          quiz_scoring IN ('none', 'correct-count', 'speed-bonus')
        ),
        source text NOT NULL CHECK (source IN ('library', 'ad-hoc')),
        display_order integer NOT NULL CHECK (display_order >= 0),
        activated_at timestamptz,
        closed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_session_interactions_one_active
      ON session_interactions (session_id)
      WHERE activated_at IS NOT NULL AND closed_at IS NULL
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS interaction_responses (
        response_id text PRIMARY KEY,
        interaction_id text NOT NULL REFERENCES session_interactions(
          interaction_id
        ) ON DELETE CASCADE,
        session_id text NOT NULL REFERENCES presentation_sessions(session_id)
          ON DELETE CASCADE,
        audience_id text NOT NULL REFERENCES audience_participants(audience_id)
          ON DELETE CASCADE,
        question_id text NOT NULL,
        answer_json jsonb NOT NULL,
        is_correct boolean,
        score numeric NOT NULL DEFAULT 0,
        submitted_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (interaction_id, audience_id, question_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_project_interaction_library_project
      ON project_interaction_library (project_id, updated_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_session_interactions_session_order
      ON session_interactions (session_id, display_order)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_interaction_responses_interaction
      ON interaction_responses (interaction_id, submitted_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_interaction_responses_interaction
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_session_interactions_session_order
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_project_interaction_library_project
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_session_interactions_one_active
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS interaction_responses`);
    await queryRunner.query(`DROP TABLE IF EXISTS session_interactions`);
    await queryRunner.query(`DROP TABLE IF EXISTS project_interaction_library`);
  }
}
