import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddCommunityCategoriesAndTags2026072107000
  implements MigrationInterface
{
  name = "AddCommunityCategoriesAndTags2026072107000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE community_categories (
        category_id text PRIMARY KEY,
        name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 30),
        sort_order integer NOT NULL UNIQUE CHECK (sort_order > 0),
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_community_categories_normalized_name
      ON community_categories (lower(btrim(name)))
    `);
    await queryRunner.query(`
      INSERT INTO community_categories (category_id, name, sort_order)
      VALUES
        ('business', '비즈니스', 1),
        ('education', '교육', 2),
        ('design', '디자인', 3),
        ('technology', '기술', 4),
        ('marketing', '마케팅', 5),
        ('data-research', '데이터·리서치', 6),
        ('portfolio', '포트폴리오', 7),
        ('career', '커리어', 8),
        ('event', '행사', 9),
        ('culture-lifestyle', '문화·라이프', 10),
        ('other', '기타', 11)
    `);
    await queryRunner.query(`
      ALTER TABLE community_templates
      DROP CONSTRAINT IF EXISTS community_templates_category_check
    `);
    await queryRunner.query(`
      ALTER TABLE community_templates RENAME COLUMN category TO category_id
    `);
    await queryRunner.query(`
      ALTER TABLE community_templates
      ADD CONSTRAINT fk_community_templates_category
      FOREIGN KEY (category_id) REFERENCES community_categories(category_id)
    `);
    await queryRunner.query(`
      CREATE TABLE community_tags (
        tag_id text PRIMARY KEY CHECK (left(tag_id, 14) = 'community_tag_'),
        name text NOT NULL CHECK (
          char_length(btrim(name)) BETWEEN 1 AND 30
          AND name !~ '[[:cntrl:]]'
        ),
        created_by_user_id text REFERENCES users(user_id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_community_tags_normalized_name
      ON community_tags (lower(btrim(name)))
    `);
    await queryRunner.query(`
      CREATE TABLE community_template_tags (
        template_id text NOT NULL
          REFERENCES community_templates(template_id) ON DELETE CASCADE,
        tag_id text NOT NULL REFERENCES community_tags(tag_id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (template_id, tag_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_community_template_tags_tag
      ON community_template_tags (tag_id, template_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_community_template_tags_tag`);
    await queryRunner.query(`DROP TABLE IF EXISTS community_template_tags`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_community_tags_normalized_name`);
    await queryRunner.query(`DROP TABLE IF EXISTS community_tags`);
    await queryRunner.query(`ALTER TABLE community_templates DROP CONSTRAINT IF EXISTS fk_community_templates_category`);
    await queryRunner.query(`
      UPDATE community_templates
      SET category_id = CASE
        WHEN category_id IN ('education', 'career') THEN 'education'
        WHEN category_id IN ('portfolio', 'design') THEN 'portfolio'
        WHEN category_id IN ('event', 'culture-lifestyle') THEN 'event'
        ELSE 'business'
      END
    `);
    await queryRunner.query(`ALTER TABLE community_templates RENAME COLUMN category_id TO category`);
    await queryRunner.query(`
      ALTER TABLE community_templates
      ADD CONSTRAINT community_templates_category_check
      CHECK (category IN ('business', 'education', 'portfolio', 'event'))
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_community_categories_normalized_name`);
    await queryRunner.query(`DROP TABLE IF EXISTS community_categories`);
  }
}
