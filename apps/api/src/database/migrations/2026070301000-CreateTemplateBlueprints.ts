import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateTemplateBlueprints2026070301000
  implements MigrationInterface
{
  name = "CreateTemplateBlueprints2026070301000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS template_blueprints (
        template_id text PRIMARY KEY,
        project_id text NOT NULL,
        deck_id text NOT NULL,
        source_file_id text NOT NULL,
        blueprint_json jsonb NOT NULL,
        quality_report_json jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_template_blueprints_project_created_at
      ON template_blueprints (project_id, created_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_template_blueprints_project_created_at`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS template_blueprints`);
  }
}
