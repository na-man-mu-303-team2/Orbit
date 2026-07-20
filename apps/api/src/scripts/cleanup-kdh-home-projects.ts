import { loadOrbitConfig, type OrbitConfig } from "@orbit/config";
import type { EntityManager } from "typeorm";
import AppDataSource from "../database/data-source";

/**
 * One-shot cleanup for the retired `kdh@orbit.com` home fixture.
 *
 * The seeder that created these ten projects has been removed from
 * `ProjectsService`, so this script only has to delete the rows it left behind.
 * Run it after the code removal is deployed - otherwise the old seeder
 * recreates everything on the next project list request.
 */

export const kdhHomeProjectOwnerEmail = "kdh@orbit.com";

export const kdhHomeCleanupConfirmToken = "delete-kdh-home-projects";

export const kdhHomeProjectIds = Array.from(
  { length: 10 },
  (_, index) => `project_kdh_home_${String(index + 1).padStart(2, "0")}`,
);

/**
 * Every table carrying a `project_id`, ordered so that a child is always
 * deleted before the table it references. Several of these foreign keys are
 * `ON DELETE RESTRICT`, so the order is load-bearing rather than cosmetic.
 */
export const kdhHomeCleanupTableOrder = [
  // Live activity runtime. `activity_runs` also references itself, which the
  // supersedes unlink below has to clear first.
  "activity_text_entries",
  "activity_responses",
  "activity_result_snapshots",
  "presentation_session_audiences",
  "activity_runs",
  "presentation_sessions",
  // Challenge Q&A. Sessions RESTRICT-reference decks, rehearsal runs and
  // focused practice, so they go before all of those.
  "challenge_qna_answer_attempts",
  "challenge_qna_assistance",
  "challenge_qna_questions",
  "challenge_qna_sessions",
  // Slide practice and question guides. All four RESTRICT-reference decks.
  "slide_practice_audio_analyses",
  "slide_question_guide_items",
  "slide_question_guides",
  "slide_practice_reports",
  "focused_practice_attempts",
  "focused_practice_sessions",
  // Adaptive coaching.
  "practice_goal_resolutions",
  "practice_goals",
  "practice_goal_heads",
  "practice_goal_sets",
  "rehearsal_evidence_clips",
  "rehearsal_focus_profiles",
  "presentation_brief_approved_references",
  "presentation_briefs",
  "project_rehearsal_summaries",
  "rehearsal_runs",
  // AI deck artifacts. Some of these no longer exist on newer revisions and
  // are skipped by the `to_regclass` guard.
  "ai_deck_reference_extraction_artifacts",
  "ai_deck_execution_artifacts",
  "ai_deck_planning_artifacts",
  "ai_deck_story_reviews",
  "ai_suggestions",
  "design_agent_messages",
  "design_agent_proposals",
  "template_blueprints",
  "reference_chunks",
  "storage_deletion_outbox",
  "demo_fixture_projects",
  // Assets must follow every RESTRICT referrer above.
  "project_assets",
  // Deck storage has no foreign key to `projects`, so it would be orphaned
  // rather than cascaded if we skipped it.
  "deck_snapshots",
  "deck_patches",
  "decks",
  "jobs",
  "project_members",
  "projects",
] as const;

export function assertKdhHomeCleanupAllowed(
  config: Pick<OrbitConfig, "APP_ENV">,
  env: NodeJS.ProcessEnv,
): void {
  if (config.APP_ENV === "production")
    throw new Error("Kdh home project cleanup is forbidden in production.");
  if (env.KDH_HOME_CLEANUP_CONFIRM !== kdhHomeCleanupConfirmToken)
    throw new Error(
      `KDH_HOME_CLEANUP_CONFIRM must be set to "${kdhHomeCleanupConfirmToken}".`,
    );
}

type Manager = Pick<EntityManager, "query">;

async function tableExists(manager: Manager, table: string): Promise<boolean> {
  if (!/^[a-z_]+$/.test(table)) throw new Error(`Unsafe table name: ${table}`);
  const rows = await manager.query<Array<{ oid: string | null }>>(
    `SELECT to_regclass($1) AS oid`,
    [`public.${table}`],
  );
  return Boolean(rows[0]?.oid);
}

async function countRows(
  manager: Manager,
  table: string,
  projectIds: string[],
): Promise<number> {
  if (!(await tableExists(manager, table))) return 0;
  const rows = await manager.query<Array<{ total: number }>>(
    `SELECT count(*)::int AS total FROM ${table} WHERE project_id = ANY($1)`,
    [projectIds],
  );
  return rows[0]?.total ?? 0;
}

async function deleteRows(
  manager: Manager,
  table: string,
  projectIds: string[],
): Promise<number> {
  if (!(await tableExists(manager, table))) return 0;
  const result = (await manager.query(
    `DELETE FROM ${table} WHERE project_id = ANY($1)`,
    [projectIds],
  )) as unknown;
  // node-postgres returns [rows, rowCount] for a DELETE without RETURNING.
  return Array.isArray(result) ? Number(result[1] ?? 0) : 0;
}

/**
 * Refuses to continue if any of the fixed project IDs is owned by someone other
 * than the fixture account, so an ID collision can never delete real work.
 */
export async function assertProjectsAreOwnedByFixtureAccount(
  manager: Manager,
  projectIds: string[],
): Promise<void> {
  const rows = await manager.query<
    Array<{ project_id: string; email: string | null }>
  >(
    `SELECT p.project_id, u.email
     FROM projects p
     LEFT JOIN users u ON u.user_id = p.created_by
     WHERE p.project_id = ANY($1)`,
    [projectIds],
  );
  const foreign = rows.filter(
    (row) => (row.email ?? "").toLowerCase() !== kdhHomeProjectOwnerEmail,
  );
  if (foreign.length > 0) {
    const detail = foreign
      .map((row) => `${row.project_id} (owner: ${row.email ?? "unknown"})`)
      .join(", ");
    throw new Error(
      `Refusing to delete projects not owned by ${kdhHomeProjectOwnerEmail}: ${detail}`,
    );
  }
}

/**
 * Fails the transaction if any table with a `project_id` column still holds a
 * target row. This catches project-scoped tables added after this script was
 * written, which would otherwise be silently orphaned.
 */
export async function assertNoResidualRows(
  manager: Manager,
  projectIds: string[],
): Promise<void> {
  const tables = await manager.query<Array<{ table_name: string }>>(
    `SELECT c.relname AS table_name
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     JOIN pg_attribute a ON a.attrelid = c.oid
                        AND a.attname = 'project_id'
                        AND a.attnum > 0 AND NOT a.attisdropped
     WHERE c.relkind = 'r' AND n.nspname = 'public'
     ORDER BY c.relname`,
  );

  const residual: string[] = [];
  for (const { table_name: table } of tables) {
    const total = await countRows(manager, table, projectIds);
    if (total > 0) residual.push(`${table}=${total}`);
  }
  if (residual.length > 0) {
    throw new Error(
      `Residual kdh home rows remain after cleanup: ${residual.join(", ")}. ` +
        "Add the missing tables to kdhHomeCleanupTableOrder.",
    );
  }
}

export type CleanupCounts = Record<string, number>;

async function runDryRun(projectIds: string[]): Promise<CleanupCounts> {
  const counts: CleanupCounts = {};
  for (const table of kdhHomeCleanupTableOrder) {
    const total = await countRows(AppDataSource.manager, table, projectIds);
    if (total > 0) counts[table] = total;
  }
  await assertProjectsAreOwnedByFixtureAccount(AppDataSource.manager, projectIds);
  return counts;
}

async function runApply(projectIds: string[]): Promise<CleanupCounts> {
  return AppDataSource.transaction(async (manager) => {
    await assertProjectsAreOwnedByFixtureAccount(manager, projectIds);

    // `activity_runs.supersedes_activity_run_id` is a self-referential
    // RESTRICT, which a bulk delete would trip on. Unlink first.
    if (await tableExists(manager, "activity_runs")) {
      await manager.query(
        `UPDATE activity_runs SET supersedes_activity_run_id = NULL
         WHERE project_id = ANY($1)`,
        [projectIds],
      );
    }
    if (await tableExists(manager, "presentation_sessions")) {
      await manager.query(
        `UPDATE presentation_sessions SET active_activity_run_id = NULL
         WHERE project_id = ANY($1)`,
        [projectIds],
      );
    }

    const counts: CleanupCounts = {};
    for (const table of kdhHomeCleanupTableOrder) {
      const deleted = await deleteRows(manager, table, projectIds);
      if (deleted > 0) counts[table] = deleted;
    }

    await assertNoResidualRows(manager, projectIds);
    return counts;
  });
}

export async function cleanupKdhHomeProjects(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ apply: boolean; counts: CleanupCounts }> {
  const config = loadOrbitConfig(env, { service: "api" });
  const apply = argv.includes("--apply") || env.KDH_HOME_CLEANUP_APPLY === "true";
  if (apply) assertKdhHomeCleanupAllowed(config, env);

  await AppDataSource.initialize();
  try {
    const counts = apply
      ? await runApply(kdhHomeProjectIds)
      : await runDryRun(kdhHomeProjectIds);
    return { apply, counts };
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  void cleanupKdhHomeProjects()
    .then(({ apply, counts }) => {
      const entries = Object.entries(counts);
      const breakdown = entries.length
        ? entries.map(([table, total]) => `  ${table}: ${total}`).join("\n")
        : "  (none)";
      console.log(
        apply
          ? `Kdh home project cleanup applied. Deleted rows:\n${breakdown}`
          : `Kdh home project cleanup dry run. Rows that would be deleted:\n${breakdown}\n` +
              `Re-run with --apply and KDH_HOME_CLEANUP_CONFIRM=${kdhHomeCleanupConfirmToken} to delete them.`,
      );
    })
    .catch((error: unknown) => {
      console.error(
        error instanceof Error ? error.message : "Kdh home project cleanup failed.",
      );
      process.exitCode = 1;
    });
}
