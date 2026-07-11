import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateChallengeQna2026071105000 implements MigrationInterface {
  name = "CreateChallengeQna2026071105000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_decks_project_deck ON decks (project_id, deck_id)`);
    await queryRunner.query(`
      CREATE TABLE challenge_qna_sessions (
        qna_session_id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
        deck_id text NOT NULL,
        client_request_id text NOT NULL,
        source_json jsonb NOT NULL CHECK (jsonb_typeof(source_json) = 'object'),
        source_full_run_id text,
        source_practice_session_id text,
        source_attempt_id text,
        source_snapshot_json jsonb NOT NULL CHECK (jsonb_typeof(source_snapshot_json) = 'object'),
        grounding_snapshot_json jsonb CHECK (grounding_snapshot_json IS NULL OR jsonb_typeof(grounding_snapshot_json) = 'object'),
        status text NOT NULL CHECK (status IN ('preparing','ready','active','completed','failed','cancelled')),
        generation_revision integer NOT NULL CHECK (generation_revision > 0),
        generation_job_id text REFERENCES jobs(job_id) ON DELETE SET NULL,
        active_question_order integer CHECK (active_question_order BETWEEN 1 AND 3),
        execution_mode text NOT NULL CHECK (execution_mode IN ('provider','fixture')),
        error_code text,
        created_by text NOT NULL,
        created_at timestamptz NOT NULL,
        completed_at timestamptz,
        CONSTRAINT uq_qna_session_client UNIQUE (project_id, client_request_id),
        CONSTRAINT uq_qna_session_project_session UNIQUE (project_id, qna_session_id),
        CONSTRAINT fk_qna_session_deck FOREIGN KEY (project_id, deck_id)
          REFERENCES decks(project_id, deck_id) ON DELETE RESTRICT,
        CONSTRAINT fk_qna_session_full_run FOREIGN KEY (project_id, source_full_run_id)
          REFERENCES rehearsal_runs(project_id, run_id) ON DELETE RESTRICT,
        CONSTRAINT fk_qna_session_practice FOREIGN KEY (project_id, source_practice_session_id)
          REFERENCES focused_practice_sessions(project_id, practice_session_id) ON DELETE RESTRICT,
        CONSTRAINT fk_qna_session_attempt FOREIGN KEY (project_id, source_attempt_id)
          REFERENCES focused_practice_attempts(project_id, attempt_id) ON DELETE RESTRICT,
        CONSTRAINT ck_qna_source_mode CHECK (
          (source_full_run_id IS NOT NULL AND source_practice_session_id IS NULL AND source_attempt_id IS NULL)
          OR (source_full_run_id IS NULL AND source_practice_session_id IS NOT NULL AND source_attempt_id IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(`
      CREATE TABLE challenge_qna_questions (
        question_id text NOT NULL,
        project_id text NOT NULL,
        qna_session_id text NOT NULL,
        revision integer NOT NULL CHECK (revision > 0),
        question_order integer NOT NULL CHECK (question_order BETWEEN 1 AND 3),
        question_type text NOT NULL CHECK (question_type IN ('clarification','evidence','objection','decision')),
        difficulty text NOT NULL CHECK (difficulty IN ('standard','challenging')),
        question_text text NOT NULL CHECK (char_length(question_text) BETWEEN 1 AND 500),
        linked_goal_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        source_refs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        answer_guide_json jsonb NOT NULL,
        provenance_json jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (question_id, revision),
        CONSTRAINT uq_qna_question_project_identity UNIQUE (project_id, question_id, revision),
        CONSTRAINT uq_qna_question_order_revision UNIQUE (qna_session_id, revision, question_order),
        CONSTRAINT fk_qna_question_session FOREIGN KEY (project_id, qna_session_id)
          REFERENCES challenge_qna_sessions(project_id, qna_session_id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE challenge_qna_assistance (
        project_id text NOT NULL,
        qna_session_id text NOT NULL,
        question_id text NOT NULL,
        question_revision integer NOT NULL,
        level text NOT NULL CHECK (level IN ('none','concept-hint','slide-hint','full-guide')),
        level_rank integer NOT NULL CHECK (level_rank BETWEEN 0 AND 3),
        updated_by text NOT NULL,
        updated_at timestamptz NOT NULL,
        PRIMARY KEY (qna_session_id, question_id, question_revision),
        CONSTRAINT fk_qna_assistance_question FOREIGN KEY (project_id, question_id, question_revision)
          REFERENCES challenge_qna_questions(project_id, question_id, revision) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE challenge_qna_answer_attempts (
        answer_attempt_id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
        qna_session_id text NOT NULL,
        question_id text NOT NULL,
        question_revision integer NOT NULL,
        client_request_id text NOT NULL,
        attempt_number integer NOT NULL CHECK (attempt_number > 0),
        input_mode text NOT NULL CHECK (input_mode IN ('voice','text')),
        assistance_level text NOT NULL CHECK (assistance_level IN ('none','concept-hint','slide-hint','full-guide')),
        status text NOT NULL CHECK (status IN ('created','uploading','queued','processing','succeeded','failed','cancelled')),
        analysis_job_id text REFERENCES jobs(job_id) ON DELETE SET NULL,
        audio_file_id text,
        cleanup_state text NOT NULL CHECK (cleanup_state IN ('not-required','pending','deleted','exhausted')),
        cleanup_generation integer NOT NULL CHECK (cleanup_generation > 0),
        raw_audio_deleted_at timestamptz,
        raw_audio_delete_deadline_at timestamptz,
        duration_ms integer CHECK (duration_ms BETWEEN 1 AND 120000),
        evidence_expires_at timestamptz,
        concept_outcomes_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        clarity text CHECK (clarity IN ('clear','needs-focus','unmeasured')),
        audience_fit text CHECK (audience_fit IN ('appropriate','too-technical','too-vague','unmeasured')),
        error_code text,
        created_at timestamptz NOT NULL,
        completed_at timestamptz,
        CONSTRAINT uq_qna_answer_client UNIQUE (qna_session_id, client_request_id),
        CONSTRAINT uq_qna_answer_number UNIQUE (qna_session_id, question_id, question_revision, attempt_number),
        CONSTRAINT uq_qna_answer_project_attempt UNIQUE (project_id, answer_attempt_id),
        CONSTRAINT fk_qna_answer_session FOREIGN KEY (project_id, qna_session_id)
          REFERENCES challenge_qna_sessions(project_id, qna_session_id) ON DELETE CASCADE,
        CONSTRAINT fk_qna_answer_question FOREIGN KEY (project_id, question_id, question_revision)
          REFERENCES challenge_qna_questions(project_id, question_id, revision) ON DELETE RESTRICT,
        CONSTRAINT fk_qna_answer_audio FOREIGN KEY (project_id, audio_file_id)
          REFERENCES project_assets(project_id, file_id) ON DELETE RESTRICT,
        CONSTRAINT ck_qna_answer_audio_mode CHECK (
          (input_mode = 'text' AND audio_file_id IS NULL AND duration_ms IS NULL)
          OR input_mode = 'voice'
        )
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_qna_answer_non_terminal ON challenge_qna_answer_attempts (qna_session_id, question_id) WHERE status IN ('created','uploading','queued','processing')`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_qna_answer_non_terminal`);
    await queryRunner.query(`DROP TABLE IF EXISTS challenge_qna_answer_attempts`);
    await queryRunner.query(`DROP TABLE IF EXISTS challenge_qna_assistance`);
    await queryRunner.query(`DROP TABLE IF EXISTS challenge_qna_questions`);
    await queryRunner.query(`DROP TABLE IF EXISTS challenge_qna_sessions`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_decks_project_deck`);
  }
}
