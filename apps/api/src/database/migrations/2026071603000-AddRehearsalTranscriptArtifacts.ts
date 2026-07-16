import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRehearsalTranscriptArtifacts2026071603000 implements MigrationInterface {
  name = "AddRehearsalTranscriptArtifacts2026071603000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
      ADD COLUMN transcript_json_file_id text NULL,
      ADD COLUMN transcript_text_file_id text NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
      DROP COLUMN transcript_text_file_id,
      DROP COLUMN transcript_json_file_id
    `);
  }
}
