import { MigrationInterface, QueryRunner } from "typeorm";

export class ReplaceStoryReviewWithCoverPreview2026071705000 implements MigrationInterface {
  name = "ReplaceStoryReviewWithCoverPreview2026071705000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE jobs
      SET payload = payload - 'storyReviewRequired', updated_at = now()
      WHERE type = 'ai-deck-generation' AND payload ? 'storyReviewRequired'
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS ai_deck_story_reviews`);
    await queryRunner.query(`
      ALTER TABLE ai_deck_generation_stages
        DROP CONSTRAINT ck_ai_deck_generation_stages_stage,
        ADD CONSTRAINT ck_ai_deck_generation_stages_stage CHECK (stage IN (
          'reference-extract-file','source-grounding','content-planning',
          'cover-slide','design-planning','layout-compile','image-slide',
          'semantic-quality','rendered-visual-quality','publication'
        ))
    `);
    await queryRunner.query(`
      ALTER TABLE ai_deck_generation_stages
        DROP CONSTRAINT ck_ai_deck_generation_stages_result_ref,
        ADD CONSTRAINT ck_ai_deck_generation_stages_result_ref CHECK (
          result_ref_json IS NULL OR result_ref_json = '{}'::jsonb
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
            stage IN ('cover-slide','image-slide','semantic-quality','rendered-visual-quality','publication')
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
    await queryRunner.query(`
      ALTER TABLE ai_deck_execution_artifacts
        DROP CONSTRAINT ai_deck_execution_artifacts_stage_check,
        ADD CONSTRAINT ai_deck_execution_artifacts_stage_check CHECK (stage IN (
          'cover-slide','image-slide','semantic-quality',
          'rendered-visual-quality','publication'
        ))
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ai_deck_generation_stages_stale_dispatch`);
    await queryRunner.query(`
      CREATE INDEX idx_ai_deck_generation_stages_stale_dispatch
      ON ai_deck_generation_stages (dispatched_at, pipeline_job_id, shard_key)
      WHERE status = 'queued' AND dispatched_at IS NOT NULL
        AND stage IN (
          'reference-extract-file','source-grounding','content-planning',
          'cover-slide','design-planning','layout-compile','image-slide',
          'semantic-quality','rendered-visual-quality','publication'
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM ai_deck_execution_artifacts WHERE stage = 'cover-slide'`);
    await queryRunner.query(`DELETE FROM ai_deck_generation_stages WHERE stage = 'cover-slide'`);
    await queryRunner.query(`
      ALTER TABLE ai_deck_generation_stages
        DROP CONSTRAINT ck_ai_deck_generation_stages_result_ref,
        ADD CONSTRAINT ck_ai_deck_generation_stages_result_ref CHECK (
          result_ref_json IS NULL OR result_ref_json = '{}'::jsonb
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
    await queryRunner.query(`
      ALTER TABLE ai_deck_execution_artifacts
        DROP CONSTRAINT ai_deck_execution_artifacts_stage_check,
        ADD CONSTRAINT ai_deck_execution_artifacts_stage_check CHECK (stage IN (
          'image-slide','semantic-quality','rendered-visual-quality','publication'
        ))
    `);
    await queryRunner.query(`
      ALTER TABLE ai_deck_generation_stages
        DROP CONSTRAINT ck_ai_deck_generation_stages_stage,
        ADD CONSTRAINT ck_ai_deck_generation_stages_stage CHECK (stage IN (
          'reference-extract-file','source-grounding','content-planning',
          'design-planning','layout-compile','image-slide','semantic-quality',
          'rendered-visual-quality','publication'
        ))
    `);
    await queryRunner.query(`
      CREATE TABLE ai_deck_story_reviews (
        pipeline_job_id text PRIMARY KEY,
        project_id text NOT NULL,
        status text NOT NULL,
        revision integer NOT NULL DEFAULT 0,
        regeneration_count integer NOT NULL DEFAULT 0,
        regeneration_instruction text,
        last_error_json jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_ai_deck_story_reviews_job
          FOREIGN KEY (pipeline_job_id, project_id)
          REFERENCES jobs(job_id, project_id) ON DELETE CASCADE,
        CONSTRAINT ck_ai_deck_story_reviews_status
          CHECK (status IN ('review-pending','regenerating','approved','cancelled')),
        CONSTRAINT ck_ai_deck_story_reviews_revision CHECK (revision BETWEEN 0 AND 6),
        CONSTRAINT ck_ai_deck_story_reviews_regeneration_count
          CHECK (regeneration_count BETWEEN 0 AND 5),
        CONSTRAINT ck_ai_deck_story_reviews_instruction
          CHECK (
            regeneration_instruction IS NULL
            OR char_length(regeneration_instruction) <= 240
          ),
        CONSTRAINT ck_ai_deck_story_reviews_error
          CHECK (
            last_error_json IS NULL
            OR jsonb_typeof(last_error_json) = 'object'
          )
      )
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ai_deck_generation_stages_stale_dispatch`);
    await queryRunner.query(`
      CREATE INDEX idx_ai_deck_generation_stages_stale_dispatch
      ON ai_deck_generation_stages (dispatched_at, pipeline_job_id, shard_key)
      WHERE status = 'queued' AND dispatched_at IS NOT NULL
        AND stage IN (
          'reference-extract-file','source-grounding','content-planning',
          'design-planning','layout-compile','image-slide',
          'semantic-quality','rendered-visual-quality','publication'
        )
    `);
  }
}
