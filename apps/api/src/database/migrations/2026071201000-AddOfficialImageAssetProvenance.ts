import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOfficialImageAssetProvenance2026071201000
  implements MigrationInterface
{
  name = "AddOfficialImageAssetProvenance2026071201000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE project_assets
      ADD COLUMN IF NOT EXISTS source_asset_url text,
      ADD COLUMN IF NOT EXISTS source_authority text,
      ADD COLUMN IF NOT EXISTS usage_basis text
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE project_assets
      DROP COLUMN IF EXISTS usage_basis,
      DROP COLUMN IF EXISTS source_authority,
      DROP COLUMN IF EXISTS source_asset_url
    `);
  }
}
