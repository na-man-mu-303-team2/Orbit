import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePresentationSessionAudienceRegistry2026071703000
  implements MigrationInterface
{
  name = "CreatePresentationSessionAudienceRegistry2026071703000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE presentation_session_audiences (
        project_id text NOT NULL,
        session_id text NOT NULL,
        audience_id text NOT NULL,
        joined_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (project_id, session_id, audience_id),
        CONSTRAINT fk_presentation_session_audiences_session
          FOREIGN KEY (project_id, session_id)
          REFERENCES presentation_sessions(project_id, session_id)
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      INSERT INTO presentation_session_audiences (
        project_id, session_id, audience_id, joined_at
      )
      SELECT runs.project_id, runs.session_id, responses.audience_id,
             MIN(responses.submitted_at)
      FROM activity_responses AS responses
      INNER JOIN activity_runs AS runs
        ON runs.project_id = responses.project_id
       AND runs.activity_run_id = responses.activity_run_id
      GROUP BY runs.project_id, runs.session_id, responses.audience_id
      ON CONFLICT (project_id, session_id, audience_id) DO NOTHING
    `);
    await queryRunner.query(`
      WITH audience_counts AS (
        SELECT project_id, session_id, COUNT(*)::int AS participant_count
        FROM presentation_session_audiences
        GROUP BY project_id, session_id
      )
      UPDATE activity_result_snapshots AS snapshots
      SET aggregate_json = snapshots.aggregate_json || jsonb_build_object(
        'participantCount', GREATEST(
          COALESCE(counts.participant_count, 0),
          runs.response_count
        ),
        'responseRate', CASE
          WHEN GREATEST(
            COALESCE(counts.participant_count, 0),
            runs.response_count
          ) = 0 THEN 0
          ELSE LEAST(
            100,
            ROUND(
              runs.response_count * 100.0 / GREATEST(
                COALESCE(counts.participant_count, 0),
                runs.response_count
              )
            )::int
          )
        END
      )
      FROM activity_runs AS runs
      LEFT JOIN audience_counts AS counts
        ON counts.project_id = runs.project_id
       AND counts.session_id = runs.session_id
      WHERE snapshots.project_id = runs.project_id
        AND snapshots.activity_run_id = runs.activity_run_id
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE activity_result_snapshots
      SET aggregate_json = aggregate_json - 'participantCount' - 'responseRate'
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS presentation_session_audiences`);
  }
}
