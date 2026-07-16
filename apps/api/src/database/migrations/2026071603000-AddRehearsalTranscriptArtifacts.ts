import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRehearsalTranscriptArtifacts2026071603000
  implements MigrationInterface
{
  name = "AddRehearsalTranscriptArtifacts2026071603000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
        ADD COLUMN transcript_json_file_id text,
        ADD COLUMN transcript_text_file_id text,
        ADD CONSTRAINT fk_rehearsal_runs_transcript_json_file
          FOREIGN KEY (project_id, transcript_json_file_id)
          REFERENCES project_assets(project_id, file_id)
          ON DELETE SET NULL (transcript_json_file_id),
        ADD CONSTRAINT fk_rehearsal_runs_transcript_text_file
          FOREIGN KEY (project_id, transcript_text_file_id)
          REFERENCES project_assets(project_id, file_id)
          ON DELETE SET NULL (transcript_text_file_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
        DROP CONSTRAINT IF EXISTS fk_rehearsal_runs_transcript_text_file,
        DROP CONSTRAINT IF EXISTS fk_rehearsal_runs_transcript_json_file,
        DROP COLUMN IF EXISTS transcript_text_file_id,
        DROP COLUMN IF EXISTS transcript_json_file_id
    `);
  }
}
