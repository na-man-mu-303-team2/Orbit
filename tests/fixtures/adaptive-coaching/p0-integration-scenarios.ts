const projectId = "project_fixture_coaching";
const runId = "run_fixture_current";
const evaluatedAt = "2026-07-13T09:00:00.000Z";

const criterionRefs = {
  fillerWords: { criterionId: "criterion_fixture_filler_words", revision: 1 },
  timing: { criterionId: "criterion_fixture_timing", revision: 1 },
  conclusion: { criterionId: "criterion_fixture_conclusion", revision: 1 },
} as const;

const observations = {
  fillerWords: {
    observationId: "observation_fixture_filler_words",
    criterionRef: criterionRefs.fillerWords,
    scope: { type: "slide", slideId: "slide_fixture_2" },
    measurementState: "measured",
    value: { kind: "count", metric: "filler-word-count", value: 3 },
    evidenceRefs: [
      {
        kind: "time-range",
        slideId: "slide_fixture_2",
        startMs: 31_000,
        endMs: 38_500,
      },
      {
        kind: "evidence-clip",
        clipId: "clip_fixture_filler_words",
        observationId: "observation_fixture_filler_words",
      },
    ],
    observedAt: evaluatedAt,
  },
  timing: {
    observationId: "observation_fixture_timing",
    criterionRef: criterionRefs.timing,
    scope: { type: "slide", slideId: "slide_fixture_4" },
    measurementState: "measured",
    value: { kind: "duration-seconds", value: 82 },
    evidenceRefs: [
      {
        kind: "time-range",
        slideId: "slide_fixture_4",
        startMs: 91_000,
        endMs: 173_000,
      },
    ],
    observedAt: evaluatedAt,
  },
  conclusion: {
    observationId: "observation_fixture_conclusion",
    criterionRef: criterionRefs.conclusion,
    scope: { type: "time-window", window: "closing" },
    measurementState: "measured",
    value: { kind: "semantic", value: "missed" },
    evidenceRefs: [
      {
        kind: "semantic-cue",
        slideId: "slide_fixture_6",
        cueId: "cue_fixture_conclusion",
        cueRevision: 2,
      },
    ],
    observedAt: evaluatedAt,
  },
} as const;

const criterionResults = {
  fillerWords: {
    criterionRef: criterionRefs.fillerWords,
    category: "delivery",
    scope: observations.fillerWords.scope,
    measurementState: "measured",
    evaluationStatus: "failed",
    observationId: observations.fillerWords.observationId,
    reasonCode: "THRESHOLD_EXCEEDED",
    evaluatedAt,
  },
  timing: {
    criterionRef: criterionRefs.timing,
    category: "timing",
    scope: observations.timing.scope,
    measurementState: "measured",
    evaluationStatus: "partial",
    observationId: observations.timing.observationId,
    reasonCode: "PARTIAL",
    evaluatedAt,
  },
  conclusion: {
    criterionRef: criterionRefs.conclusion,
    category: "semantic",
    scope: observations.conclusion.scope,
    measurementState: "measured",
    evaluationStatus: "failed",
    observationId: observations.conclusion.observationId,
    reasonCode: "CONCEPT_MISSED",
    evaluatedAt,
  },
  unmeasured: {
    criterionRef: { criterionId: "criterion_fixture_volume", revision: 1 },
    category: "delivery",
    scope: { type: "run" },
    measurementState: "unmeasured",
    evaluationStatus: "not-evaluated",
    observationId: null,
    reasonCode: "NO_MEASUREMENT",
    evaluatedAt,
  },
} as const;

const actions = {
  fillerWords: {
    actionId: "action_fixture_filler_words",
    priority: 1,
    criterionRef: criterionRefs.fillerWords,
    observationIds: [observations.fillerWords.observationId],
    label: "습관어 없이 핵심 수치 설명하기",
    detail: "문제 구간을 확인한 뒤 같은 문장을 짧게 반복합니다.",
    audienceImpact: "반복되는 습관어가 핵심 수치의 신뢰를 낮출 수 있습니다.",
    instruction: "두 번째 슬라이드의 수치를 습관어 없이 한 문장으로 말합니다.",
    successCondition: "같은 구간에서 습관어를 한 번 이하로 사용합니다.",
    target: {
      type: "focused-practice",
      projectId,
      goalId: "goal_fixture_filler_words",
      sourceFullRunId: runId,
    },
    availability: "available",
    unavailableReason: null,
  },
  timing: {
    actionId: "action_fixture_timing",
    priority: 2,
    criterionRef: criterionRefs.timing,
    observationIds: [observations.timing.observationId],
    label: "설명이 길어진 구간 확인하기",
    detail: "목표 시간을 넘긴 구간의 수치 근거를 확인합니다.",
    audienceImpact:
      "한 슬라이드에 시간이 몰리면 발표 흐름을 따라가기 어렵습니다.",
    instruction: "근거 두 개만 남기고 설명 순서를 다시 정합니다.",
    successCondition: "네 번째 슬라이드를 60초 안에 설명합니다.",
    target: {
      type: "report-evidence",
      projectId,
      runId,
      observationId: observations.timing.observationId,
    },
    availability: "available",
    unavailableReason: null,
  },
  conclusion: {
    actionId: "action_fixture_conclusion",
    priority: 3,
    criterionRef: criterionRefs.conclusion,
    observationIds: [observations.conclusion.observationId],
    label: "마지막 결론을 포함해 전체 발표하기",
    detail: "마지막 슬라이드에서 결론과 다음 행동을 함께 말합니다.",
    audienceImpact:
      "결론이 빠지면 청중이 무엇을 결정해야 하는지 알기 어렵습니다.",
    instruction: "결론 한 문장과 다음 행동 한 문장으로 발표를 끝냅니다.",
    successCondition: "다음 전체 발표에서 결론 의미 기준을 충족합니다.",
    target: {
      type: "full-rehearsal",
      projectId,
      sourceGoalSetId: "goal_set_fixture_current",
    },
    availability: "available",
    unavailableReason: null,
  },
} as const;

const reportBase = {
  runId,
  projectId,
  practiceVerification: null,
  timelineEvents: [],
  qnaAssessment: null,
  generatedAt: evaluatedAt,
} as const;

export const adaptiveCoachingReportScenarios = {
  ready: {
    ...reportBase,
    reportId: "coaching_report_fixture_ready",
    viewState: "ready",
    readiness: "needs-practice",
    criterionResults: [
      criterionResults.fillerWords,
      criterionResults.timing,
      criterionResults.conclusion,
    ],
    observations: [
      observations.fillerWords,
      observations.timing,
      observations.conclusion,
    ],
    topActions: [actions.fillerWords, actions.timing, actions.conclusion],
    trendSeries: [
      {
        seriesId: "trend_fixture_filler_words",
        projectId,
        metric: "filler-word-count",
        metricDefinitionVersion: 1,
        unit: "count",
        direction: "lower-is-better",
        targetRange: null,
        points: [5, 4, 4, 3, 3].map((value, index) => ({
          runId: index === 4 ? runId : `run_fixture_${index + 1}`,
          createdAt: `2026-07-${String(index + 9).padStart(2, "0")}T09:00:00.000Z`,
          measurementState: "measured" as const,
          comparability: "comparable" as const,
          value,
          reasonCode: null,
        })),
        calculatedAt: evaluatedAt,
      },
    ],
    nextPracticePlan: {
      steps: [
        { order: 1, action: actions.fillerWords },
        { order: 2, action: actions.timing },
        { order: 3, action: actions.conclusion },
      ],
    },
  },
  partial: {
    ...reportBase,
    reportId: "coaching_report_fixture_partial",
    viewState: "partial",
    readiness: "needs-practice",
    criterionResults: [criterionResults.timing],
    observations: [observations.timing],
    topActions: [
      {
        ...actions.timing,
        actionId: "action_fixture_partial_timing",
        priority: 1,
      },
    ],
    trendSeries: [],
    nextPracticePlan: {
      steps: [
        {
          order: 1,
          action: {
            ...actions.timing,
            actionId: "action_fixture_partial_timing",
            priority: 1,
          },
        },
      ],
    },
  },
  unmeasured: {
    ...reportBase,
    reportId: "coaching_report_fixture_unmeasured",
    viewState: "partial",
    readiness: "unmeasured",
    criterionResults: [criterionResults.unmeasured],
    observations: [],
    topActions: [],
    trendSeries: [],
    nextPracticePlan: { steps: [] },
  },
  incomparable: {
    ...reportBase,
    reportId: "coaching_report_fixture_incomparable",
    viewState: "ready",
    readiness: "needs-practice",
    criterionResults: [criterionResults.fillerWords],
    observations: [observations.fillerWords],
    topActions: [actions.fillerWords],
    trendSeries: [
      {
        seriesId: "trend_fixture_incomparable",
        projectId,
        metric: "filler-word-count",
        metricDefinitionVersion: 1,
        unit: "count",
        direction: "lower-is-better",
        targetRange: null,
        points: [
          {
            runId,
            createdAt: evaluatedAt,
            measurementState: "measured",
            comparability: "incomparable",
            value: 3,
            reasonCode: "DECK_CHANGED",
          },
        ],
        calculatedAt: evaluatedAt,
      },
    ],
    nextPracticePlan: {
      steps: [{ order: 1, action: actions.fillerWords }],
    },
  },
} as const;

export const rehearsalFocusProfileConflictScenario = {
  code: "REHEARSAL_FOCUS_PROFILE_REVISION_CONFLICT",
  expectedRevision: 2,
  actualRevision: 3,
  currentProfile: {
    profileId: "focus_profile_fixture",
    projectId,
    revision: 3,
    items: [
      {
        focusItemId: "focus_item_fixture_opening",
        priority: 1,
        kind: "opening",
        label: "도입부에서 발표 목적을 먼저 말하기",
        targetScope: null,
      },
      {
        focusItemId: "focus_item_fixture_timing",
        priority: 2,
        kind: "timing",
        label: "네 번째 슬라이드를 60초 안에 설명하기",
        targetScope: {
          type: "slide",
          scopeId: "scope_fixture_timing",
          slideId: "slide_fixture_4",
        },
      },
      {
        focusItemId: "focus_item_fixture_closing",
        priority: 3,
        kind: "closing",
        label: "결론과 다음 행동으로 발표 끝내기",
        targetScope: { type: "closing", scopeId: "scope_fixture_closing" },
      },
    ],
    createdBy: "user_fixture_owner",
    updatedBy: "user_fixture_owner",
    createdAt: "2026-07-13T08:00:00.000Z",
    updatedAt: evaluatedAt,
  },
} as const;

export const evidenceClipPlaybackScenarios = {
  available: {
    state: "available",
    clipId: "clip_fixture_filler_words",
    signedUrl: "https://evidence.invalid/clips/clip_fixture_filler_words",
    expiresAt: "2026-07-13T09:15:00.000Z",
  },
  failed: { state: "failed", clipId: "clip_fixture_failed" },
  expired: { state: "expired", clipId: "clip_fixture_expired" },
  deleted: { state: "deleted", clipId: "clip_fixture_deleted" },
  notFound: { state: "not-found", clipId: "clip_fixture_missing" },
} as const;
