import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserProjectTagsAndPinnedAt2026072103000 implements MigrationInterface {
  name = "AddUserProjectTagsAndPinnedAt2026072103000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN project_tags jsonb NOT NULL
        DEFAULT '[{"name":"중요","color":"yellow"}]'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE project_members
      ADD COLUMN pinned_at timestamptz
    `);
    await queryRunner.query(`
      UPDATE project_members
      SET pinned_at = created_at
      WHERE is_pinned = true
    `);
    await queryRunner.query(`
      CREATE INDEX idx_project_members_user_pin_order
      ON project_members (user_id, is_pinned DESC, pinned_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_project_members_user_pin_order`);
    await queryRunner.query(`ALTER TABLE project_members DROP COLUMN pinned_at`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN project_tags`);
  }
}
