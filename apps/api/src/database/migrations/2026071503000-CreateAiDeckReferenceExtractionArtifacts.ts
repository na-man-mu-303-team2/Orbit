import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAiDeckReferenceExtractionArtifacts2026071503000
  implements MigrationInterface
{
  name = "CreateAiDeckReferenceExtractionArtifacts2026071503000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_job_project
      ON jobs (job_id, project_id)
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
            AND jsonb_typeof(
              result_ref_json -> 'referenceExtractionArtifactId'
            ) = 'string'
            AND lower(
              result_ref_json ->> 'referenceExtractionArtifactId'
            ) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          )
        )
    `);
    await queryRunner.query(`
      CREATE TABLE ai_deck_reference_extraction_artifacts (
        artifact_id uuid PRIMARY KEY,
        pipeline_job_id text NOT NULL,
        project_id text NOT NULL,
        file_id text NOT NULL,
        stage text NOT NULL DEFAULT 'reference-extract-file'
          CHECK (stage = 'reference-extract-file'),
        extraction_json jsonb NOT NULL
          CHECK (jsonb_typeof(extraction_json) = 'object'),
        usable boolean NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (pipeline_job_id, file_id),
        FOREIGN KEY (pipeline_job_id, project_id)
          REFERENCES jobs(job_id, project_id) ON DELETE CASCADE,
        FOREIGN KEY (project_id, file_id)
          REFERENCES project_assets(project_id, file_id) ON DELETE CASCADE,
        FOREIGN KEY (pipeline_job_id, stage, file_id)
          REFERENCES ai_deck_generation_stages(pipeline_job_id, stage, shard_key)
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_ai_deck_reference_artifacts_pipeline_usable
      ON ai_deck_reference_extraction_artifacts (
        pipeline_job_id, usable, file_id
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_ai_deck_reference_artifacts_pipeline_usable
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS ai_deck_reference_extraction_artifacts
    `);
    await queryRunner.query(`
      ALTER TABLE ai_deck_generation_stages
        DROP CONSTRAINT IF EXISTS ck_ai_deck_generation_stages_result_ref,
        ADD CONSTRAINT ck_ai_deck_generation_stages_result_ref
        CHECK (
          result_ref_json IS NULL OR result_ref_json = '{}'::jsonb
        )
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_jobs_job_project`);
  }
}
