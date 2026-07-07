import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRehearsalReportColumns2026062903000 implements MigrationInterface {
  name = "AddRehearsalReportColumns2026062903000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
      ADD COLUMN IF NOT EXISTS report_json jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
      ADD COLUMN IF NOT EXISTS transcript_retained boolean NOT NULL DEFAULT false
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
      DROP COLUMN IF EXISTS transcript_retained
    `);
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
      DROP COLUMN IF EXISTS report_json
    `);
  }
}
