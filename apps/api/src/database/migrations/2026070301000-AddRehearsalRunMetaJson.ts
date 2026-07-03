import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRehearsalRunMetaJson2026070301000 implements MigrationInterface {
  name = "AddRehearsalRunMetaJson2026070301000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
      ADD COLUMN IF NOT EXISTS meta_json jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
      DROP COLUMN IF EXISTS meta_json
    `);
  }
}
