import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveSlideBaselines2026070804000 implements MigrationInterface {
  name = "RemoveSlideBaselines2026070804000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE rehearsal_runs DROP COLUMN IF EXISTS slide_baselines`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE rehearsal_runs ADD COLUMN IF NOT EXISTS slide_baselines jsonb`);
  }
}
