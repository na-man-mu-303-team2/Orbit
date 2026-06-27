import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMigrationCommandCheck2026062700000 implements MigrationInterface {
  name = "CreateMigrationCommandCheck2026062700000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS migration_command_checks (
        id text PRIMARY KEY,
        checked_at timestamptz NOT NULL DEFAULT now(),
        note text NOT NULL DEFAULT 'migration command validation',
        embedding vector(3)
      )
    `);
    await queryRunner.query(`
      INSERT INTO migration_command_checks (id, note, embedding)
      VALUES (
        'sample_migration_check',
        'TypeORM migration run verified',
        '[0,0,0]'
      )
      ON CONFLICT (id) DO UPDATE
      SET
        checked_at = now(),
        note = EXCLUDED.note,
        embedding = EXCLUDED.embedding
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS migration_command_checks`);
  }
}
