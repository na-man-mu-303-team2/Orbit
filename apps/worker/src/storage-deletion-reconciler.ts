import type { StoragePort } from "@orbit/storage";
import type { DataSource } from "typeorm";

type DeletionRow = {
  deletion_id: string;
  project_id: string;
  file_id: string;
  storage_key: string;
  attempt_count: number;
};

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
