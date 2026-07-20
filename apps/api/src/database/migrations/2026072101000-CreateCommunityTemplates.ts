import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCommunityTemplates2026072101000
  implements MigrationInterface
{
  name = "CreateCommunityTemplates2026072101000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS community_templates (
        template_id text PRIMARY KEY
          CHECK (left(template_id, 19) = 'community_template_'),
        owner_user_id text REFERENCES users(user_id) ON DELETE SET NULL,
        source_project_id text REFERENCES projects(project_id) ON DELETE SET NULL,
        source_deck_id text NOT NULL,
        source_deck_version integer NOT NULL CHECK (source_deck_version > 0),
        title text NOT NULL
          CHECK (char_length(btrim(title)) BETWEEN 1 AND 60),
        category text NOT NULL
          CHECK (category IN ('business', 'education', 'portfolio', 'event')),
        snapshot_json jsonb NOT NULL,
        preview_json jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_community_templates_created
      ON community_templates (created_at DESC, template_id DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_community_templates_category_created
      ON community_templates (category, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_community_templates_title_lower
      ON community_templates (lower(title))
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS community_template_usages (
        template_id text NOT NULL
          REFERENCES community_templates(template_id) ON DELETE CASCADE,
        user_id text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        last_used_at timestamptz NOT NULL,
        use_count integer NOT NULL CHECK (use_count > 0),
        last_project_id text REFERENCES projects(project_id) ON DELETE SET NULL,
        PRIMARY KEY (template_id, user_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_community_template_usages_user_recent
      ON community_template_usages (user_id, last_used_at DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS community_template_use_requests (
        user_id text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        client_request_id uuid NOT NULL,
        template_id text NOT NULL
          REFERENCES community_templates(template_id) ON DELETE CASCADE,
        project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, client_request_id)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS community_template_use_requests`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_community_template_usages_user_recent`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS community_template_usages`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_community_templates_title_lower`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_community_templates_category_created`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_community_templates_created`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS community_templates`);
  }
}
