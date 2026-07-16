import { MigrationInterface, QueryRunner } from "typeorm";

export class AddImageAssetProvenance2026071103000 implements MigrationInterface {
  name = "AddImageAssetProvenance2026071103000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE project_assets
      ADD COLUMN IF NOT EXISTS source_url text,
      ADD COLUMN IF NOT EXISTS author text,
      ADD COLUMN IF NOT EXISTS license text,
      ADD COLUMN IF NOT EXISTS license_checked_at timestamptz,
      ADD COLUMN IF NOT EXISTS asset_provider text,
      ADD COLUMN IF NOT EXISTS generation_prompt text,
      ADD COLUMN IF NOT EXISTS generated_for_user_id text,
      ADD COLUMN IF NOT EXISTS generated_for_organization_id text
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE project_assets
      DROP COLUMN IF EXISTS generation_prompt,
      DROP COLUMN IF EXISTS generated_for_organization_id,
      DROP COLUMN IF EXISTS generated_for_user_id,
      DROP COLUMN IF EXISTS asset_provider,
      DROP COLUMN IF EXISTS license_checked_at,
      DROP COLUMN IF EXISTS license,
      DROP COLUMN IF EXISTS author,
      DROP COLUMN IF EXISTS source_url
    `);
  }
}
