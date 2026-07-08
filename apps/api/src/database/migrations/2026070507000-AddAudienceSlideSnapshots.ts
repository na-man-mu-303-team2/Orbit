import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAudienceSlideSnapshots2026070507000
  implements MigrationInterface
{
  name = "AddAudienceSlideSnapshots2026070507000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE presentation_sessions
      ADD COLUMN IF NOT EXISTS audience_slide_snapshots_json jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE presentation_sessions
      DROP COLUMN IF EXISTS audience_slide_snapshots_json
    `);
  }
}
