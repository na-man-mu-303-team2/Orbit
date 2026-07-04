import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUniqueOpenPresentationSession2026070202000 implements MigrationInterface {
  name = "AddUniqueOpenPresentationSession2026070202000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_presentation_sessions_active_join_code
      ON presentation_sessions (join_code)
      WHERE status IN ('draft', 'live')
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_presentation_sessions_one_active_per_project
      ON presentation_sessions (project_id)
      WHERE status IN ('draft', 'live')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_presentation_sessions_one_active_per_project
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_presentation_sessions_active_join_code
    `);
  }
}
