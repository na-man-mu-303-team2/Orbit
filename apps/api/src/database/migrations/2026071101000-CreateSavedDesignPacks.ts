import { MigrationInterface, QueryRunner } from "typeorm";

const presets = [
  ["system_startup_pitch", "Startup Pitch", "confident", "medium", "varied", "medium"],
  ["system_academic", "Academic Presentation", "professional", "high", "stable", "low"],
  ["system_corporate", "Corporate Report", "concise", "high", "stable", "low"],
  ["system_sales", "Sales Proposal", "confident", "medium", "varied", "medium"],
  ["system_education", "Education Lecture", "friendly", "medium", "varied", "medium"],
  ["system_minimal_data", "Minimal Data Deck", "concise", "low", "technical", "none"],
  ["system_brandlogy", "Brandlogy Modern", "professional", "medium", "varied", "low"]
] as const;

export class CreateSavedDesignPacks2026071101000 implements MigrationInterface {
  name = "CreateSavedDesignPacks2026071101000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS saved_design_packs (
        pack_id text PRIMARY KEY,
        owner_type text NOT NULL CHECK (owner_type IN ('system', 'user', 'organization')),
        owner_id text NOT NULL,
        name text NOT NULL,
        description text NOT NULL DEFAULT '',
        version integer NOT NULL CHECK (version > 0),
        base_style_pack_id text NOT NULL,
        preferences_json jsonb NOT NULL,
        is_default boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_saved_design_packs_owner_name
      ON saved_design_packs (owner_type, owner_id, lower(name))
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_saved_design_packs_owner_default
      ON saved_design_packs (owner_type, owner_id)
      WHERE is_default = true
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_saved_design_packs_owner_updated
      ON saved_design_packs (owner_type, owner_id, updated_at DESC)
    `);

    for (const [id, name, tone, density, layoutPreference, imageDensity] of presets) {
      await queryRunner.query(
        `
          INSERT INTO saved_design_packs (
            pack_id, owner_type, owner_id, name, description, version,
            base_style_pack_id, preferences_json, is_default, created_at, updated_at
          )
          VALUES ($1, 'system', 'orbit', $2, $3, 1, 'brandlogy-modern', $4::jsonb, false, now(), now())
          ON CONFLICT (pack_id) DO NOTHING
        `,
        [
          id,
          name,
          `ORBIT system preset: ${name}`,
          JSON.stringify({
            palette: {},
            typography: {},
            tone,
            density,
            titleStyle: "action",
            layoutPreference,
            imageDensity,
            mediaPolicy: imageDensity === "none" ? "minimal" : "balanced",
            referencePolicy: "topic-only",
            qaStrictness: "standard"
          })
        ]
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_saved_design_packs_owner_updated`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_saved_design_packs_owner_default`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_saved_design_packs_owner_name`);
    await queryRunner.query(`DROP TABLE IF EXISTS saved_design_packs`);
  }
}
