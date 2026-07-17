import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAiDeckStoryReviews2026071604000 implements MigrationInterface {
  name = "CreateAiDeckStoryReviews2026071604000";

  async up(queryRunner: QueryRunner): Promise<void> {
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
        CONSTRAINT ck_ai_deck_story_reviews_revision
          CHECK (revision BETWEEN 0 AND 6),
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
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ai_deck_story_reviews`);
  }
}
