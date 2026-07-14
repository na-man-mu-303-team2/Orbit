import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateDesignAgentTables2026071101000
  implements MigrationInterface
{
  name = "CreateDesignAgentTables2026071101000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS design_agent_messages (
        message_id text PRIMARY KEY,
        session_id text NOT NULL,
        project_id text NOT NULL,
        actor_user_id text NOT NULL,
        deck_id text NOT NULL,
        slide_id text NOT NULL,
        role text NOT NULL CHECK (role IN ('user', 'assistant')),
        content text NOT NULL CHECK (length(btrim(content)) > 0),
        status text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
        context_json jsonb,
        error_code text,
        error_message text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_design_agent_messages_project
          FOREIGN KEY (project_id)
          REFERENCES projects (project_id)
          ON DELETE CASCADE,
        CONSTRAINT ck_design_agent_messages_context
          CHECK (context_json IS NULL OR jsonb_typeof(context_json) = 'object')
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS design_agent_proposals (
        proposal_id text PRIMARY KEY,
        project_id text NOT NULL,
        deck_id text NOT NULL,
        slide_id text NOT NULL,
        request_message_id text NOT NULL,
        response_message_id text,
        base_version integer NOT NULL CHECK (base_version > 0),
        title text NOT NULL,
        summary text,
        operations jsonb NOT NULL,
        interpreted_intent jsonb,
        affected_element_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
        status text NOT NULL CHECK (
          status IN ('pending', 'applied', 'rejected', 'stale', 'failed')
        ),
        applied_change_id text,
        rejected_reason text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_design_agent_proposals_project
          FOREIGN KEY (project_id)
          REFERENCES projects (project_id)
          ON DELETE CASCADE,
        CONSTRAINT fk_design_agent_proposals_request_message
          FOREIGN KEY (request_message_id)
          REFERENCES design_agent_messages (message_id)
          ON DELETE CASCADE,
        CONSTRAINT fk_design_agent_proposals_response_message
          FOREIGN KEY (response_message_id)
          REFERENCES design_agent_messages (message_id)
          ON DELETE SET NULL,
        CONSTRAINT ck_design_agent_proposals_operations
          CHECK (
            jsonb_typeof(operations) = 'array'
            AND jsonb_array_length(operations) > 0
          ),
        CONSTRAINT ck_design_agent_proposals_intent
          CHECK (
            interpreted_intent IS NULL
            OR jsonb_typeof(interpreted_intent) = 'object'
          ),
        CONSTRAINT ck_design_agent_proposals_affected_elements
          CHECK (jsonb_typeof(affected_element_ids) = 'array'),
        CONSTRAINT ck_design_agent_proposals_warnings
          CHECK (jsonb_typeof(warnings) = 'array')
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS design_agent_proposals`);
    await queryRunner.query(`DROP TABLE IF EXISTS design_agent_messages`);
  }
}
