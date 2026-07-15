import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAiDeckExecutionArtifacts2026071602000 implements MigrationInterface {
  name = "CreateAiDeckExecutionArtifacts2026071602000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_ai_deck_generation_stages_stale_dispatch
    `);
    await queryRunner.query(`
      CREATE INDEX idx_ai_deck_generation_stages_stale_dispatch
      ON ai_deck_generation_stages (dispatched_at, pipeline_job_id, shard_key)
      WHERE status = 'queued'
        AND dispatched_at IS NOT NULL
        AND stage IN (
          'reference-extract-file','source-grounding','content-planning',
          'design-planning','layout-compile','image-slide',
          'semantic-quality','rendered-visual-quality','publication'
        )
    `);
    await queryRunner.query(`
      CREATE TABLE ai_deck_execution_artifacts (
        artifact_id uuid PRIMARY KEY,
        pipeline_job_id text NOT NULL,
        project_id text NOT NULL,
        stage text NOT NULL CHECK (stage IN (
          'image-slide','semantic-quality','rendered-visual-quality','publication'
        )),
        shard_key text NOT NULL DEFAULT '',
        payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (pipeline_job_id, stage, shard_key),
        FOREIGN KEY (pipeline_job_id, project_id)
          REFERENCES jobs(job_id, project_id) ON DELETE CASCADE,
        FOREIGN KEY (pipeline_job_id, stage, shard_key)
          REFERENCES ai_deck_generation_stages(pipeline_job_id, stage, shard_key)
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      ALTER TABLE ai_deck_generation_stages
        DROP CONSTRAINT ck_ai_deck_generation_stages_input_ref,
        ADD CONSTRAINT ck_ai_deck_generation_stages_input_ref
        CHECK (
          input_ref_json = '{}'::jsonb
          OR (
            stage IN ('content-planning','design-planning','layout-compile','image-slide','semantic-quality')
            AND jsonb_typeof(input_ref_json) = 'object'
            AND input_ref_json = jsonb_build_object(
              'planningArtifactId', input_ref_json ->> 'planningArtifactId'
            )
            AND jsonb_typeof(input_ref_json -> 'planningArtifactId') = 'string'
            AND lower(input_ref_json ->> 'planningArtifactId')
              ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          )
          OR (
            stage IN ('rendered-visual-quality','publication')
            AND jsonb_typeof(input_ref_json) = 'object'
            AND input_ref_json = jsonb_build_object(
              'executionArtifactId', input_ref_json ->> 'executionArtifactId'
            )
            AND jsonb_typeof(input_ref_json -> 'executionArtifactId') = 'string'
            AND lower(input_ref_json ->> 'executionArtifactId')
              ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          )
        )
    `);
    await queryRunner.query(`
      ALTER TABLE ai_deck_generation_stages
        DROP CONSTRAINT ck_ai_deck_generation_stages_result_ref,
        ADD CONSTRAINT ck_ai_deck_generation_stages_result_ref
        CHECK (
          result_ref_json IS NULL
          OR result_ref_json = '{}'::jsonb
          OR (
            stage = 'reference-extract-file'
            AND jsonb_typeof(result_ref_json) = 'object'
            AND result_ref_json = jsonb_build_object(
              'referenceExtractionArtifactId',
              result_ref_json ->> 'referenceExtractionArtifactId'
            )
            AND jsonb_typeof(result_ref_json -> 'referenceExtractionArtifactId') = 'string'
            AND lower(result_ref_json ->> 'referenceExtractionArtifactId')
              ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          )
          OR (
            stage IN ('source-grounding','content-planning','design-planning','layout-compile')
            AND jsonb_typeof(result_ref_json) = 'object'
            AND result_ref_json = jsonb_build_object(
              'planningArtifactId', result_ref_json ->> 'planningArtifactId'
            )
            AND jsonb_typeof(result_ref_json -> 'planningArtifactId') = 'string'
            AND lower(result_ref_json ->> 'planningArtifactId')
              ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          )
          OR (
            stage IN ('image-slide','semantic-quality','rendered-visual-quality','publication')
            AND jsonb_typeof(result_ref_json) = 'object'
            AND result_ref_json = jsonb_build_object(
              'executionArtifactId', result_ref_json ->> 'executionArtifactId'
            )
            AND jsonb_typeof(result_ref_json -> 'executionArtifactId') = 'string'
            AND lower(result_ref_json ->> 'executionArtifactId')
              ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          )
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_ai_deck_generation_stages_stale_dispatch
    `);
    await queryRunner.query(`
      CREATE INDEX idx_ai_deck_generation_stages_stale_dispatch
      ON ai_deck_generation_stages (dispatched_at, pipeline_job_id, shard_key)
      WHERE status = 'queued'
        AND dispatched_at IS NOT NULL
        AND stage IN (
          'reference-extract-file','source-grounding','content-planning',
          'design-planning','layout-compile'
        )
    `);
    await queryRunner.query(`
      UPDATE ai_deck_generation_stages
      SET input_ref_json = '{}'::jsonb,
          result_ref_json = NULL,
          updated_at = now()
      WHERE stage IN (
        'image-slide','semantic-quality','rendered-visual-quality','publication'
      )
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS ai_deck_execution_artifacts`);
    await queryRunner.query(`
      ALTER TABLE ai_deck_generation_stages
        DROP CONSTRAINT IF EXISTS ck_ai_deck_generation_stages_input_ref,
        ADD CONSTRAINT ck_ai_deck_generation_stages_input_ref
        CHECK (
          input_ref_json = '{}'::jsonb
          OR (
            stage IN ('content-planning','design-planning','layout-compile')
            AND jsonb_typeof(input_ref_json) = 'object'
            AND input_ref_json = jsonb_build_object(
              'planningArtifactId', input_ref_json ->> 'planningArtifactId'
            )
            AND jsonb_typeof(input_ref_json -> 'planningArtifactId') = 'string'
            AND lower(input_ref_json ->> 'planningArtifactId')
              ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          )
        )
    `);
    await queryRunner.query(`
      ALTER TABLE ai_deck_generation_stages
        DROP CONSTRAINT IF EXISTS ck_ai_deck_generation_stages_result_ref,
        ADD CONSTRAINT ck_ai_deck_generation_stages_result_ref
        CHECK (
          result_ref_json IS NULL
          OR result_ref_json = '{}'::jsonb
          OR (
            stage = 'reference-extract-file'
            AND jsonb_typeof(result_ref_json) = 'object'
            AND result_ref_json = jsonb_build_object(
              'referenceExtractionArtifactId',
              result_ref_json ->> 'referenceExtractionArtifactId'
            )
            AND jsonb_typeof(result_ref_json -> 'referenceExtractionArtifactId') = 'string'
            AND lower(result_ref_json ->> 'referenceExtractionArtifactId')
              ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          )
          OR (
            stage IN ('source-grounding','content-planning','design-planning','layout-compile')
            AND jsonb_typeof(result_ref_json) = 'object'
            AND result_ref_json = jsonb_build_object(
              'planningArtifactId', result_ref_json ->> 'planningArtifactId'
            )
            AND jsonb_typeof(result_ref_json -> 'planningArtifactId') = 'string'
            AND lower(result_ref_json ->> 'planningArtifactId')
              ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          )
        )
    `);
  }
}
