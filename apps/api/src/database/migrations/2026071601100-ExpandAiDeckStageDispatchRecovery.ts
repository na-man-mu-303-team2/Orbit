import { MigrationInterface, QueryRunner } from "typeorm";

export class ExpandAiDeckStageDispatchRecovery2026071601100
  implements MigrationInterface
{
  name = "ExpandAiDeckStageDispatchRecovery2026071601100";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_ai_deck_generation_stages_stale_dispatch
    `);
    await queryRunner.query(`
      CREATE INDEX idx_ai_deck_generation_stages_stale_dispatch
      ON ai_deck_generation_stages (
        dispatched_at, pipeline_job_id, stage, shard_key
      )
      WHERE stage IN (
        'reference-extract-file','source-grounding','content-planning',
        'design-planning','layout-compile'
      )
        AND status = 'queued'
        AND dispatched_at IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_ai_deck_generation_stages_stale_dispatch
    `);
    await queryRunner.query(`
      CREATE INDEX idx_ai_deck_generation_stages_stale_dispatch
      ON ai_deck_generation_stages (
        dispatched_at, pipeline_job_id, shard_key
      )
      WHERE stage = 'reference-extract-file'
        AND status = 'queued'
        AND dispatched_at IS NOT NULL
    `);
  }
}
