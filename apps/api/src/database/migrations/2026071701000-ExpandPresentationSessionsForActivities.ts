import { MigrationInterface, QueryRunner } from "typeorm";

export class ExpandPresentationSessionsForActivities2026071701000
  implements MigrationInterface
{
  name = "ExpandPresentationSessionsForActivities2026071701000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_presentation_sessions_one_open_per_project
    `);
    await queryRunner.query(`
      ALTER TABLE presentation_sessions
        DROP CONSTRAINT IF EXISTS presentation_sessions_status_check,
        ALTER COLUMN session_password_hash DROP NOT NULL,
        ADD COLUMN deck_id text,
        ADD COLUMN deck_version integer,
        ADD COLUMN presenter_user_id text,
        ADD COLUMN created_by text,
        ADD COLUMN access_mode text NOT NULL DEFAULT 'passcode',
        ADD COLUMN starts_at timestamptz,
        ADD COLUMN updated_at timestamptz,
        ADD COLUMN started_at timestamptz,
        ADD COLUMN ended_at timestamptz,
        ADD COLUMN closed_at timestamptz,
        ADD COLUMN active_activity_run_id text,
        ADD COLUMN raw_responses_delete_after timestamptz,
        ADD COLUMN raw_responses_deleted_at timestamptz,
        ADD COLUMN results_deleted_at timestamptz
    `);
    await queryRunner.query(`
      UPDATE presentation_sessions AS sessions
      SET
        deck_id = decks.deck_id,
        deck_version = decks.version,
        presenter_user_id = projects.created_by,
        created_by = projects.created_by,
        starts_at = sessions.created_at,
        updated_at = sessions.created_at,
        started_at = CASE WHEN sessions.status = 'open' THEN sessions.created_at END,
        ended_at = CASE WHEN sessions.status = 'closed' THEN sessions.created_at END,
        closed_at = CASE WHEN sessions.status = 'closed' THEN sessions.created_at END
      FROM projects
      LEFT JOIN decks ON decks.project_id = projects.project_id
      WHERE projects.project_id = sessions.project_id
    `);
    await queryRunner.query(`
      UPDATE presentation_sessions
      SET
        status = CASE
          WHEN status = 'open' AND deck_id IS NOT NULL THEN 'live'
          ELSE 'ended'
        END,
        ended_at = CASE
          WHEN status = 'open' AND deck_id IS NOT NULL THEN ended_at
          ELSE COALESCE(ended_at, created_at)
        END,
        closed_at = CASE
          WHEN status = 'open' AND deck_id IS NOT NULL THEN closed_at
          ELSE COALESCE(closed_at, created_at)
        END,
        raw_responses_delete_after = CASE
          WHEN status = 'open' AND deck_id IS NOT NULL THEN NULL
          ELSE COALESCE(ended_at, expires_at) + interval '90 days'
        END
    `);
    await queryRunner.query(`
      ALTER TABLE presentation_sessions
        ALTER COLUMN starts_at SET NOT NULL,
        ALTER COLUMN updated_at SET NOT NULL,
        ADD CONSTRAINT chk_presentation_sessions_status
          CHECK (status IN ('draft', 'live', 'ended')),
        ADD CONSTRAINT chk_presentation_sessions_active_deck
          CHECK (status = 'ended' OR (deck_id IS NOT NULL AND deck_version IS NOT NULL)),
        ADD CONSTRAINT chk_presentation_sessions_deck_version
          CHECK (deck_version IS NULL OR deck_version > 0),
        ADD CONSTRAINT chk_presentation_sessions_access_mode
          CHECK (access_mode IN ('passcode', 'public')),
        ADD CONSTRAINT chk_presentation_sessions_access_secret
          CHECK (
            (access_mode = 'passcode' AND session_password_hash IS NOT NULL)
            OR (access_mode = 'public' AND session_password_hash IS NULL)
          ),
        ADD CONSTRAINT chk_presentation_sessions_access_window
          CHECK (
            expires_at > starts_at
            AND expires_at <= starts_at + interval '30 days'
          ),
        ADD CONSTRAINT uq_presentation_sessions_project_session
          UNIQUE (project_id, session_id)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_presentation_sessions_one_active_per_project
      ON presentation_sessions (project_id)
      WHERE status IN ('draft', 'live')
    `);
    await queryRunner.query(`
      CREATE INDEX idx_presentation_sessions_project_deck_created
      ON presentation_sessions (project_id, deck_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_presentation_sessions_retention_due
      ON presentation_sessions (raw_responses_delete_after)
      WHERE raw_responses_deleted_at IS NULL
        AND raw_responses_delete_after IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_presentation_sessions_retention_due`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_presentation_sessions_project_deck_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_presentation_sessions_one_active_per_project`);
    await queryRunner.query(`
      ALTER TABLE presentation_sessions
        DROP CONSTRAINT IF EXISTS uq_presentation_sessions_project_session,
        DROP CONSTRAINT IF EXISTS chk_presentation_sessions_access_window,
        DROP CONSTRAINT IF EXISTS chk_presentation_sessions_access_secret,
        DROP CONSTRAINT IF EXISTS chk_presentation_sessions_access_mode,
        DROP CONSTRAINT IF EXISTS chk_presentation_sessions_deck_version,
        DROP CONSTRAINT IF EXISTS chk_presentation_sessions_active_deck,
        DROP CONSTRAINT IF EXISTS chk_presentation_sessions_status
    `);
    await queryRunner.query(`
      UPDATE presentation_sessions
      SET
        status = CASE WHEN status IN ('draft', 'live') THEN 'open' ELSE 'closed' END,
        session_password_hash = COALESCE(session_password_hash, 'disabled')
    `);
    await queryRunner.query(`
      ALTER TABLE presentation_sessions
        ALTER COLUMN session_password_hash SET NOT NULL,
        ADD CONSTRAINT presentation_sessions_status_check
          CHECK (status IN ('open', 'closed')),
        DROP COLUMN IF EXISTS results_deleted_at,
        DROP COLUMN IF EXISTS raw_responses_deleted_at,
        DROP COLUMN IF EXISTS raw_responses_delete_after,
        DROP COLUMN IF EXISTS active_activity_run_id,
        DROP COLUMN IF EXISTS closed_at,
        DROP COLUMN IF EXISTS ended_at,
        DROP COLUMN IF EXISTS started_at,
        DROP COLUMN IF EXISTS updated_at,
        DROP COLUMN IF EXISTS starts_at,
        DROP COLUMN IF EXISTS access_mode,
        DROP COLUMN IF EXISTS created_by,
        DROP COLUMN IF EXISTS presenter_user_id,
        DROP COLUMN IF EXISTS deck_version,
        DROP COLUMN IF EXISTS deck_id
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_presentation_sessions_one_open_per_project
      ON presentation_sessions (project_id)
      WHERE status = 'open'
    `);
  }
}
