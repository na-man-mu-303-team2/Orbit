import type { DataSource } from "typeorm";

export async function deleteExpiredSlidePracticeData(dataSource: DataSource) {
  return dataSource.transaction(async (manager) => {
    const analysisRows = await manager.query(
      `DELETE FROM slide_practice_audio_analyses
       WHERE expires_at <= now() AND raw_audio_deleted_at IS NOT NULL
       RETURNING analysis_id`,
    );
    const reportRows = await manager.query(
      `DELETE FROM slide_practice_reports WHERE expires_at <= now() RETURNING report_id`,
    );
    const baselineRows = await manager.query(
      `DELETE FROM user_voice_baselines WHERE expires_at <= now() RETURNING user_id`,
    );
    return {
      analysisCount: rowCount(analysisRows),
      reportCount: rowCount(reportRows),
      baselineCount: rowCount(baselineRows),
    };
  });
}

function rowCount(value: unknown) {
  if (!Array.isArray(value)) return 0;
  const rows = Array.isArray(value[0]) ? value[0] : value;
  return rows.length;
}
