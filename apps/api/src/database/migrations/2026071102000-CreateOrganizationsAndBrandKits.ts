import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateOrganizationsAndBrandKits2026071102000
  implements MigrationInterface
{
  name = "CreateOrganizationsAndBrandKits2026071102000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        organization_id text PRIMARY KEY,
        name text NOT NULL,
        created_by text NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organization_members (
        organization_id text NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
        user_id text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        role text NOT NULL CHECK (role IN ('admin', 'member')),
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (organization_id, user_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_organization_members_user
      ON organization_members (user_id)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS brand_kits (
        brand_kit_id text PRIMARY KEY,
        organization_id text NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
        name text NOT NULL,
        version integer NOT NULL CHECK (version > 0),
        values_json jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_kits_organization_name
      ON brand_kits (organization_id, lower(name))
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_brand_kits_organization_updated
      ON brand_kits (organization_id, updated_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_brand_kits_organization_updated`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_brand_kits_organization_name`);
    await queryRunner.query(`DROP TABLE IF EXISTS brand_kits`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_organization_members_user`);
    await queryRunner.query(`DROP TABLE IF EXISTS organization_members`);
    await queryRunner.query(`DROP TABLE IF EXISTS organizations`);
  }
}
