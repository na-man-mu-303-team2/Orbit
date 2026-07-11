import { deckSchema } from "@orbit/shared";
import type { EntityManager } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import type { DataSource } from "typeorm";
import type { FilesService } from "../files/files.service";
import type { JobsService } from "../jobs/jobs.service";
import type { ProjectsService } from "../projects/projects.service";
import type { ChallengeQnaEvidenceCache } from "./challenge-qna-evidence-cache";
import { buildChallengeQnaSource, ChallengeQnaService } from "./challenge-qna.service";

vi.mock("@orbit/config", () => ({
  loadOrbitConfig: () => ({ ADAPTIVE_REHEARSAL_COACH_ENABLED: true, CHALLENGE_QNA_ENABLED: true, ADAPTIVE_COACHING_PROJECT_ALLOWLIST: ["*"] }),
  isAdaptiveCoachingProjectAllowed: () => true,
}));

describe("ChallengeQnaService grounding", () => {
  it("freezes only hash-matched approved chunks inside the project", async () => {
    const deck = deckSchema.parse({
      deckId: "deck_a", projectId: "project-a", title: "Deck", version: 2,
      targetDurationMinutes: 5,
      canvas: { preset: "wide-16-9", width: 1920, height: 1080, aspectRatio: "16:9" },
      slides: [{ slideId: "slide_a", order: 1, title: "핵심", elements: [], keywords: [], semanticCues: [] }],
    });
    const query = vi.fn()
      .mockResolvedValueOnce([{ deck_id: "deck_a", goal_set_id: "set-a", evaluation_snapshot_json: { evaluationPlan: {
        briefRef: { mode: "briefed", briefId: "brief-a", revision: 2 },
        evaluatorLensRef: { lensId: "decision-maker", revision: 1 },
        approvedReferences: [{ fileId: "file-approved", fileContentHash: "a".repeat(64) }],
      } } }])
      .mockResolvedValueOnce([{ deck_id: "deck_a", version: 2, deck_json: deck }])
      .mockResolvedValueOnce([{ goal_id: "goal-a", criterion_ref_json: { criterionId: "criterion-a", revision: 1 } }])
      .mockResolvedValueOnce([{ id: "chunk-a", content: "승인된 근거", content_hash: "b".repeat(64), file_content_hash: "a".repeat(64) }]);

    const result = await buildChallengeQnaSource({ query } as unknown as EntityManager, "project-a", {
      mode: "final", sourceFullRunId: "run-a", questionCount: 3,
    });

    expect(result.groundingSnapshot.chunks).toHaveLength(1);
    expect(result.sourceSnapshot.approvedReferences).toEqual([{ fileId: "file-approved", fileContentHash: "a".repeat(64) }]);
    expect(query.mock.calls[3]?.[1]).toEqual(["project-a", "file-approved", "a".repeat(64)]);
  });

  it("does not reveal the full guide before the first answer attempt", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{ project_id: "project-a", generation_revision: 1 }])
      .mockResolvedValueOnce([{ question_id: "question-a" }])
      .mockResolvedValueOnce([]);
    const service = new ChallengeQnaService(
      { query } as unknown as DataSource,
      { assertCanWriteProject: vi.fn(async () => ({})) } as unknown as ProjectsService,
      {} as FilesService,
      {} as JobsService,
      {} as ChallengeQnaEvidenceCache,
    );

    await expect(service.revealAssistance("session-a", "question-a", "user-a", {
      questionRevision: 1,
      level: "full-guide",
    })).rejects.toMatchObject({ response: { code: "INVALID_STATE_TRANSITION" } });
  });
});
