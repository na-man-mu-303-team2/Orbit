import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddCommunityTemplateGovernance2026072106000
  implements MigrationInterface
{
  name = "AddCommunityTemplateGovernance2026072106000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE community_templates
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
      ADD COLUMN IF NOT EXISTS deleted_by_user_id text REFERENCES users(user_id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS moderation_note text
        CHECK (moderation_note IS NULL OR char_length(moderation_note) <= 500)
    `);
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_community_moderator boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      WITH ranked AS (
        SELECT
          template_id,
          row_number() OVER (
            PARTITION BY source_project_id
            ORDER BY created_at DESC, template_id DESC
          ) AS duplicate_order
        FROM community_templates
        WHERE deleted_at IS NULL
      )
      UPDATE community_templates templates
      SET
        deleted_at = now(),
        updated_at = now(),
        moderation_note = '중복 공개 데이터 정리'
      FROM ranked
      WHERE templates.template_id = ranked.template_id
        AND ranked.duplicate_order > 1
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_community_templates_active_source
      ON community_templates (source_project_id)
      WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_community_templates_active_created
      ON community_templates (created_at DESC, template_id DESC)
      WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS community_template_reports (
        report_id text PRIMARY KEY CHECK (left(report_id, 17) = 'community_report_'),
        template_id text NOT NULL REFERENCES community_templates(template_id) ON DELETE CASCADE,
        reporter_user_id text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        reason text NOT NULL CHECK (reason IN ('copyright', 'spam', 'harassment', 'inappropriate', 'other')),
        details text NOT NULL DEFAULT '' CHECK (
          char_length(details) <= 500
          AND details !~ '[[:cntrl:]]'
        ),
        status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
        reviewed_by_user_id text REFERENCES users(user_id) ON DELETE SET NULL,
        resolution_note text CHECK (
          resolution_note IS NULL
          OR (
            char_length(resolution_note) <= 500
            AND resolution_note !~ '[[:cntrl:]]'
          )
        ),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (template_id, reporter_user_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_community_template_reports_status
      ON community_template_reports (status, created_at DESC, report_id DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_community_template_reports_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS community_template_reports`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_community_templates_active_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_community_templates_active_source`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS is_community_moderator`);
    await queryRunner.query(`
      ALTER TABLE community_templates
      DROP COLUMN IF EXISTS moderation_note,
      DROP COLUMN IF EXISTS deleted_by_user_id,
      DROP COLUMN IF EXISTS deleted_at,
      DROP COLUMN IF EXISTS updated_at
    `);
  }
}
