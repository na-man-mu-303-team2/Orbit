import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddCommunityTemplateEngagement2026072105000
  implements MigrationInterface
{
  name = "AddCommunityTemplateEngagement2026072105000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE community_templates
      ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT ''
        CHECK (char_length(description) <= 500)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS community_template_likes (
        template_id text NOT NULL REFERENCES community_templates(template_id) ON DELETE CASCADE,
        user_id text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (template_id, user_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_community_template_likes_created
      ON community_template_likes (template_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS community_template_views (
        template_id text NOT NULL REFERENCES community_templates(template_id) ON DELETE CASCADE,
        user_id text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        viewed_on date NOT NULL DEFAULT CURRENT_DATE,
        viewed_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (template_id, user_id, viewed_on)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_community_template_views_recent
      ON community_template_views (template_id, viewed_at DESC)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS community_template_shares (
        share_id text PRIMARY KEY CHECK (left(share_id, 16) = 'community_share_'),
        template_id text NOT NULL REFERENCES community_templates(template_id) ON DELETE CASCADE,
        user_id text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_community_template_shares_created
      ON community_template_shares (template_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS community_template_comments (
        comment_id text PRIMARY KEY CHECK (left(comment_id, 18) = 'community_comment_'),
        template_id text NOT NULL REFERENCES community_templates(template_id) ON DELETE CASCADE,
        author_user_id text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        body text NOT NULL CHECK (
          char_length(btrim(body)) BETWEEN 1 AND 500
          AND body !~ '[[:cntrl:]]'
        ),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_community_template_comments_recent
      ON community_template_comments (template_id, created_at DESC, comment_id DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_community_template_comments_recent`);
    await queryRunner.query(`DROP TABLE IF EXISTS community_template_comments`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_community_template_shares_created`);
    await queryRunner.query(`DROP TABLE IF EXISTS community_template_shares`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_community_template_views_recent`);
    await queryRunner.query(`DROP TABLE IF EXISTS community_template_views`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_community_template_likes_created`);
    await queryRunner.query(`DROP TABLE IF EXISTS community_template_likes`);
    await queryRunner.query(`ALTER TABLE community_templates DROP COLUMN IF EXISTS description`);
  }
}
