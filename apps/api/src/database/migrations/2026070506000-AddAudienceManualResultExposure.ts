import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAudienceManualResultExposure2026070506000
  implements MigrationInterface
{
  name = "AddAudienceManualResultExposure2026070506000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE session_interactions
      ADD COLUMN IF NOT EXISTS exposed_result_question_ids jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE session_interactions
      DROP COLUMN IF EXISTS exposed_result_question_ids
    `);
  }
}
