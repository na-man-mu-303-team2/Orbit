import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAiDeckGenerationStages2026071502000 implements MigrationInterface {
  name = "CreateAiDeckGenerationStages2026071502000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE ai_deck_generation_stages (
        pipeline_job_id text NOT NULL,
        stage text NOT NULL,
        shard_key text NOT NULL DEFAULT '',
        status text NOT NULL DEFAULT 'queued',
        attempt integer NOT NULL DEFAULT 0,
        input_ref_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        result_ref_json jsonb,
        error_json jsonb,
        lease_owner text,
        lease_expires_at timestamptz,
        dispatched_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_ai_deck_generation_stages_job
          FOREIGN KEY (pipeline_job_id) REFERENCES jobs(job_id) ON DELETE CASCADE,
        CONSTRAINT ck_ai_deck_generation_stages_stage CHECK (stage IN (
          'reference-extract-file','source-grounding','content-planning',
          'design-planning','layout-compile','image-slide','semantic-quality',
          'rendered-visual-quality','publication'
        )),
        CONSTRAINT ck_ai_deck_generation_stages_status
          CHECK (status IN ('queued','running','succeeded','failed')),
        CONSTRAINT ck_ai_deck_generation_stages_attempt
          CHECK (attempt BETWEEN 0 AND 5),
        CONSTRAINT ck_ai_deck_generation_stages_input_ref
          CHECK (input_ref_json = '{}'::jsonb),
        CONSTRAINT ck_ai_deck_generation_stages_result_ref
          CHECK (result_ref_json IS NULL OR result_ref_json = '{}'::jsonb),
        CONSTRAINT ck_ai_deck_generation_stages_error
          CHECK (error_json IS NULL OR jsonb_typeof(error_json) = 'object'),
        CONSTRAINT ck_ai_deck_generation_stages_job_id_delimiter
          CHECK (
            position(':' in pipeline_job_id) = 0
            AND pipeline_job_id = btrim(pipeline_job_id)
            AND char_length(pipeline_job_id) > 0
          ),
        CONSTRAINT ck_ai_deck_generation_stages_shard_key_delimiter
          CHECK (
            position(':' in shard_key) = 0
            AND shard_key = btrim(shard_key)
          ),
        CONSTRAINT ck_ai_deck_generation_stages_shard_key CHECK (
          (stage IN ('reference-extract-file','image-slide')
            AND char_length(btrim(shard_key)) > 0)
          OR
          (stage NOT IN ('reference-extract-file','image-slide')
            AND shard_key = '')
        ),
        CONSTRAINT ck_ai_deck_generation_stages_lease CHECK (
          (status = 'running' AND lease_owner IS NOT NULL
            AND char_length(btrim(lease_owner)) > 0
            AND lease_expires_at IS NOT NULL)
          OR
          (status <> 'running' AND lease_owner IS NULL AND lease_expires_at IS NULL)
        ),
        CONSTRAINT uq_ai_deck_generation_stages_checkpoint
          UNIQUE (pipeline_job_id, stage, shard_key)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_ai_deck_generation_stages_undispatched
      ON ai_deck_generation_stages (created_at, pipeline_job_id, stage, shard_key)
      WHERE status = 'queued' AND dispatched_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_ai_deck_generation_stages_expired_lease
      ON ai_deck_generation_stages (
        lease_expires_at,
        pipeline_job_id,
        stage,
        shard_key
      )
      WHERE status = 'running'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_ai_deck_generation_stages_expired_lease`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_ai_deck_generation_stages_undispatched`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS ai_deck_generation_stages`);
  }
}
