import { MigrationInterface, QueryRunner } from "typeorm";

export class BackfillFallbackPracticeGoals2026071201000
  implements MigrationInterface
{
  name = "BackfillFallbackPracticeGoals2026071201000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await queryRunner.query(`
      WITH eligible_runs AS (
        SELECT
          runs.project_id,
          runs.run_id,
          GREATEST(runs.analysis_revision, 1) AS revision,
          COALESCE(runs.analysis_finalized_at, runs.updated_at, runs.created_at, now()) AS created_at
        FROM rehearsal_runs runs
        LEFT JOIN practice_goal_heads heads
          ON heads.project_id = runs.project_id
         AND heads.source_full_run_id = runs.run_id
        WHERE runs.status = 'succeeded'
          AND runs.evaluation_snapshot_json IS NOT NULL
          AND runs.report_json IS NOT NULL
          AND heads.current_goal_set_id IS NULL
      )
      INSERT INTO practice_goal_sets (
        goal_set_id, project_id, source_full_run_id, revision,
        source_analysis_revision, derivation_version, analysis_state,
        data_origin, created_at
      )
      SELECT
        'goalset_backfill_' || substring(encode(digest(project_id || ':' || run_id || ':fallback', 'sha256'), 'hex') from 1 for 24),
        project_id,
        run_id,
        revision,
        revision,
        1,
        'final',
        'live',
        created_at
      FROM eligible_runs
      ON CONFLICT (source_full_run_id, revision) DO NOTHING
    `);
    await queryRunner.query(`
      WITH eligible_runs AS (
        SELECT
          runs.project_id,
          runs.run_id,
          GREATEST(runs.analysis_revision, 1) AS revision,
          COALESCE(runs.analysis_finalized_at, runs.updated_at, runs.created_at, now()) AS updated_at
        FROM rehearsal_runs runs
        LEFT JOIN practice_goal_heads heads
          ON heads.project_id = runs.project_id
         AND heads.source_full_run_id = runs.run_id
        WHERE runs.status = 'succeeded'
          AND runs.evaluation_snapshot_json IS NOT NULL
          AND runs.report_json IS NOT NULL
          AND heads.current_goal_set_id IS NULL
      ),
      eligible_sets AS (
        SELECT eligible_runs.*, sets.goal_set_id
        FROM eligible_runs
        JOIN practice_goal_sets sets
          ON sets.project_id = eligible_runs.project_id
         AND sets.source_full_run_id = eligible_runs.run_id
         AND sets.revision = eligible_runs.revision
      )
      INSERT INTO practice_goal_heads (
        project_id, source_full_run_id, current_goal_set_id,
        current_analysis_revision, updated_at
      )
      SELECT project_id, run_id, goal_set_id, revision, updated_at
      FROM eligible_sets
      ON CONFLICT (source_full_run_id) DO NOTHING
    `);
    await queryRunner.query(`
      WITH zero_goal_sets AS (
        SELECT
          sets.project_id,
          sets.goal_set_id,
          sets.source_full_run_id,
          sets.created_at,
          runs.evaluation_snapshot_json
        FROM practice_goal_sets sets
        JOIN practice_goal_heads heads
          ON heads.project_id = sets.project_id
         AND heads.current_goal_set_id = sets.goal_set_id
        JOIN rehearsal_runs runs
          ON runs.project_id = sets.project_id
         AND runs.run_id = sets.source_full_run_id
        WHERE sets.analysis_state = 'final'
          AND runs.evaluation_snapshot_json IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM practice_goals goals
            WHERE goals.project_id = sets.project_id
              AND goals.goal_set_id = sets.goal_set_id
          )
      ),
      criteria AS (
        SELECT
          zero_goal_sets.*,
          criterion.value AS criterion_json,
          criterion.ordinality
        FROM zero_goal_sets
        CROSS JOIN LATERAL jsonb_array_elements(
          COALESCE(zero_goal_sets.evaluation_snapshot_json #> '{evaluationPlan,criteria}', '[]'::jsonb)
        ) WITH ORDINALITY AS criterion(value, ordinality)
        WHERE criterion.value ? 'criterionId'
          AND criterion.value ? 'revision'
          AND criterion.value ? 'category'
          AND criterion.value ? 'scope'
      ),
      ranked AS (
        SELECT
          criteria.*,
          row_number() OVER (
            PARTITION BY project_id, goal_set_id
            ORDER BY
              CASE WHEN criterion_json #>> '{scope,type}' = 'slide' THEN 0 ELSE 1 END,
              CASE criterion_json ->> 'category'
                WHEN 'semantic' THEN 0
                WHEN 'structure' THEN 1
                WHEN 'timing' THEN 2
                ELSE 3
              END,
              ordinality
          ) AS priority
        FROM criteria
      ),
      selected AS (
        SELECT *
        FROM ranked
        WHERE priority <= 3
      ),
      prepared AS (
        SELECT
          selected.*,
          encode(digest(jsonb_build_object(
            'category', criterion_json ->> 'category',
            'criterionId', criterion_json ->> 'criterionId',
            'scope', criterion_json -> 'scope'
          )::text, 'sha256'), 'hex') AS pattern_key,
          CASE criterion_json #>> '{scope,type}'
            WHEN 'slide' THEN jsonb_build_object(
              'type', 'slide',
              'scopeId', 'scope_' || substring(encode(digest(goal_set_id || ':' || (criterion_json ->> 'criterionId') || ':scope', 'sha256'), 'hex') from 1 for 24),
              'slideId', criterion_json #>> '{scope,slideId}'
            )
            WHEN 'slide-range' THEN jsonb_build_object(
              'type', 'slide-range',
              'scopeId', 'scope_' || substring(encode(digest(goal_set_id || ':' || (criterion_json ->> 'criterionId') || ':scope', 'sha256'), 'hex') from 1 for 24),
              'startSlideId', criterion_json #>> '{scope,startSlideId}',
              'endSlideId', criterion_json #>> '{scope,endSlideId}'
            )
            WHEN 'time-window' THEN jsonb_build_object(
              'type', criterion_json #>> '{scope,window}',
              'scopeId', 'scope_' || substring(encode(digest(goal_set_id || ':' || (criterion_json ->> 'criterionId') || ':scope', 'sha256'), 'hex') from 1 for 24)
            )
            ELSE NULL
          END AS target_scope_json
        FROM selected
      )
      INSERT INTO practice_goals (
        goal_id, goal_set_id, project_id, origin_full_run_id, priority,
        pattern_key, category, criterion_ref_json, target_scope_json,
        recommended_practice_mode, evidence_refs_json, problem_label,
        next_action, success_condition, measurement_state, created_at
      )
      SELECT
        'goal_backfill_' || substring(encode(digest(goal_set_id || ':' || priority || ':' || pattern_key, 'sha256'), 'hex') from 1 for 24),
        goal_set_id,
        project_id,
        source_full_run_id,
        priority::smallint,
        pattern_key,
        criterion_json ->> 'category',
        jsonb_build_object(
          'criterionId', criterion_json ->> 'criterionId',
          'revision', (criterion_json ->> 'revision')::int
        ),
        target_scope_json,
        CASE WHEN target_scope_json IS NULL THEN 'full-run-only' ELSE 'focused' END,
        '[]'::jsonb,
        left(CASE criterion_json ->> 'category'
          WHEN 'semantic' THEN '다음 리허설 확인 항목: ' || (criterion_json ->> 'label')
          WHEN 'timing' THEN regexp_replace(criterion_json ->> 'label', '\\s*목표 시간$', '') || ' 시간 배분 유지'
          WHEN 'delivery' THEN (criterion_json ->> 'label') || ' 낮은 수준 유지'
          ELSE (criterion_json ->> 'label') || ' 흐름 점검'
        END, 240),
        left(CASE criterion_json ->> 'category'
          WHEN 'semantic' THEN '핵심 메시지를 먼저 한 문장으로 말하고 근거를 이어가세요.'
          WHEN 'timing' THEN '슬라이드 시작 전에 말할 문장을 두 개로 압축하세요.'
          WHEN 'delivery' THEN '문장 사이 호흡을 일정하게 두고 불필요한 추임새를 줄이세요.'
          ELSE '도입, 전환, 마무리 문장을 먼저 정리하고 말하세요.'
        END, 240),
        left(CASE criterion_json #>> '{measurement,type}'
          WHEN 'max-duration-seconds' THEN (criterion_json #>> '{measurement,maximum}') || '초 이내로 핵심 내용을 전달합니다.'
          WHEN 'max-count' THEN CASE criterion_json #>> '{measurement,metric}'
            WHEN 'filler-word-count' THEN '반복 말버릇을 ' || (criterion_json #>> '{measurement,maximum}') || '회 이하로 유지합니다.'
            ELSE '긴 멈춤을 ' || (criterion_json #>> '{measurement,maximum}') || '회 이하로 유지합니다.'
          END
          ELSE '핵심 개념을 부분 이상 전달합니다.'
        END, 240),
        'measured',
        created_at
      FROM prepared
      ON CONFLICT (goal_id) DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM practice_goals
      WHERE goal_id LIKE 'goal_backfill_%'
    `);
    await queryRunner.query(`
      DELETE FROM practice_goal_heads
      WHERE current_goal_set_id LIKE 'goalset_backfill_%'
    `);
    await queryRunner.query(`
      DELETE FROM practice_goal_sets
      WHERE goal_set_id LIKE 'goalset_backfill_%'
    `);
  }
}
