import { MigrationInterface, QueryRunner } from "typeorm";

export class BackfillFocusedPracticeGoalSetRef2026071501000 implements MigrationInterface {
  name = "BackfillFocusedPracticeGoalSetRef2026071501000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE focused_practice_sessions sessions
      SET snapshot_json = jsonb_set(
        sessions.snapshot_json,
        '{goalSetRef}',
        jsonb_build_object(
          'goalSetId', goal_sets.goal_set_id,
          'revision', goal_sets.revision
        ),
        true
      )
      FROM practice_goal_sets goal_sets
      WHERE goal_sets.project_id = sessions.project_id
        AND goal_sets.goal_set_id = sessions.source_goal_set_id
        AND (
          sessions.snapshot_json->'goalSetRef' IS NULL
          OR sessions.snapshot_json->'goalSetRef' <> jsonb_build_object(
            'goalSetId', goal_sets.goal_set_id,
            'revision', goal_sets.revision
          )
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE focused_practice_sessions
      SET snapshot_json = snapshot_json - 'goalSetRef'
      WHERE snapshot_json ? 'goalSetRef'
    `);
  }
}
