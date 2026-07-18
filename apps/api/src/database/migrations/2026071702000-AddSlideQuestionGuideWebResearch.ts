import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSlideQuestionGuideWebResearch2026071702000 implements MigrationInterface {
  name = "AddSlideQuestionGuideWebResearch2026071702000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE slide_question_guides
      DROP CONSTRAINT IF EXISTS slide_question_guides_schema_version_check
    `);
    await queryRunner.query(`
      ALTER TABLE slide_question_guides
      ADD CONSTRAINT chk_slide_question_guide_schema_version
      CHECK (schema_version IN (1, 2))
    `);
    await queryRunner.query(`
      ALTER TABLE slide_question_guides
      ADD COLUMN research_status text NOT NULL DEFAULT 'unavailable',
      ADD COLUMN research_attempts smallint NOT NULL DEFAULT 0,
      ADD COLUMN official_source_count smallint NOT NULL DEFAULT 0,
      ADD COLUMN research_issue_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN researched_at timestamptz,
      ADD CONSTRAINT chk_slide_question_guide_research_status
        CHECK (research_status IN ('succeeded', 'unavailable')),
      ADD CONSTRAINT chk_slide_question_guide_research_attempts
        CHECK (research_attempts BETWEEN 0 AND 2),
      ADD CONSTRAINT chk_slide_question_guide_official_source_count
        CHECK (official_source_count BETWEEN 0 AND 5),
      ADD CONSTRAINT chk_slide_question_guide_research_issue_codes
        CHECK (jsonb_typeof(research_issue_codes) = 'array')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE slide_question_guides
      DROP CONSTRAINT IF EXISTS chk_slide_question_guide_research_issue_codes,
      DROP CONSTRAINT IF EXISTS chk_slide_question_guide_official_source_count,
      DROP CONSTRAINT IF EXISTS chk_slide_question_guide_research_attempts,
      DROP CONSTRAINT IF EXISTS chk_slide_question_guide_research_status,
      DROP COLUMN IF EXISTS researched_at,
      DROP COLUMN IF EXISTS research_issue_codes,
      DROP COLUMN IF EXISTS official_source_count,
      DROP COLUMN IF EXISTS research_attempts,
      DROP COLUMN IF EXISTS research_status
    `);
    await queryRunner.query(`
      ALTER TABLE slide_question_guides
      DROP CONSTRAINT IF EXISTS chk_slide_question_guide_schema_version
    `);
    await queryRunner.query(`
      ALTER TABLE slide_question_guides
      ADD CONSTRAINT slide_question_guides_schema_version_check
      CHECK (schema_version = 1)
    `);
  }
}
