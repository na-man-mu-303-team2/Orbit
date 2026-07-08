import { MigrationInterface, QueryRunner } from "typeorm";

export class RepairPresentationSessionsContract2026070601000
  implements MigrationInterface
{
  name = "RepairPresentationSessionsContract2026070601000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE presentation_sessions
      ADD COLUMN IF NOT EXISTS deck_id text
    `);
    await queryRunner.query(`
      ALTER TABLE presentation_sessions
      ADD COLUMN IF NOT EXISTS presenter_user_id text
    `);
    await queryRunner.query(`
      ALTER TABLE presentation_sessions
      ADD COLUMN IF NOT EXISTS join_code text
    `);
    await queryRunner.query(`
      ALTER TABLE presentation_sessions
      ADD COLUMN IF NOT EXISTS entry_status text
    `);
    await queryRunner.query(`
      ALTER TABLE presentation_sessions
      ADD COLUMN IF NOT EXISTS audience_slide_render_mode text
    `);
    await queryRunner.query(`
      ALTER TABLE presentation_sessions
      ADD COLUMN IF NOT EXISTS started_at timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE presentation_sessions
      ADD COLUMN IF NOT EXISTS ended_at timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE presentation_sessions
      ADD COLUMN IF NOT EXISTS survey_closes_at timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE presentation_sessions
      ADD COLUMN IF NOT EXISTS raw_data_delete_after timestamptz
    `);

    await queryRunner.query(`
      UPDATE presentation_sessions AS sessions
      SET deck_id = COALESCE(
        sessions.deck_id,
        decks.deck_id,
        'deck_' || regexp_replace(sessions.project_id, '[^a-zA-Z0-9_-]+', '_', 'g')
      )
      FROM projects
      LEFT JOIN decks ON decks.project_id = projects.project_id
      WHERE sessions.project_id = projects.project_id
        AND sessions.deck_id IS NULL
    `);
    await queryRunner.query(`
      UPDATE presentation_sessions AS sessions
      SET presenter_user_id = COALESCE(
        sessions.presenter_user_id,
        projects.created_by,
        (SELECT user_id FROM users ORDER BY created_at ASC LIMIT 1)
      )
      FROM projects
      WHERE sessions.project_id = projects.project_id
        AND sessions.presenter_user_id IS NULL
    `);
    await queryRunner.query(`
      WITH missing_join_codes AS (
        SELECT
          session_id,
          lpad(row_number() OVER (ORDER BY created_at, session_id)::text, 6, '0') AS generated_join_code
        FROM presentation_sessions
        WHERE join_code IS NULL
      )
      UPDATE presentation_sessions AS sessions
      SET join_code = missing_join_codes.generated_join_code
      FROM missing_join_codes
      WHERE sessions.session_id = missing_join_codes.session_id
    `);
    await queryRunner.query(`
      UPDATE presentation_sessions
      SET entry_status = CASE
        WHEN status = 'closed' THEN 'closed'
        WHEN entry_status IN ('open', 'closed') THEN entry_status
        ELSE 'open'
      END
      WHERE entry_status IS NULL
        OR entry_status NOT IN ('open', 'closed')
    `);
    await queryRunner.query(`
      ALTER TABLE presentation_sessions
      DROP CONSTRAINT IF EXISTS presentation_sessions_status_check
    `);
    await queryRunner.query(`
      UPDATE presentation_sessions
      SET status = CASE
        WHEN status = 'closed' THEN 'ended'
        WHEN status = 'live' THEN 'live'
        WHEN status = 'ended' THEN 'ended'
        ELSE 'draft'
      END
      WHERE status IS NULL
        OR status NOT IN ('draft', 'live', 'ended')
    `);
    await queryRunner.query(`
      UPDATE presentation_sessions
      SET audience_slide_render_mode = 'image-first'
      WHERE audience_slide_render_mode IS NULL
        OR audience_slide_render_mode <> 'image-first'
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'presentation_sessions'
            AND column_name = 'expires_at'
        ) THEN
          UPDATE presentation_sessions
          SET raw_data_delete_after = COALESCE(
            raw_data_delete_after,
            expires_at,
            created_at + interval '30 days'
          );
        ELSE
          UPDATE presentation_sessions
          SET raw_data_delete_after = COALESCE(
            raw_data_delete_after,
            created_at + interval '30 days'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_presentation_sessions_one_open_per_project
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_presentation_sessions_project_status_expires_at
    `);
    await queryRunner.query(`
      ALTER TABLE presentation_sessions
      DROP COLUMN IF EXISTS session_password_hash
    `);
    await queryRunner.query(`
      ALTER TABLE presentation_sessions
      DROP COLUMN IF EXISTS expires_at
    `);

    await queryRunner.query(`
      ALTER TABLE presentation_sessions
      ALTER COLUMN deck_id SET NOT NULL,
      ALTER COLUMN presenter_user_id SET NOT NULL,
      ALTER COLUMN join_code SET NOT NULL,
      ALTER COLUMN entry_status SET NOT NULL,
      ALTER COLUMN audience_slide_render_mode SET NOT NULL,
      ALTER COLUMN raw_data_delete_after SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE presentation_sessions
      ALTER COLUMN audience_slide_render_mode SET DEFAULT 'image-first'
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'presentation_sessions_presenter_user_id_fkey'
        ) THEN
          ALTER TABLE presentation_sessions
          ADD CONSTRAINT presentation_sessions_presenter_user_id_fkey
          FOREIGN KEY (presenter_user_id) REFERENCES users(user_id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'presentation_sessions_join_code_check'
        ) THEN
          ALTER TABLE presentation_sessions
          ADD CONSTRAINT presentation_sessions_join_code_check
          CHECK (join_code ~ '^[0-9]{6}$');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'presentation_sessions_status_check'
        ) THEN
          ALTER TABLE presentation_sessions
          ADD CONSTRAINT presentation_sessions_status_check
          CHECK (status IN ('draft', 'live', 'ended'));
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'presentation_sessions_entry_status_check'
        ) THEN
          ALTER TABLE presentation_sessions
          ADD CONSTRAINT presentation_sessions_entry_status_check
          CHECK (entry_status IN ('open', 'closed'));
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'presentation_sessions_audience_slide_render_mode_check'
        ) THEN
          ALTER TABLE presentation_sessions
          ADD CONSTRAINT presentation_sessions_audience_slide_render_mode_check
          CHECK (audience_slide_render_mode IN ('image-first'));
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_presentation_sessions_project_status_created_at
      ON presentation_sessions (project_id, status, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_presentation_sessions_active_join_code
      ON presentation_sessions (join_code)
      WHERE status IN ('draft', 'live')
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_presentation_sessions_one_active_per_project
      ON presentation_sessions (project_id)
      WHERE status IN ('draft', 'live')
    `);
  }

  async down(): Promise<void> {
    return Promise.resolve();
  }
}
