import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProfileAvatars2026072101000 implements MigrationInterface {
  name = "AddProfileAvatars2026072101000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS avatar_type text,
      ADD COLUMN IF NOT EXISTS avatar_id text,
      ADD CONSTRAINT chk_users_avatar_type
        CHECK (avatar_type IS NULL OR avatar_type IN ('official', 'uploaded'))
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_avatar_uploads (
        file_id text PRIMARY KEY,
        user_id text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        storage_key text NOT NULL UNIQUE,
        mime_type text NOT NULL,
        size integer NOT NULL CHECK (size > 0),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_user_avatar_uploads_user_id
      ON user_avatar_uploads (user_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_user_avatar_uploads_user_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_avatar_uploads`);
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_avatar_type`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS avatar_id`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS avatar_type`);
  }
}
