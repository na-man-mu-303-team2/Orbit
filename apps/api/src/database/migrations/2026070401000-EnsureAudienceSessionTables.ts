import { MigrationInterface, QueryRunner } from "typeorm";

export class EnsureAudienceSessionTables2026070401000
  implements MigrationInterface
{
  name = "EnsureAudienceSessionTables2026070401000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audience_participants (
        audience_id text PRIMARY KEY,
        session_id text NOT NULL REFERENCES presentation_sessions(session_id)
          ON DELETE CASCADE,
        nickname text NOT NULL,
        token_hash text NOT NULL,
        joined_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        joined_before_end boolean NOT NULL DEFAULT false,
        UNIQUE (session_id, nickname)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audience_feature_settings (
        session_id text PRIMARY KEY REFERENCES presentation_sessions(session_id)
          ON DELETE CASCADE,
        qna_enabled boolean NOT NULL DEFAULT false,
        ai_qna_enabled boolean NOT NULL DEFAULT false,
        polls_enabled boolean NOT NULL DEFAULT false,
        quizzes_enabled boolean NOT NULL DEFAULT false,
        reactions_enabled boolean NOT NULL DEFAULT false,
        survey_enabled boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (qna_enabled OR NOT ai_qna_enabled)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audience_realtime_state (
        session_id text PRIMARY KEY REFERENCES presentation_sessions(session_id)
          ON DELETE CASCADE,
        slide_id text,
        slide_index integer CHECK (slide_index IS NULL OR slide_index >= 0),
        effect_state_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        active_interaction_id text,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audience_events (
        event_id text PRIMARY KEY,
        session_id text NOT NULL REFERENCES presentation_sessions(session_id)
          ON DELETE CASCADE,
        actor_type text NOT NULL CHECK (actor_type IN ('audience', 'presenter', 'system')),
        actor_id text,
        type text NOT NULL,
        payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        occurred_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audience_participants_session_last_seen_at
      ON audience_participants (session_id, last_seen_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audience_events_session_occurred_at
      ON audience_events (session_id, occurred_at DESC)
    `);
  }

  async down(): Promise<void> {
    return Promise.resolve();
  }
}
