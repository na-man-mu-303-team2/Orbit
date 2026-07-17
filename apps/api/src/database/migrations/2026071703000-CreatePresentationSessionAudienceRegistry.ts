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
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS presentation_session_audiences`);
  }
}
