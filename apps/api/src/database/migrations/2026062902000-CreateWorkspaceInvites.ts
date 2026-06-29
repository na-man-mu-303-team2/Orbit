import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateWorkspaceInvites2026062902000 implements MigrationInterface {
  name = "CreateWorkspaceInvites2026062902000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspaces (
        workspace_id text PRIMARY KEY,
        name text NOT NULL,
        created_by text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_members (
        workspace_id text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
        user_id text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        role text NOT NULL CHECK (role IN ('owner', 'editor')),
        joined_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (workspace_id, user_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_workspace_members_user_role
      ON workspace_members (user_id, role)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_invites (
        invite_id text PRIMARY KEY,
        workspace_id text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
        token_hash text NOT NULL,
        created_by text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        role text NOT NULL CHECK (role = 'editor'),
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_invites_token_hash
      ON workspace_invites (token_hash)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace_expires
      ON workspace_invites (workspace_id, expires_at)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_workspace_invites_workspace_expires
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_workspace_invites_token_hash
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS workspace_invites`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_workspace_members_user_role`);
    await queryRunner.query(`DROP TABLE IF EXISTS workspace_members`);
    await queryRunner.query(`DROP TABLE IF EXISTS workspaces`);
  }
}
