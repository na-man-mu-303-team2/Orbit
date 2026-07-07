import { MigrationInterface, QueryRunner } from "typeorm";

/** ORBIT-8 이메일/비밀번호 인증에 필요한 users 테이블을 관리한다. */
export class CreateAuthUsers2026062702000 implements MigrationInterface {
  name = "CreateAuthUsers2026062702000";

  /** password hash와 정규화 이메일 중복 방지를 위한 테이블/index를 만든다. */
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

  /** ORBIT-8 인증 테이블을 되돌릴 때 index를 먼저 지우고 users 테이블을 제거한다. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_email_lower`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
  }
}
