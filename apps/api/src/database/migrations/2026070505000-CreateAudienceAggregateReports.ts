import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAudienceAggregateReports2026070505000
  implements MigrationInterface
{
  name = "CreateAudienceAggregateReports2026070505000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audience_aggregate_reports (
        report_id text PRIMARY KEY,
        session_id text NOT NULL UNIQUE REFERENCES presentation_sessions(
          session_id
        ) ON DELETE CASCADE,
        status text NOT NULL CHECK (status IN ('preliminary', 'final')),
        aggregate_json jsonb NOT NULL,
        generated_at timestamptz NOT NULL DEFAULT now(),
        raw_data_deleted_at timestamptz
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audience_aggregate_reports_cleanup
      ON audience_aggregate_reports (raw_data_deleted_at, generated_at)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_audience_aggregate_reports_cleanup
    `);
    await queryRunner.query(
      `DROP TABLE IF EXISTS audience_aggregate_reports`,
    );
  }
}
