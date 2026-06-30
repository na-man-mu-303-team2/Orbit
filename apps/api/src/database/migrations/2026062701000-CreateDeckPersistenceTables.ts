import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateDeckPersistenceTables2026062701000
  implements MigrationInterface
{
  name = "CreateDeckPersistenceTables2026062701000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS decks (
        project_id text PRIMARY KEY,
        deck_id text NOT NULL,
        deck_json jsonb NOT NULL,
        version integer NOT NULL CHECK (version > 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_decks_deck_id
      ON decks (deck_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS deck_patches (
        change_id text PRIMARY KEY,
        project_id text NOT NULL,
        deck_id text NOT NULL,
        before_version integer NOT NULL CHECK (before_version > 0),
        after_version integer NOT NULL CHECK (after_version > before_version),
        source text NOT NULL CHECK (source IN ('user', 'ai', 'import', 'system')),
        actor_user_id text,
        operations jsonb NOT NULL,
        created_at timestamptz NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_deck_patches_project_deck_version
      ON deck_patches (project_id, deck_id, after_version)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_deck_patches_project_deck_after_version
      ON deck_patches (project_id, deck_id, after_version)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS deck_snapshots (
        snapshot_id text PRIMARY KEY,
        project_id text NOT NULL,
        deck_id text NOT NULL,
        deck_json jsonb NOT NULL,
        version integer NOT NULL CHECK (version > 0),
        reason text NOT NULL CHECK (
          reason IN ('auto-save', 'deck-replaced', 'patch-applied', 'snapshot-restore')
        ),
        created_at timestamptz NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_deck_snapshots_project_created_at
      ON deck_snapshots (project_id, created_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_deck_snapshots_project_created_at`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS deck_snapshots`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS uq_deck_patches_project_deck_after_version`
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_deck_patches_project_deck_version`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS deck_patches`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_decks_deck_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS decks`);
  }
}
