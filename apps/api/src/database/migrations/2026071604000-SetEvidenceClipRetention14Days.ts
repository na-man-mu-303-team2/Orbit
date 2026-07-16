import { MigrationInterface, QueryRunner } from "typeorm";

export class SetEvidenceClipRetention14Days2026071604000
  implements MigrationInterface
{
  name = "SetEvidenceClipRetention14Days2026071604000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rehearsal_evidence_clips
        DROP CONSTRAINT IF EXISTS rehearsal_evidence_clips_retention_days_check,
        DROP CONSTRAINT IF EXISTS ck_rehearsal_evidence_clip_retention
    `);
    await queryRunner.query(`
      ALTER TABLE rehearsal_evidence_clips
        ALTER COLUMN retention_days SET DEFAULT 14
    `);
    await queryRunner.query(`
      UPDATE rehearsal_evidence_clips
      SET retention_days = 14,
          expires_at = CASE
            WHEN expires_at IS NULL THEN NULL
            ELSE created_at + interval '14 days'
          END
      WHERE retention_days = 7
    `);
    await queryRunner.query(`
      ALTER TABLE rehearsal_evidence_clips
        ADD CONSTRAINT rehearsal_evidence_clips_retention_days_check
          CHECK (retention_days = 14),
        ADD CONSTRAINT ck_rehearsal_evidence_clip_retention
          CHECK (expires_at IS NULL OR expires_at = created_at + interval '14 days')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rehearsal_evidence_clips
        DROP CONSTRAINT IF EXISTS rehearsal_evidence_clips_retention_days_check,
        DROP CONSTRAINT IF EXISTS ck_rehearsal_evidence_clip_retention
    `);
    await queryRunner.query(`
      UPDATE rehearsal_evidence_clips
      SET retention_days = 7,
          expires_at = CASE
            WHEN expires_at IS NULL THEN NULL
            ELSE created_at + interval '7 days'
          END
      WHERE retention_days = 14
    `);
    await queryRunner.query(`
      ALTER TABLE rehearsal_evidence_clips
        ALTER COLUMN retention_days SET DEFAULT 7,
        ADD CONSTRAINT rehearsal_evidence_clips_retention_days_check
          CHECK (retention_days = 7),
        ADD CONSTRAINT ck_rehearsal_evidence_clip_retention
          CHECK (expires_at IS NULL OR expires_at = created_at + interval '7 days')
    `);
  }
}
