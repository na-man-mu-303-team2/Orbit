import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRehearsalAudioRetention2026071603000
  implements MigrationInterface
{
  name = "AddRehearsalAudioRetention2026071603000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
      ADD COLUMN raw_audio_delete_deadline_at timestamptz
    `);
    await queryRunner.query(`
      UPDATE rehearsal_runs AS runs
      SET raw_audio_delete_deadline_at = assets.uploaded_at + interval '14 days'
      FROM project_assets AS assets
      WHERE runs.project_id = assets.project_id
        AND runs.audio_file_id = assets.file_id
        AND runs.status = 'succeeded'
        AND runs.raw_audio_deleted_at IS NULL
        AND assets.status = 'uploaded'
        AND assets.uploaded_at IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_rehearsal_runs_audio_delete_deadline
      ON rehearsal_runs (raw_audio_delete_deadline_at)
      WHERE raw_audio_deleted_at IS NULL
        AND raw_audio_delete_deadline_at IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_rehearsal_runs_audio_delete_deadline`);
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
      DROP COLUMN raw_audio_delete_deadline_at
    `);
  }
}
