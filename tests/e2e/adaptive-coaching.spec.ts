import { expect, test, type Page } from "@playwright/test";

const projectId = "project_demo_1";
const runId = "run_demo_coaching_baseline";
const goalId = "goal_demo_1";
const now = "2026-07-11T00:00:00.000Z";
const hash = "a".repeat(64);

const goal = {
  goalId,
  goalSetId: "goalset_demo_coaching_baseline",
  projectId,
  originFullRunId: runId,
  priority: 1 as const,
  patternKey: hash,
  category: "semantic" as const,
  criterionRef: { criterionId: "criterion_demo_1", revision: 1 },
  targetScope: { type: "slide" as const, scopeId: "scope_demo_1", slideId: "slide_demo_1" },
  recommendedPracticeMode: "focused" as const,
  evidenceRefs: [],
  problemLabel: "핵심 결론을 먼저 전달하기",
  nextAction: "결론을 먼저 말하고 근거를 한 문장으로 연결하세요.",
  successCondition: "결론과 근거를 모두 전달합니다.",
  measurementState: "measured" as const,
  createdAt: now,
};

const plan = {
  status: "ready" as const,
  sourceFullRunId: runId,
  goalSet: {
    goalSetId: goal.goalSetId,
    projectId,
    sourceFullRunId: runId,
    revision: 1,
    sourceAnalysisRevision: 1,
    isCurrent: true,
    analysisState: "final" as const,
    dataOrigin: "fixture" as const,
    derivationVersion: 1 as const,
    goals: [goal],
    createdAt: now,
  },
  goals: [{
    ...goal,
    history: { label: "current" as const, occurrenceCount: 1, comparableRunCount: 1, lastSeenAt: now },
    canStartFocusedPractice: true,
    unavailableReason: null,
  }],
  fullRehearsalCta: { projectId, sourceGoalSetId: goal.goalSetId },
};

const focusedSession = {
  practiceSessionId: "focused_session_demo_1",
  projectId,
  deckId: "deck_demo_1",
  sourceFullRunId: runId,
  sourceGoalSetId: goal.goalSetId,
  goalIds: [goalId],
  targetScope: goal.targetScope,
  snapshot: { deckVersion: 1, briefRef: null, evaluatorLensRef: null, criterionRefs: [goal.criterionRef] },
  compatibilityState: "current" as const,
  status: "active" as const,
  dataOrigin: "fixture" as const,
  createdBy: "user_demo_1",
  createdAt: now,
  completedAt: null,
};

function qnaSession(activeQuestionOrder: number | null, status: "active" | "completed" = "active") {
  return {
    qnaSessionId: "qna_session_demo_1",
    projectId,
    deckId: "deck_demo_1",
    source: { mode: "final" as const, sourceFullRunId: runId, questionCount: 3 as const },
    sourceSnapshot: {
      snapshotVersion: 1 as const,
      projectId,
      deck: { deckId: "deck_demo_1", deckVersion: 1, deckContentHash: hash, slides: [{ slideId: "slide_demo_1", order: 1, title: "시장 진입 전략", visibleText: "시장과 실행 근거", contentHash: hash }] },
      briefRef: null,
      evaluatorLensRef: null,
      linkedGoalRefs: [{ goalId, criterionId: goal.criterionRef.criterionId, criterionRevision: 1 }],
      approvedReferences: [],
      capturedAt: now,
    },
    groundingSnapshot: null,
    status,
    generationRevision: 1,
    generationJobId: "job_qna_demo_1",
    activeQuestionOrder,
    executionMode: "fixture" as const,
    errorCode: null,
    createdBy: "user_demo_1",
    createdAt: now,
    completedAt: status === "completed" ? now : null,
  };
}

const answerGuide = {
  supportState: "grounded",
  mustIncludeConcepts: [{ conceptId: "concept_demo_1", label: "실행 근거", sourceRefs: [{ type: "slide", slideId: "slide_demo_1", deckVersion: 1, slideOrder: 1, title: "시장 진입 전략", contentHash: hash }] }],
  suggestedStructure: ["결론", "근거", "다음 행동"],
  caveats: [],
  remediation: null,
};

const questions = [1, 2, 3].map((order) => ({
  questionId: `question_demo_${order}`,
  revision: 1,
  order,
  questionType: order === 1 ? "clarification" : order === 2 ? "evidence" : "decision",
  difficulty: order === 3 ? "challenging" : "standard",
  questionText: `${order}번째 도전 질문에 답해 주세요.`,
  assistanceLevel: "none",
  answerGuide,
  conceptHints: [],
  slideHints: [],
  sourceRefs: answerGuide.mustIncludeConcepts[0].sourceRefs,
}));

function answerAttempt(order: number) {
  return {
    answerAttemptId: `answer_demo_${order}`,
    projectId,
    qnaSessionId: "qna_session_demo_1",
    questionId: `question_demo_${order}`,
    questionRevision: 1,
    attemptNumber: 1,
    inputMode: "text" as const,
    assistanceLevel: order === 1 ? "full-guide" as const : "none" as const,
    status: "succeeded" as const,
    analysisJobId: `job_answer_demo_${order}`,
    audioFileId: null,
    cleanupState: "not-required" as const,
    cleanupGeneration: 1,
    rawAudioDeletedAt: null,
    rawAudioDeleteDeadlineAt: null,
    durationMs: null,
    evidenceExpiresAt: now,
    conceptOutcomes: [{ conceptId: "concept_demo_1", outcome: "covered" as const }],
    clarity: "clear" as const,
    audienceFit: "appropriate" as const,
    errorCode: null,
    createdAt: now,
    completedAt: now,
  };
}

async function mockAdaptiveCoaching(page: Page) {
  const focusedRequestIds: string[] = [];
  const qnaRequestIds: string[] = [];
  const answered = new Set<number>();
  let activeOrder = 1;

  await page.route(`**/api/v1/projects/${projectId}/rehearsals/${runId}/practice-plan`, (route) => route.fulfill({ json: plan }));
  await page.route(`**/api/v1/projects/${projectId}/coaching-capabilities`, (route) => route.fulfill({ json: { adaptiveRehearsalCoachEnabled: true, focusedPracticeEnabled: true, challengeQnaEnabled: true } }));
  await page.route(`**/api/v1/projects/${projectId}/focused-practice-sessions`, async (route) => {
    focusedRequestIds.push((await route.request().postDataJSON()).clientRequestId);
    await route.fulfill({ json: { session: focusedSession } });
  });
  await page.route(`**/api/v1/focused-practice-sessions/${focusedSession.practiceSessionId}`, (route) => route.fulfill({ json: { session: focusedSession, attempts: [], stabilization: [] } }));
  await page.route(`**/api/v1/projects/${projectId}/challenge-qna-sessions`, async (route) => {
    qnaRequestIds.push((await route.request().postDataJSON()).clientRequestId);
    await route.fulfill({ json: { session: qnaSession(activeOrder), questions, attempts: [] } });
  });
  await page.route("**/api/v1/challenge-qna-sessions/qna_session_demo_1", (route) => route.fulfill({ json: { session: qnaSession(activeOrder), questions, attempts: [...answered].map(answerAttempt) } }));
  await page.route("**/api/v1/challenge-qna-sessions/qna_session_demo_1/questions/*/assistance", (route) => route.fulfill({ json: { session: qnaSession(activeOrder), questions, attempts: [...answered].map(answerAttempt) } }));
  await page.route("**/api/v1/challenge-qna-sessions/qna_session_demo_1/questions/*/answers", async (route) => {
    expect((await route.request().postDataJSON()).answerText).toContain("결론");
    answered.add(activeOrder);
    await route.fulfill({ json: { attempt: answerAttempt(activeOrder) } });
  });
  await page.route("**/api/v1/challenge-qna-sessions/qna_session_demo_1/advance", (route) => {
    if (activeOrder === 3) return route.fulfill({ json: { session: qnaSession(null, "completed") } });
    activeOrder += 1;
    return route.fulfill({ json: { session: qnaSession(activeOrder) } });
  });
  return { focusedRequestIds, qnaRequestIds };
}

test("adaptive coaching plan, focused practice, and three-question flow", async ({ page }) => {
  const requests = await mockAdaptiveCoaching(page);

  await page.goto(`/rehearsal/${projectId}/plan/${runId}`);
  await expect(page.getByRole("heading", { name: "다음 연습은 이 세 가지에 집중하세요." })).toBeVisible();
  await page.getByRole("button", { name: "선택한 구간 연습" }).click();
  await expect(page.getByRole("heading", { name: "한 구간만 짧게 반복하세요." })).toBeVisible();
  await expect(page.getByText("연습 가능")).toBeVisible();
  expect(new Set(requests.focusedRequestIds).size).toBe(1);

  await page.goto(`/rehearsal/${projectId}/challenge/${runId}`);
  await expect(page.getByRole("heading", { name: "질문 하나에 집중해 답해 보세요." })).toBeVisible();
  expect(new Set(requests.qnaRequestIds).size).toBe(1);

  await expect(page.getByText("전체 가이드는 첫 답변 후 열립니다.")).toBeVisible();
  await expect(page.getByRole("button", { name: "전체 가이드" })).toHaveCount(0);

  for (let order = 1; order <= 3; order += 1) {
    await expect(page.getByRole("heading", { name: `${order}번째 도전 질문에 답해 주세요.` })).toBeVisible();
    await page.getByRole("tab", { name: "텍스트" }).click();
    await page.getByLabel("답변").fill(`결론 ${order}: 근거를 바탕으로 다음 행동을 제안합니다.`);
    await page.getByRole("button", { name: "답변 제출" }).click();
    await expect(page.getByRole("heading", { name: "답변 피드백" })).toBeVisible();
    if (order === 1) {
      await page.getByRole("button", { name: "전체 가이드" }).click();
      const dialog = page.getByRole("dialog", { name: "답변 구조 가이드" });
      await expect(dialog).toBeVisible();
      await expect(page.getByRole("button", { name: "가이드 닫기" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "전체 가이드" })).toBeFocused();
    }
    await page.getByRole("button", { name: order === 3 ? "질문 연습 마치기" : "다음 질문" }).click();
  }

  await expect(page).toHaveURL(new RegExp(`/rehearsal/${projectId}/plan/${runId}$`));
});
