import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSlidePracticeContentHash2026072101000 implements MigrationInterface {
  name = "AddSlidePracticeContentHash2026072101000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE slide_practice_audio_analyses
        ADD COLUMN content_hash_version text,
        ADD COLUMN slide_content_hash text,
        ADD CONSTRAINT ck_slide_practice_analysis_content_hash
          CHECK (slide_content_hash IS NULL OR slide_content_hash ~ '^[a-f0-9]{64}$'),
        ADD CONSTRAINT ck_slide_practice_analysis_content_hash_version
          CHECK (content_hash_version IS NULL OR content_hash_version = 'slide-text-v1'),
        ADD CONSTRAINT ck_slide_practice_analysis_content_hash_pair
          CHECK ((content_hash_version IS NULL) = (slide_content_hash IS NULL))
    `);
    await queryRunner.query(`
      ALTER TABLE slide_practice_reports
        ADD COLUMN content_hash_version text,
        ADD COLUMN slide_content_hash text,
        ADD CONSTRAINT ck_slide_practice_report_content_hash
          CHECK (slide_content_hash IS NULL OR slide_content_hash ~ '^[a-f0-9]{64}$'),
        ADD CONSTRAINT ck_slide_practice_report_content_hash_version
          CHECK (content_hash_version IS NULL OR content_hash_version = 'slide-text-v1'),
        ADD CONSTRAINT ck_slide_practice_report_content_hash_pair
          CHECK ((content_hash_version IS NULL) = (slide_content_hash IS NULL))
    `);
    await queryRunner.query(`
      CREATE INDEX idx_slide_practice_comparable_history
      ON slide_practice_reports (
        project_id,
        created_by,
        deck_id,
        slide_id,
        slide_content_hash,
        created_at DESC
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_slide_practice_comparable_history`);
    await queryRunner.query(`
      ALTER TABLE slide_practice_reports
        DROP CONSTRAINT IF EXISTS ck_slide_practice_report_content_hash_pair,
        DROP CONSTRAINT IF EXISTS ck_slide_practice_report_content_hash_version,
        DROP CONSTRAINT IF EXISTS ck_slide_practice_report_content_hash,
        DROP COLUMN IF EXISTS slide_content_hash,
        DROP COLUMN IF EXISTS content_hash_version
    `);
    await queryRunner.query(`
      ALTER TABLE slide_practice_audio_analyses
        DROP CONSTRAINT IF EXISTS ck_slide_practice_analysis_content_hash_pair,
        DROP CONSTRAINT IF EXISTS ck_slide_practice_analysis_content_hash_version,
        DROP CONSTRAINT IF EXISTS ck_slide_practice_analysis_content_hash,
        DROP COLUMN IF EXISTS slide_content_hash,
        DROP COLUMN IF EXISTS content_hash_version
    `);
  }
}
