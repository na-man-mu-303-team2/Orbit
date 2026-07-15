import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRehearsalOwnership2026071503000 implements MigrationInterface {
  name = "AddRehearsalOwnership2026071503000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
      ADD COLUMN created_by_user_id text
    `);
    await queryRunner.query(`
      ALTER TABLE project_assets
      ADD COLUMN created_by_user_id text
    `);
    // @invalid email과 폐기한 random preimage의 Argon2id hash로 로그인 불가능한 legacy principal만 보충한다.
    await queryRunner.query(`
      INSERT INTO users (user_id, email, password_hash, created_at, updated_at)
      SELECT DISTINCT
        projects.created_by,
        'disabled-legacy-project-owner-' || encode(convert_to(projects.created_by, 'UTF8'), 'hex') || '@invalid',
        '$argon2id$v=19$m=65536,t=3,p=4$YtoUpO2Cf/PrAjT2klJOAg$yedyPHXZhH9gwqcsCSXj1vwEXTefcHLn0NrDz0mN7KY',
        now(),
        now()
      FROM projects
      LEFT JOIN users ON users.user_id = projects.created_by
      WHERE users.user_id IS NULL
    `);
    await queryRunner.query(`
      UPDATE rehearsal_runs runs
      SET created_by_user_id = projects.created_by
      FROM projects
      WHERE projects.project_id = runs.project_id
        AND runs.created_by_user_id IS NULL
    `);
    await queryRunner.query(`
      UPDATE project_assets assets
      SET created_by_user_id = projects.created_by
      FROM projects
      WHERE projects.project_id = assets.project_id
        AND assets.purpose IN ('rehearsal-audio', 'rehearsal-slide-snapshot')
        AND assets.created_by_user_id IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
      ALTER COLUMN created_by_user_id SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
      ADD CONSTRAINT fk_rehearsal_runs_created_by_user
      FOREIGN KEY (created_by_user_id) REFERENCES users(user_id) ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE project_assets
      ADD CONSTRAINT fk_project_assets_created_by_user
      FOREIGN KEY (created_by_user_id) REFERENCES users(user_id) ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE project_assets
      ADD CONSTRAINT ck_project_assets_private_rehearsal_creator
      CHECK (
        purpose NOT IN ('rehearsal-audio', 'rehearsal-slide-snapshot')
        OR created_by_user_id IS NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_rehearsal_runs_project_creator_created_at
      ON rehearsal_runs (project_id, created_by_user_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_project_assets_project_creator_purpose_status
      ON project_assets (project_id, created_by_user_id, purpose, status)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_project_assets_project_creator_purpose_status
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_rehearsal_runs_project_creator_created_at
    `);
    await queryRunner.query(`
      ALTER TABLE project_assets
      DROP CONSTRAINT IF EXISTS ck_project_assets_private_rehearsal_creator
    `);
    await queryRunner.query(`
      ALTER TABLE project_assets
      DROP CONSTRAINT IF EXISTS fk_project_assets_created_by_user
    `);
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
      DROP CONSTRAINT IF EXISTS fk_rehearsal_runs_created_by_user
    `);
    await queryRunner.query(`
      ALTER TABLE project_assets
      DROP COLUMN IF EXISTS created_by_user_id
    `);
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
      DROP COLUMN IF EXISTS created_by_user_id
    `);
  }
}
