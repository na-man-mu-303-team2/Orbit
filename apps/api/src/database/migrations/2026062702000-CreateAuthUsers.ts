import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAuthUsers2026062702000 implements MigrationInterface {
  name = "CreateAuthUsers2026062702000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id text PRIMARY KEY,
        email text NOT NULL,
        password_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower
      ON users (lower(email))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_email_lower`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
  }
}
