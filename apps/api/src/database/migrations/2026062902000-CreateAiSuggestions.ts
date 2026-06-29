import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAiSuggestions2026062902000 implements MigrationInterface {
  name = "CreateAiSuggestions2026062902000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ai_suggestions (
        suggestion_id text PRIMARY KEY,
        project_id text NOT NULL,
        deck_id text NOT NULL,
        slide_id text NOT NULL,
        base_version integer NOT NULL CHECK (base_version > 0),
        title text NOT NULL,
        summary text,
        patch jsonb NOT NULL,
        status text NOT NULL CHECK (status IN ('pending', 'applied', 'rejected')),
        applied_change_id text,
        rejected_reason text,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        CONSTRAINT fk_ai_suggestions_project
          FOREIGN KEY (project_id)
          REFERENCES projects (project_id)
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_suggestions_project_deck_slide_status
      ON ai_suggestions (project_id, deck_id, slide_id, status)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_ai_suggestions_project_deck_slide_status`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS ai_suggestions`);
  }
}
