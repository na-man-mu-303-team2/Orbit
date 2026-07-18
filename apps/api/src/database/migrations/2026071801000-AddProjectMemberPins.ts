import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProjectMemberPins2026071801000 implements MigrationInterface {
  name = "AddProjectMemberPins2026071801000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE project_members
      ADD COLUMN is_pinned boolean NOT NULL DEFAULT false
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE project_members
      DROP COLUMN is_pinned
    `);
  }
}
