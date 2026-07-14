import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRehearsalEvaluationSnapshot2026071001000
  implements MigrationInterface
{
  name = "AddRehearsalEvaluationSnapshot2026071001000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
      ADD COLUMN IF NOT EXISTS deck_version integer
    `);
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
      ADD COLUMN IF NOT EXISTS evaluation_snapshot_json jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
      ADD COLUMN IF NOT EXISTS semantic_evaluation_mode text NOT NULL DEFAULT 'full'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
      DROP COLUMN IF EXISTS semantic_evaluation_mode
    `);
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
      DROP COLUMN IF EXISTS evaluation_snapshot_json
    `);
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
      DROP COLUMN IF EXISTS deck_version
    `);
  }
}
