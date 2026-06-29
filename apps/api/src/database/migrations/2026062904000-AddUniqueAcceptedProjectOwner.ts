import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUniqueAcceptedProjectOwner2026062904000
  implements MigrationInterface
{
  name = "AddUniqueAcceptedProjectOwner2026062904000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH ranked_owners AS (
        SELECT
          project_id,
          user_id,
          row_number() OVER (
            PARTITION BY project_id
            ORDER BY created_at ASC, user_id ASC
          ) AS owner_rank
        FROM project_members
        WHERE role = 'owner' AND status = 'accepted'
      )
      UPDATE project_members AS member
      SET role = 'editor'
      FROM ranked_owners
      WHERE member.project_id = ranked_owners.project_id
        AND member.user_id = ranked_owners.user_id
        AND ranked_owners.owner_rank > 1
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_project_members_unique_accepted_owner
      ON project_members (project_id)
      WHERE role = 'owner' AND status = 'accepted'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_project_members_unique_accepted_owner
    `);
  }
}
