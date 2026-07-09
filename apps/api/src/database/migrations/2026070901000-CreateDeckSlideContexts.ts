import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateDeckSlideContexts2026070901000 implements MigrationInterface {
  name = "CreateDeckSlideContexts2026070901000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS deck_slide_contexts (
        project_id    text PRIMARY KEY REFERENCES projects(project_id) ON DELETE CASCADE,
        deck_id       text NOT NULL,
        contexts_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        updated_at    timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS deck_slide_contexts`);
  }
}
