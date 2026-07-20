import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserDisplayNames2026072104000 implements MigrationInterface {
  name = "AddUserDisplayNames2026072104000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ADD COLUMN display_name text`);
    await queryRunner.query(`
      DO $$
      DECLARE
        user_record record;
        base_name text;
        candidate text;
        suffix integer;
      BEGIN
        FOR user_record IN
          SELECT user_id, email
          FROM users
          ORDER BY created_at, user_id
        LOOP
          base_name := btrim(split_part(user_record.email, '@', 1));
          base_name := regexp_replace(base_name, '[[:cntrl:]]', '', 'g');
          IF char_length(base_name) < 2 THEN
            base_name := 'user';
          END IF;
          base_name := left(base_name, 20);
          candidate := base_name;
          suffix := 1;

          WHILE EXISTS (
            SELECT 1
            FROM users
            WHERE display_name IS NOT NULL
              AND lower(btrim(display_name)) = lower(candidate)
          ) LOOP
            suffix := suffix + 1;
            candidate := left(
              base_name,
              20 - char_length(suffix::text) - 1
            ) || '-' || suffix::text;
          END LOOP;

          UPDATE users
          SET display_name = candidate
          WHERE user_id = user_record.user_id;
        END LOOP;
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE users
      ALTER COLUMN display_name SET NOT NULL,
      ADD CONSTRAINT chk_users_display_name_length
        CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 20),
      ADD CONSTRAINT chk_users_display_name_control_chars
        CHECK (display_name !~ '[[:cntrl:]]')
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_users_display_name_normalized
      ON users (lower(btrim(display_name)))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_users_display_name_normalized`);
    await queryRunner.query(`
      ALTER TABLE users
      DROP CONSTRAINT IF EXISTS chk_users_display_name_control_chars,
      DROP CONSTRAINT IF EXISTS chk_users_display_name_length,
      DROP COLUMN display_name
    `);
  }
}
