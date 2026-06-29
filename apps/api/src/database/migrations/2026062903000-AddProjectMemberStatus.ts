import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProjectMemberStatus2026062903000 implements MigrationInterface {
  name = "AddProjectMemberStatus2026062903000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE project_members
      ADD COLUMN IF NOT EXISTS status text
    `);
    await queryRunner.query(`
      UPDATE project_members
      SET status = 'accepted'
      WHERE status IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE project_members
      ALTER COLUMN status SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE project_members
      DROP CONSTRAINT IF EXISTS project_members_status_check
    `);
    await queryRunner.query(`
      ALTER TABLE project_members
      ADD CONSTRAINT project_members_status_check
      CHECK (status IN ('pending', 'accepted', 'rejected'))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE project_members
      DROP CONSTRAINT IF EXISTS project_members_status_check
    `);
    await queryRunner.query(`
      ALTER TABLE project_members
      DROP COLUMN IF EXISTS status
    `);
  }
}
