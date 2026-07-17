import { createHash } from "node:crypto";
import type { StoragePort } from "@orbit/storage";
import type { DataSource } from "typeorm";

type DeletionRow = {
  deletion_id: string;
  project_id: string;
  file_id: string;
  storage_key: string;
  attempt_count: number;
};

type ExpiredRehearsalAudioRow = {
  project_id: string;
  file_id: string;
  storage_key: string;
  purpose: string;
};

export async function enqueueExpiredRehearsalAudioDeletions(
  dataSource: DataSource,
  batchSize = 50,
) {
  const rows = await dataSource.query(
    `
      SELECT runs.project_id, runs.audio_file_id AS file_id,
             assets.storage_key, assets.purpose
      FROM rehearsal_runs AS runs
      INNER JOIN project_assets AS assets
        ON assets.project_id = runs.project_id
       AND assets.file_id = runs.audio_file_id
      WHERE runs.status = 'succeeded'
        AND runs.raw_audio_deleted_at IS NULL
        AND runs.raw_audio_delete_deadline_at IS NOT NULL
        AND runs.raw_audio_delete_deadline_at <= now()
        AND assets.status = 'uploaded'
        AND assets.purpose = 'rehearsal-audio'
      ORDER BY runs.raw_audio_delete_deadline_at ASC
      LIMIT $1
    `,
    [batchSize],
  );

  let enqueuedCount = 0;
  for (const raw of Array.isArray(rows) ? rows : []) {
    const row = raw as ExpiredRehearsalAudioRow;
    if (!row.storage_key) continue;
    const storageKeyHash = createHash("sha256")
      .update(row.storage_key)
      .digest("hex");
    const insertResult = await dataSource.query(
      `
        INSERT INTO storage_deletion_outbox (
          deletion_id, project_id, file_id, storage_key, storage_key_hash,
          purpose, status, attempt_count, next_attempt_at, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,'pending',0,now(),now())
        ON CONFLICT (storage_key_hash) DO NOTHING
        RETURNING deletion_id
      `,
      [
        `deletion_${storageKeyHash.slice(0, 32)}`,
        row.project_id,
        row.file_id,
        row.storage_key,
        storageKeyHash,
        row.purpose,
      ],
    );
    if (Array.isArray(insertResult) && insertResult.length > 0) {
      enqueuedCount += 1;
    }
  }

  return enqueuedCount;
}

export async function enqueueExpiredSlidePracticeAudioDeletions(
  dataSource: DataSource,
  batchSize = 50,
) {
  const rows = await dataSource.query(
    `SELECT analyses.project_id, analyses.audio_file_id AS file_id,
            assets.storage_key, assets.purpose
     FROM slide_practice_audio_analyses analyses
     JOIN project_assets assets
       ON assets.project_id = analyses.project_id
      AND assets.file_id = analyses.audio_file_id
     WHERE analyses.raw_audio_deleted_at IS NULL
       AND analyses.raw_audio_delete_deadline_at <= now()
       AND assets.status IN ('pending', 'uploaded')
       AND assets.purpose = 'slide-practice-audio'
     ORDER BY analyses.raw_audio_delete_deadline_at ASC
     LIMIT $1`,
    [batchSize],
  );
  let enqueuedCount = 0;
  for (const raw of Array.isArray(rows) ? rows : []) {
    const row = raw as ExpiredRehearsalAudioRow;
    if (!row.storage_key) continue;
    const storageKeyHash = createHash("sha256").update(row.storage_key).digest("hex");
    const inserted = await dataSource.query(
      `INSERT INTO storage_deletion_outbox (
        deletion_id, project_id, file_id, storage_key, storage_key_hash,
        purpose, status, attempt_count, next_attempt_at, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,'pending',0,now(),now())
      ON CONFLICT (storage_key_hash) DO NOTHING
      RETURNING deletion_id`,
      [
        `deletion_${storageKeyHash.slice(0, 32)}`,
        row.project_id,
        row.file_id,
        row.storage_key,
        storageKeyHash,
        row.purpose,
      ],
    );
    if (Array.isArray(inserted) && inserted.length > 0) enqueuedCount += 1;
  }
  return enqueuedCount;
}

export async function reconcileStorageDeletionOutbox(
  dataSource: DataSource,
  storage: Pick<StoragePort, "removeObject">,
  batchSize = 20,
) {
  const rows = await dataSource.query(
    `
      UPDATE storage_deletion_outbox
      SET status = 'deleting'
      WHERE deletion_id IN (
        SELECT deletion_id FROM storage_deletion_outbox
        WHERE status = 'pending' AND next_attempt_at <= now()
        ORDER BY next_attempt_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING deletion_id, project_id, file_id, storage_key, attempt_count
    `,
    [batchSize],
  );
  for (const raw of Array.isArray(rows) ? rows : []) {
    const row = raw as DeletionRow;
    if (!row.storage_key) continue;
    try {
      await storage.removeObject(row.storage_key);
      const deletedAt = new Date().toISOString();
      await dataSource.transaction(async (manager) => {
        await manager.query(
          `UPDATE project_assets SET status = 'deleted', deleted_at = $3
           WHERE project_id = $1 AND file_id = $2`,
          [row.project_id, row.file_id, deletedAt],
        );
        await manager.query(
          `UPDATE rehearsal_runs SET raw_audio_deleted_at = $3, updated_at = now()
           WHERE project_id = $1 AND audio_file_id = $2 AND raw_audio_deleted_at IS NULL`,
          [row.project_id, row.file_id, deletedAt],
        );
        await manager.query(
          `UPDATE slide_practice_audio_analyses
           SET raw_audio_deleted_at = $3, cleanup_state = 'deleted', updated_at = now()
           WHERE project_id = $1 AND audio_file_id = $2 AND raw_audio_deleted_at IS NULL`,
          [row.project_id, row.file_id, deletedAt],
        );
        await manager.query(
          `UPDATE storage_deletion_outbox
           SET status = 'deleted', storage_key = NULL, deleted_at = $2,
               last_error_code = NULL
           WHERE deletion_id = $1`,
          [row.deletion_id, deletedAt],
        );
      });
    } catch {
      const nextAttempt = row.attempt_count + 1;
      await dataSource.query(
        `
          UPDATE storage_deletion_outbox
          SET status = CASE WHEN $2 >= 5 THEN 'exhausted' ELSE 'pending' END,
              attempt_count = $2,
              next_attempt_at = now() + make_interval(secs => LEAST(300, 5 * power(2, $2))::int),
              last_error_code = 'STORAGE_REMOVE_FAILED'
          WHERE deletion_id = $1 AND status = 'deleting'
        `,
        [row.deletion_id, nextAttempt],
      );
    }
  }
  return rows.length;
}
