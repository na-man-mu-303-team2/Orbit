import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDesignAgentMotionPlan2026072301000 implements MigrationInterface {
  name = "AddDesignAgentMotionPlan2026072301000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE design_agent_proposals
      ADD COLUMN motion_plan_json jsonb,
      ADD CONSTRAINT ck_design_agent_proposals_motion_plan
        CHECK (
          motion_plan_json IS NULL
          OR jsonb_typeof(motion_plan_json) = 'object'
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE design_agent_proposals
      DROP CONSTRAINT IF EXISTS ck_design_agent_proposals_motion_plan,
      DROP COLUMN IF EXISTS motion_plan_json
    `);
  }
}
