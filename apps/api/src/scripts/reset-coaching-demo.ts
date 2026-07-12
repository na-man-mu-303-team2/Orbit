import { loadOrbitConfig, type OrbitConfig } from "@orbit/config";
import {
  createRehearsalEvaluationSnapshot,
  deckSchema,
  type Deck,
  type RehearsalEvaluationPlan,
} from "@orbit/shared";
import { createHash } from "node:crypto";
import type { EntityManager } from "typeorm";
import AppDataSource from "../database/data-source";
import { buildRehearsalEvaluationPlan, deckContentHash } from "../practice-goals/evaluation-plan";

export function assertDemoResetAllowed(config: OrbitConfig) {
  if (config.APP_ENV === "production") throw new Error("Demo coaching reset is forbidden in production.");
  if (!config.DEMO_COACHING_FIXTURE_ENABLED) throw new Error("DEMO_COACHING_FIXTURE_ENABLED must be true.");
  if (!config.DEMO_FIXTURE_ENV_ALLOWLIST.includes(config.APP_ENV)) throw new Error("APP_ENV is not included in DEMO_FIXTURE_ENV_ALLOWLIST.");
  if (!config.ADAPTIVE_COACHING_PROJECT_ALLOWLIST.includes("*") && !config.ADAPTIVE_COACHING_PROJECT_ALLOWLIST.includes(config.DEMO_PROJECT_ID)) throw new Error("Demo project is not included in ADAPTIVE_COACHING_PROJECT_ALLOWLIST.");
}

export function createDemoRunEvaluationSnapshot(
  deck: Deck,
  evaluationPlan: RehearsalEvaluationPlan,
  capturedAt: string = new Date().toISOString(),
) {
  return createRehearsalEvaluationSnapshot(deck, capturedAt, {
    deckContentHash: deckContentHash(deck),
    evaluationPlan,
  });
}

export async function ensureDemoProjectAccess(
  manager: { query(sql: string, params: unknown[]): Promise<unknown> },
  config: Pick<OrbitConfig, "DEMO_PROJECT_ID" | "DEMO_WORKSPACE_ID">,
) {
  await manager.query(
    `INSERT INTO project_members (project_id,user_id,role,status,created_at)
      SELECT $1,participants.user_id,'editor','accepted',now()
      FROM (
        SELECT projects.created_by AS user_id
        FROM projects
        JOIN users ON users.user_id=projects.created_by
        WHERE projects.workspace_id=$2
        UNION
        SELECT members.user_id
        FROM project_members members
        JOIN projects ON projects.project_id=members.project_id
        WHERE projects.workspace_id=$2 AND members.status='accepted'
      ) participants
      ON CONFLICT (project_id,user_id) DO UPDATE SET
        role=CASE WHEN project_members.role='owner' THEN 'owner' ELSE 'editor' END,
        status='accepted'`,
    [config.DEMO_PROJECT_ID, config.DEMO_WORKSPACE_ID],
  );
}

export async function resetCoachingDemo() {
  const config = loadOrbitConfig(process.env, { service: "api" });
  assertDemoResetAllowed(config);
  await AppDataSource.initialize();
  try {
    const counts = await AppDataSource.transaction(async (manager: EntityManager) => {
      const project = await manager.query(`SELECT 1 FROM projects WHERE project_id=$1 FOR UPDATE`, [config.DEMO_PROJECT_ID]);
      if (!project[0]) throw new Error("Canonical demo project does not exist.");
      await ensureDemoProjectAccess(manager, config);
      await manager.query(`DELETE FROM challenge_qna_sessions WHERE project_id=$1`, [config.DEMO_PROJECT_ID]);
      await manager.query(`DELETE FROM focused_practice_sessions WHERE project_id=$1`, [config.DEMO_PROJECT_ID]);
      await manager.query(`DELETE FROM practice_goal_sets WHERE project_id=$1`, [config.DEMO_PROJECT_ID]);
      await manager.query(`DELETE FROM storage_deletion_outbox WHERE project_id=$1`, [config.DEMO_PROJECT_ID]);
      await manager.query(`DELETE FROM jobs WHERE project_id=$1 AND type IN ('focused-practice-analysis','challenge-qna-generation','challenge-qna-answer-analysis','private-audio-cleanup')`, [config.DEMO_PROJECT_ID]);
      const deckRow = (await manager.query(`SELECT deck_json FROM decks WHERE project_id=$1 AND deck_id=$2`, [config.DEMO_PROJECT_ID, config.DEMO_DECK_ID]))[0];
      if (!deckRow) throw new Error("Canonical demo deck does not exist.");
      const deck = deckSchema.parse(deckRow.deck_json);
      const evaluationPlan = buildRehearsalEvaluationPlan({ deck, brief: null, sourceGoalSetRef: null });
      const evaluationSnapshot = createDemoRunEvaluationSnapshot(deck, evaluationPlan);
      const runId = "run_demo_coaching_baseline";
      const goalSetId = "goalset_demo_coaching_baseline";
      await manager.query(`INSERT INTO rehearsal_runs (run_id,project_id,deck_id,status,error,created_at,updated_at,transcript_retained,meta_json,deck_version,evaluation_snapshot_json,semantic_evaluation_mode,analysis_revision,analysis_finalized_at)
        VALUES ($1,$2,$3,'succeeded',NULL,now(),now(),false,'{}'::jsonb,$4,$5,'full',1,now()) ON CONFLICT (run_id) DO UPDATE SET status='succeeded',deck_version=EXCLUDED.deck_version,evaluation_snapshot_json=EXCLUDED.evaluation_snapshot_json,analysis_revision=1,analysis_finalized_at=now(),updated_at=now()`,
        [runId,config.DEMO_PROJECT_ID,config.DEMO_DECK_ID,deck.version,evaluationSnapshot]);
      await manager.query(`INSERT INTO practice_goal_sets (goal_set_id,project_id,source_full_run_id,revision,source_analysis_revision,derivation_version,analysis_state,data_origin,created_at) VALUES ($1,$2,$3,1,1,1,'final','fixture',now())`, [goalSetId,config.DEMO_PROJECT_ID,runId]);
      const slides = deck.slides.slice(0,3);
      for (let index=0;index<3;index+=1) {
        const slide=slides[index] ?? deck.slides[0]; const criterion=evaluationPlan.criteria[index] ?? evaluationPlan.criteria[0];
        const pattern=createHash("sha256").update(`${criterion.criterionId}:${slide.slideId}:${index}`).digest("hex");
        await manager.query(`INSERT INTO practice_goals (goal_id,goal_set_id,project_id,origin_full_run_id,priority,pattern_key,category,criterion_ref_json,target_scope_json,recommended_practice_mode,evidence_refs_json,problem_label,next_action,success_condition,measurement_state,created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'focused','[]'::jsonb,$10,$11,$12,'measured',now())`,[
          `goal_demo_${index+1}`,goalSetId,config.DEMO_PROJECT_ID,runId,index+1,pattern,criterion.category,
          {criterionId:criterion.criterionId,revision:criterion.revision},{type:"slide",scopeId:`scope_demo_${index+1}`,slideId:slide.slideId},
          `${slide.title} 전달을 더 선명하게`,"핵심 결론을 먼저 말하고 근거를 한 문장으로 연결하세요.","목표 시간 안에 결론과 근거를 모두 전달합니다.",
        ]);
      }
      await manager.query(`INSERT INTO practice_goal_heads (project_id,source_full_run_id,current_goal_set_id,current_analysis_revision,updated_at) VALUES ($1,$2,$3,1,now())`, [config.DEMO_PROJECT_ID,runId,goalSetId]);
      await manager.query(`INSERT INTO demo_fixture_projects (project_id,fixture_version,created_at) VALUES ($1,'adaptive-coaching-m1',now()) ON CONFLICT (project_id) DO UPDATE SET fixture_version=EXCLUDED.fixture_version,created_at=EXCLUDED.created_at`, [config.DEMO_PROJECT_ID]);
      const rows = await manager.query(`SELECT
        (SELECT count(*)::int FROM demo_fixture_projects WHERE project_id=$1) AS markers,
        (SELECT count(*)::int FROM challenge_qna_sessions WHERE project_id=$1) AS qna_sessions,
        (SELECT count(*)::int FROM focused_practice_sessions WHERE project_id=$1) AS focused_sessions,
        (SELECT count(*)::int FROM practice_goals WHERE project_id=$1 AND goal_set_id='goalset_demo_coaching_baseline') AS goals`, [config.DEMO_PROJECT_ID]);
      return rows[0];
    });
    if (counts.markers !== 1 || counts.qna_sessions !== 0 || counts.focused_sessions !== 0 || counts.goals !== 3) throw new Error("Demo reset count verification failed.");
    return counts as { markers: number; qna_sessions: number; focused_sessions: number; goals: number };
  } finally { await AppDataSource.destroy(); }
}

if (require.main === module) {
  void resetCoachingDemo().then((counts) => console.log(`Adaptive coaching demo reset complete: marker=${counts.markers}, goals=${counts.goals}, qna=${counts.qna_sessions}, focused=${counts.focused_sessions}`)).catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Demo reset failed."); process.exitCode = 1; });
}
