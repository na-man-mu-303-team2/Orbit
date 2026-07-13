import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateP0CoachingContracts2026071301000 implements MigrationInterface {
  name = "CreateP0CoachingContracts2026071301000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE rehearsal_focus_profiles (
        profile_id text PRIMARY KEY,
        project_id text NOT NULL UNIQUE REFERENCES projects(project_id) ON DELETE CASCADE,
        revision integer NOT NULL CHECK (revision > 0),
        items_json jsonb NOT NULL CHECK (jsonb_typeof(items_json) = 'array'),
        created_by text NOT NULL,
        updated_by text NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        CONSTRAINT uq_rehearsal_focus_profiles_project_profile
          UNIQUE (project_id, profile_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE rehearsal_evidence_clips (
        clip_id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
        run_id text NOT NULL,
        observation_id text NOT NULL,
        storage_key text,
        storage_key_hash char(64) UNIQUE
          CHECK (storage_key_hash IS NULL OR storage_key_hash ~ '^[0-9a-fA-F]{64}$'),
        start_ms integer NOT NULL CHECK (start_ms >= 0),
        end_ms integer NOT NULL CHECK (end_ms >= start_ms),
        duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 1 AND 12000),
        access_policy text NOT NULL DEFAULT 'owner-only'
          CHECK (access_policy = 'owner-only'),
        retention_policy_version smallint NOT NULL DEFAULT 1
          CHECK (retention_policy_version = 1),
        retention_days smallint NOT NULL DEFAULT 7
          CHECK (retention_days = 7),
        state text NOT NULL CHECK (state IN ('available','failed','expired','deleted')),
        expires_at timestamptz,
        deleted_at timestamptz,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        CONSTRAINT ck_rehearsal_evidence_clip_duration
          CHECK (duration_ms = end_ms - start_ms),
        CONSTRAINT ck_rehearsal_evidence_clip_available_expiry
          CHECK (state NOT IN ('available','expired') OR expires_at IS NOT NULL),
        CONSTRAINT ck_rehearsal_evidence_clip_storage_reference
          CHECK (state NOT IN ('available','expired') OR
            (storage_key IS NOT NULL AND storage_key_hash IS NOT NULL)),
        CONSTRAINT ck_rehearsal_evidence_clip_retention
          CHECK (expires_at IS NULL OR expires_at = created_at + interval '7 days'),
        CONSTRAINT ck_rehearsal_evidence_clip_deleted_at
          CHECK ((state = 'deleted') = (deleted_at IS NOT NULL)),
        CONSTRAINT uq_rehearsal_evidence_clips_project_clip
          UNIQUE (project_id, clip_id),
        CONSTRAINT fk_rehearsal_evidence_clips_run_tenant
          FOREIGN KEY (project_id, run_id)
          REFERENCES rehearsal_runs(project_id, run_id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_rehearsal_evidence_clips_expiry
      ON rehearsal_evidence_clips (state, expires_at)
      WHERE state IN ('available','expired')
    `);
    await queryRunner.query(`
      CREATE INDEX idx_rehearsal_evidence_clips_observation
      ON rehearsal_evidence_clips (project_id, run_id, observation_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_rehearsal_evidence_clips_observation`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_rehearsal_evidence_clips_expiry`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS rehearsal_evidence_clips`);
    await queryRunner.query(`DROP TABLE IF EXISTS rehearsal_focus_profiles`);
  }
}
