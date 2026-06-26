import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialOrbitSchema2026062700000 implements MigrationInterface {
  name = "InitialOrbitSchema2026062700000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id text PRIMARY KEY,
        name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id text PRIMARY KEY,
        email text,
        display_name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id text PRIMARY KEY,
        workspace_id text NOT NULL REFERENCES workspaces(id),
        title text NOT NULL,
        created_by text NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(id),
        original_name text NOT NULL,
        mime_type text NOT NULL,
        size_bytes bigint NOT NULL,
        storage_key text NOT NULL,
        purpose text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS decks (
        id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(id),
        title text NOT NULL,
        version integer NOT NULL DEFAULT 1,
        scene_json jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS deck_versions (
        id text PRIMARY KEY,
        deck_id text NOT NULL REFERENCES decks(id),
        version integer NOT NULL,
        scene_json jsonb NOT NULL,
        created_by text NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(deck_id, version)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(id),
        type text NOT NULL,
        status text NOT NULL,
        progress integer NOT NULL DEFAULT 0,
        message text NOT NULL DEFAULT '',
        result jsonb,
        error jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS reference_chunks (
        id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(id),
        asset_id text REFERENCES assets(id),
        content text NOT NULL,
        embedding vector(1536),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      INSERT INTO users (id, email, display_name)
      VALUES ('user_demo_1', 'demo@orbit.local', 'Demo User')
      ON CONFLICT (id) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO workspaces (id, name)
      VALUES ('workspace_demo_1', 'ORBIT Demo Workspace')
      ON CONFLICT (id) DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS reference_chunks`);
    await queryRunner.query(`DROP TABLE IF EXISTS jobs`);
    await queryRunner.query(`DROP TABLE IF EXISTS deck_versions`);
    await queryRunner.query(`DROP TABLE IF EXISTS decks`);
    await queryRunner.query(`DROP TABLE IF EXISTS assets`);
    await queryRunner.query(`DROP TABLE IF EXISTS projects`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
    await queryRunner.query(`DROP TABLE IF EXISTS workspaces`);
  }
}

