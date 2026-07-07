import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRehearsalRunsSummaryIndex2026070701000
  implements MigrationInterface
{
  name = "AddRehearsalRunsSummaryIndex2026070701000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_rehearsal_runs_summary
      ON rehearsal_runs (project_id, deck_id, status, created_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_rehearsal_runs_summary
    `);
  }
}
