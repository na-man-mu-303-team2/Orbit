import { MigrationInterface, QueryRunner } from "typeorm";

export class RepairActivityRetentionPrivacy2026071704000
  implements MigrationInterface
{
  name = "RepairActivityRetentionPrivacy2026071704000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE activity_result_snapshots
      SET aggregate_json = jsonb_set(
        aggregate_json,
        '{textEntries}',
        '[]'::jsonb,
        true
      )
      WHERE jsonb_typeof(aggregate_json->'textEntries') = 'array'
        AND jsonb_array_length(aggregate_json->'textEntries') > 0
    `);
    await queryRunner.query(`
      UPDATE presentation_sessions
      SET raw_responses_delete_after =
        COALESCE(closed_at, ended_at, expires_at) + interval '90 days'
      WHERE raw_responses_delete_after IS NULL
    `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Privacy deletion is intentionally irreversible.
  }
}
