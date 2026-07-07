import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateReferenceChunks2026062700100 implements MigrationInterface {
  name = "CreateReferenceChunks2026062700100";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS reference_chunks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id text NOT NULL,
        file_id text NOT NULL,
        chunk_index integer NOT NULL,
        content text NOT NULL,
        content_hash text NOT NULL,
        metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        embedding vector(1536) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (project_id, file_id, chunk_index)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS reference_chunks_project_file_idx
      ON reference_chunks (project_id, file_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS reference_chunks_content_hash_idx
      ON reference_chunks (content_hash)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS reference_chunks_embedding_cosine_idx
      ON reference_chunks USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS reference_chunks_embedding_cosine_idx`);
    await queryRunner.query(`DROP INDEX IF EXISTS reference_chunks_content_hash_idx`);
    await queryRunner.query(`DROP INDEX IF EXISTS reference_chunks_project_file_idx`);
    await queryRunner.query(`DROP TABLE IF EXISTS reference_chunks`);
  }
}
