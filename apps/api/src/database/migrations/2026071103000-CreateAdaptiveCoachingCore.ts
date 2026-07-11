import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAdaptiveCoachingCore2026071103000
  implements MigrationInterface
{
  name = "CreateAdaptiveCoachingCore2026071103000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE status_constraint text;
      BEGIN
        SELECT c.conname INTO status_constraint
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'rehearsal_runs'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) LIKE '%status%';
        IF status_constraint IS NOT NULL THEN
          EXECUTE format('ALTER TABLE rehearsal_runs DROP CONSTRAINT %I', status_constraint);
        END IF;
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
      ADD CONSTRAINT rehearsal_runs_status_check
      CHECK (status IN ('created','uploading','processing','succeeded','failed','cancelled'))
    `);
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
        ADD COLUMN IF NOT EXISTS analysis_revision integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS analysis_finalized_at timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE project_assets
      ADD COLUMN IF NOT EXISTS content_hash text
    `);
    await queryRunner.query(`
      ALTER TABLE jobs
        ADD COLUMN IF NOT EXISTS dispatch_attempt_count integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS dispatch_after timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
        ADD COLUMN IF NOT EXISTS last_dispatch_error_code text
    `);
    await queryRunner.query(`
      ALTER TABLE jobs
      ADD CONSTRAINT jobs_dispatch_attempt_count_check
      CHECK (dispatch_attempt_count BETWEEN 0 AND 5)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_rehearsal_runs_project_run
      ON rehearsal_runs (project_id, run_id)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_project_assets_project_file
      ON project_assets (project_id, file_id)
    `);

    await queryRunner.query(`
      CREATE TABLE presentation_briefs (
        brief_id text PRIMARY KEY,
        project_id text NOT NULL UNIQUE REFERENCES projects(project_id) ON DELETE CASCADE,
        revision integer NOT NULL CHECK (revision > 0),
        content_json jsonb NOT NULL CHECK (jsonb_typeof(content_json) = 'object'),
        created_by text NOT NULL,
        updated_by text NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        CONSTRAINT uq_presentation_briefs_project_brief UNIQUE (project_id, brief_id)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE demo_fixture_projects (
        project_id text PRIMARY KEY REFERENCES projects(project_id) ON DELETE CASCADE,
        fixture_version text NOT NULL,
        created_at timestamptz NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE presentation_brief_approved_references (
        project_id text NOT NULL,
        brief_id text NOT NULL,
        file_id text NOT NULL,
        file_content_hash text NOT NULL CHECK (file_content_hash ~ '^[0-9a-fA-F]{64}$'),
        display_order integer NOT NULL CHECK (display_order BETWEEN 1 AND 10),
        PRIMARY KEY (brief_id, file_id),
        CONSTRAINT uq_brief_approved_reference_order UNIQUE (brief_id, display_order),
        CONSTRAINT fk_brief_reference_brief_tenant
          FOREIGN KEY (project_id, brief_id)
          REFERENCES presentation_briefs(project_id, brief_id) ON DELETE CASCADE,
        CONSTRAINT fk_brief_reference_asset_tenant
          FOREIGN KEY (project_id, file_id)
          REFERENCES project_assets(project_id, file_id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE practice_goal_sets (
        goal_set_id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
        source_full_run_id text NOT NULL,
        revision integer NOT NULL CHECK (revision > 0),
        source_analysis_revision integer NOT NULL CHECK (source_analysis_revision > 0),
        derivation_version integer NOT NULL DEFAULT 1 CHECK (derivation_version = 1),
        analysis_state text NOT NULL CHECK (analysis_state IN ('partial','final')),
        data_origin text NOT NULL CHECK (data_origin IN ('live','fixture')),
        created_at timestamptz NOT NULL,
        CONSTRAINT uq_practice_goal_sets_source_revision
          UNIQUE (source_full_run_id, revision),
        CONSTRAINT uq_practice_goal_sets_project_set UNIQUE (project_id, goal_set_id),
        CONSTRAINT fk_practice_goal_sets_run_tenant
          FOREIGN KEY (project_id, source_full_run_id)
          REFERENCES rehearsal_runs(project_id, run_id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_practice_goal_sets_project_created
      ON practice_goal_sets (project_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE TABLE practice_goal_heads (
        project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
        source_full_run_id text PRIMARY KEY,
        current_goal_set_id text NOT NULL UNIQUE,
        current_analysis_revision integer NOT NULL CHECK (current_analysis_revision > 0),
        updated_at timestamptz NOT NULL,
        CONSTRAINT fk_practice_goal_heads_run_tenant
          FOREIGN KEY (project_id, source_full_run_id)
          REFERENCES rehearsal_runs(project_id, run_id) ON DELETE CASCADE,
        CONSTRAINT fk_practice_goal_heads_set_tenant
          FOREIGN KEY (project_id, current_goal_set_id)
          REFERENCES practice_goal_sets(project_id, goal_set_id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE practice_goals (
        goal_id text PRIMARY KEY,
        goal_set_id text NOT NULL REFERENCES practice_goal_sets(goal_set_id) ON DELETE CASCADE,
        project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
        origin_full_run_id text NOT NULL,
        priority smallint NOT NULL CHECK (priority BETWEEN 1 AND 3),
        pattern_key text NOT NULL CHECK (pattern_key ~ '^[0-9a-fA-F]{64}$'),
        category text NOT NULL CHECK (category IN ('semantic','timing','delivery','structure')),
        criterion_ref_json jsonb NOT NULL CHECK (jsonb_typeof(criterion_ref_json) = 'object'),
        target_scope_json jsonb,
        recommended_practice_mode text NOT NULL CHECK (recommended_practice_mode IN ('focused','full-run-only')),
        evidence_refs_json jsonb NOT NULL CHECK (jsonb_typeof(evidence_refs_json) = 'array'),
        problem_label varchar(240) NOT NULL,
        next_action varchar(240) NOT NULL,
        success_condition varchar(240) NOT NULL,
        measurement_state text NOT NULL CHECK (measurement_state IN ('measured','unmeasured')),
        created_at timestamptz NOT NULL,
        CONSTRAINT uq_practice_goals_set_priority UNIQUE (goal_set_id, priority),
        CONSTRAINT uq_practice_goals_set_pattern UNIQUE (goal_set_id, pattern_key),
        CONSTRAINT uq_practice_goals_project_goal UNIQUE (project_id, goal_id),
        CONSTRAINT fk_practice_goals_set_tenant
          FOREIGN KEY (project_id, goal_set_id)
          REFERENCES practice_goal_sets(project_id, goal_set_id) ON DELETE CASCADE,
        CONSTRAINT fk_practice_goals_run_tenant
          FOREIGN KEY (project_id, origin_full_run_id)
          REFERENCES rehearsal_runs(project_id, run_id) ON DELETE CASCADE,
        CONSTRAINT ck_practice_goals_focus_scope
          CHECK ((recommended_practice_mode = 'focused') = (target_scope_json IS NOT NULL))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_practice_goals_project_pattern_created
      ON practice_goals (project_id, pattern_key, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE TABLE practice_goal_resolutions (
        resolution_id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
        goal_id text NOT NULL,
        origin_full_run_id text NOT NULL,
        evaluated_full_run_id text NOT NULL,
        criterion_ref_json jsonb NOT NULL CHECK (jsonb_typeof(criterion_ref_json) = 'object'),
        status text NOT NULL CHECK (status IN ('resolved','repeated','unmeasured','incomparable')),
        measurement_state text NOT NULL CHECK (measurement_state IN ('measured','unmeasured')),
        observed_value_json jsonb,
        reason_code text NOT NULL CHECK (reason_code IN ('PASSED','FAILED','NO_MEASUREMENT','DECK_CHANGED','BRIEF_CHANGED','CRITERION_CHANGED','SCOPE_CHANGED')),
        evaluated_at timestamptz NOT NULL,
        CONSTRAINT uq_practice_goal_resolution UNIQUE (goal_id, evaluated_full_run_id),
        CONSTRAINT fk_goal_resolution_goal_tenant
          FOREIGN KEY (project_id, goal_id)
          REFERENCES practice_goals(project_id, goal_id) ON DELETE CASCADE,
        CONSTRAINT fk_goal_resolution_origin_run_tenant
          FOREIGN KEY (project_id, origin_full_run_id)
          REFERENCES rehearsal_runs(project_id, run_id) ON DELETE CASCADE,
        CONSTRAINT fk_goal_resolution_evaluated_run_tenant
          FOREIGN KEY (project_id, evaluated_full_run_id)
          REFERENCES rehearsal_runs(project_id, run_id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_practice_goal_resolutions_run_status
      ON practice_goal_resolutions (evaluated_full_run_id, status)
    `);

    await queryRunner.query(`
      CREATE TABLE storage_deletion_outbox (
        deletion_id text PRIMARY KEY,
        project_id text NOT NULL,
        file_id text NOT NULL,
        storage_key text,
        storage_key_hash char(64) NOT NULL UNIQUE CHECK (storage_key_hash ~ '^[0-9a-fA-F]{64}$'),
        purpose text NOT NULL,
        status text NOT NULL CHECK (status IN ('pending','deleting','deleted','exhausted')),
        attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
        next_attempt_at timestamptz NOT NULL,
        last_error_code text,
        created_at timestamptz NOT NULL,
        deleted_at timestamptz
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_storage_deletion_outbox_dispatch
      ON storage_deletion_outbox (status, next_attempt_at)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_storage_deletion_outbox_dispatch`);
    await queryRunner.query(`DROP TABLE IF EXISTS storage_deletion_outbox`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_practice_goal_resolutions_run_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS practice_goal_resolutions`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_practice_goals_project_pattern_created`);
    await queryRunner.query(`DROP TABLE IF EXISTS practice_goals`);
    await queryRunner.query(`DROP TABLE IF EXISTS practice_goal_heads`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_practice_goal_sets_project_created`);
    await queryRunner.query(`DROP TABLE IF EXISTS practice_goal_sets`);
    await queryRunner.query(`DROP TABLE IF EXISTS presentation_brief_approved_references`);
    await queryRunner.query(`DROP TABLE IF EXISTS demo_fixture_projects`);
    await queryRunner.query(`DROP TABLE IF EXISTS presentation_briefs`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_project_assets_project_file`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_rehearsal_runs_project_run`);
    await queryRunner.query(`ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_dispatch_attempt_count_check`);
    await queryRunner.query(`
      ALTER TABLE jobs
        DROP COLUMN IF EXISTS last_dispatch_error_code,
        DROP COLUMN IF EXISTS dispatched_at,
        DROP COLUMN IF EXISTS dispatch_after,
        DROP COLUMN IF EXISTS dispatch_attempt_count
    `);
    await queryRunner.query(`ALTER TABLE project_assets DROP COLUMN IF EXISTS content_hash`);
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
        DROP COLUMN IF EXISTS analysis_finalized_at,
        DROP COLUMN IF EXISTS analysis_revision
    `);
    await queryRunner.query(`
      UPDATE rehearsal_runs
      SET status = 'failed',
          error = COALESCE(error, '{"code":"CANCELLED_BY_USER","message":"Run cancelled before rollback."}'::jsonb)
      WHERE status = 'cancelled'
    `);
    await queryRunner.query(`ALTER TABLE rehearsal_runs DROP CONSTRAINT IF EXISTS rehearsal_runs_status_check`);
    await queryRunner.query(`
      ALTER TABLE rehearsal_runs
      ADD CONSTRAINT rehearsal_runs_status_check
      CHECK (status IN ('created','uploading','processing','succeeded','failed'))
    `);
  }
}

