import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProjectTags2026072102000 implements MigrationInterface {
  name = "AddProjectTags2026072102000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE projects
      ADD COLUMN tags text[] NOT NULL DEFAULT '{}'::text[],
      ADD CONSTRAINT projects_tags_count_check CHECK (cardinality(tags) <= 12)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE projects
      DROP CONSTRAINT projects_tags_count_check,
      DROP COLUMN tags
    `);
  }
}
