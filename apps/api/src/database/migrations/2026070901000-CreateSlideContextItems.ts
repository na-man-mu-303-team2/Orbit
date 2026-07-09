import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateSlideContextItems2026070901000 implements MigrationInterface {
  name = "CreateSlideContextItems2026070901000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS slide_context_items (
        item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
        deck_id text NOT NULL,
        slide_id text NOT NULL,
        item_order integer NOT NULL DEFAULT 0,
        label text NOT NULL,
        sentence text NOT NULL,
        embedding vector(384),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_slide_context_items_project_deck_slide
      ON slide_context_items (project_id, deck_id, slide_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_slide_context_items_project_deck
      ON slide_context_items (project_id, deck_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_slide_context_items_project_deck`
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_slide_context_items_project_deck_slide`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS slide_context_items`);
  }
}
