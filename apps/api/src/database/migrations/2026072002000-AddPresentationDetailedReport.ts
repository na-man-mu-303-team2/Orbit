import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddPresentationDetailedReport2026072002000 implements MigrationInterface {
  name = "AddPresentationDetailedReport2026072002000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "presentation_runs" ADD COLUMN "detailed_report_json" jsonb`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "presentation_runs" DROP COLUMN "detailed_report_json"`,
    );
  }
}
