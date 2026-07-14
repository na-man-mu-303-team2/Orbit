import { describe, expect, it } from "vitest";

import { focusedPracticeTargetScopeSchema } from "./coaching-common.schema";
import {
  criterionResultSchema,
  evaluationCriterionSchema,
  reportObservationSchema,
} from "./evaluation-criterion.schema";
import { p0CoreContractFixtures } from "./p0-core-contract.fixtures";
import { presenterAidSchema } from "./presenter-aid.schema";
import {
  coachingActionSchema,
  practiceGoalSchema,
} from "./practice-goal.schema";
import {
  rehearsalAnalyzeRequestSchema,
  rehearsalAnalyzeRequestV1Schema,
  rehearsalAnalyzeRequestV2Schema,
  rehearsalAnalyzePauseV2DetailSchema,
  rehearsalAnalyzeResponseV2Schema,
  rehearsalAnalyzeSttQualityGateSchema,
} from "./rehearsal-analyze.schema";
import {
  putRehearsalFocusProfileRequestSchema,
  rehearsalFocusProfileSchema,
  rehearsalFocusProfileRevisionConflictSchema,
  rehearsalFocusProfileSnapshotSchema,
} from "./rehearsal-focus-profile.schema";
import {
  evidenceClipPlaybackResponseSchema,
  evidenceClipSchema,
  pauseV2DetailSchema,
  speechRateMeasurementSchema,
  sttQualityGateSchema,
} from "./speech-evidence.schema";
import {
  rehearsalReportMetricsSchema,
  trendSeriesSchema,
} from "../rehearsals/rehearsal.schema";

const fixtures = p0CoreContractFixtures;

describe("P0 rehearsal focus contracts", () => {
  it("parses a CAS profile and freezes its revision with inline items", () => {
    expect(
      rehearsalFocusProfileSchema.parse(fixtures.focusProfile).revision,
    ).toBe(2);
    expect(
      rehearsalFocusProfileSnapshotSchema.parse(fixtures.focusProfileSnapshot)
        .profileRef.revision,
    ).toBe(2);
    expect(
      putRehearsalFocusProfileRequestSchema.safeParse({
        expectedRevision: 2,
        items: fixtures.focusProfile.items,
      }).success,
    ).toBe(true);
    expect(
      rehearsalFocusProfileRevisionConflictSchema.parse(
        fixtures.focusProfileRevisionConflict,
      ).actualRevision,
    ).toBe(2);
  });

  it("accepts sentence targets only with a frozen text hash", () => {
    const sentenceTarget = fixtures.focusProfile.items[0].targetScope;
    expect(focusedPracticeTargetScopeSchema.parse(sentenceTarget).type).toBe(
      "sentence",
    );
    expect(
      focusedPracticeTargetScopeSchema.safeParse({
        ...sentenceTarget,
        textSnapshotHash: "not-a-hash",
      }).success,
    ).toBe(false);
  });

  it("limits focus items to three contiguous priorities", () => {
    expect(
      rehearsalFocusProfileSchema.safeParse({
        ...fixtures.focusProfile,
        items: [
          fixtures.focusProfile.items[0],
          {
            ...fixtures.focusProfile.items[0],
            focusItemId: "focus-2",
            priority: 3,
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("P0 Practice Goal Target handoff fixtures", () => {
  it("keeps Criterion, Observation, Goal, and Action identities aligned", () => {
    const cases = fixtures.practiceGoalTargetHandoff.cases;
    expect(cases.map((fixture) => fixture.name)).toEqual([
      "sentence",
      "slide",
      "slide-range",
      "opening",
      "closing",
      "full-run-only",
    ]);

    for (const fixture of cases) {
      const criterion = evaluationCriterionSchema.parse(fixture.criterion);
      const observation = reportObservationSchema.parse(fixture.observation);
      const result = criterionResultSchema.parse(fixture.criterionResult);
      const goal = practiceGoalSchema.parse(fixture.practiceGoal);
      const action = coachingActionSchema.parse(fixture.coachingAction);

      expect(result.category).toBe(criterion.category);
      expect(goal.category).toBe(criterion.category);
      expect(observation.criterionRef).toEqual(goal.criterionRef);
      expect(result.criterionRef).toEqual(goal.criterionRef);
      expect(action.criterionRef).toEqual(goal.criterionRef);
      expect(action.observationIds).toContain(observation.observationId);
      expect(action.instruction).toBe(goal.nextAction);
      expect(action.successCondition).toBe(goal.successCondition);

      if (goal.targetScope) {
        expect(action.target).toEqual({
          type: "focused-practice",
          projectId: goal.projectId,
          goalId: goal.goalId,
          sourceFullRunId: goal.originFullRunId,
        });
      } else {
        expect(goal.recommendedPracticeMode).toBe("full-run-only");
        expect(action.target.type).toBe("full-rehearsal");
      }
    }
  });

  it("represents no problem candidates as empty topActions", () => {
    expect(
      coachingActionSchema
        .array()
        .max(3)
        .parse(fixtures.practiceGoalTargetHandoff.emptyTopActions),
    ).toEqual([]);
  });
});

describe("P0 speech evidence contracts", () => {
  it("shares the exact strict TypeScript-to-Python analyze request v2 DTO", () => {
    const parsed = rehearsalAnalyzeRequestV2Schema.parse(
      fixtures.rehearsalAnalyzeRequest,
    );
    expect(parsed.contractVersion).toBe(2);
    expect(parsed.recordingDurationSeconds).toBe(12.5);
    expect(
      rehearsalAnalyzeRequestV2Schema.safeParse({
        ...fixtures.rehearsalAnalyzeRequest,
        providerPayload: "must-be-rejected",
      }).success,
    ).toBe(false);
    expect(
      rehearsalAnalyzeRequestV2Schema.safeParse({
        ...fixtures.rehearsalAnalyzeRequest,
        segments: [
          {
            ...fixtures.rehearsalAnalyzeRequest.segments[0],
            providerPayload: "must-be-rejected",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      rehearsalAnalyzeRequestV2Schema.safeParse({
        ...fixtures.rehearsalAnalyzeRequest,
        deckKeywords: [
          {
            ...fixtures.rehearsalAnalyzeRequest.deckKeywords[0],
            required: true,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      rehearsalAnalyzeRequestV2Schema.safeParse({
        ...fixtures.rehearsalAnalyzeRequest,
        slideTimeline: [
          {
            ...fixtures.rehearsalAnalyzeRequest.slideTimeline[0],
            providerPayload: "must-be-rejected",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects invalid duration, segment, timeline, and confidence evidence", () => {
    expect(
      rehearsalAnalyzeRequestV2Schema.safeParse({
        ...fixtures.rehearsalAnalyzeRequest,
        contractVersion: 1,
      }).success,
    ).toBe(false);
    expect(
      rehearsalAnalyzeRequestV2Schema.safeParse({
        ...fixtures.rehearsalAnalyzeRequest,
        runId: "x".repeat(129),
      }).success,
    ).toBe(false);
    expect(
      rehearsalAnalyzeRequestV2Schema.safeParse({
        ...fixtures.rehearsalAnalyzeRequest,
        recordingDurationSeconds: 0,
      }).success,
    ).toBe(false);
    expect(
      rehearsalAnalyzeRequestV2Schema.safeParse({
        ...fixtures.rehearsalAnalyzeRequest,
        providerDurationSeconds: Number.POSITIVE_INFINITY,
      }).success,
    ).toBe(false);
    expect(
      rehearsalAnalyzeRequestV2Schema.safeParse({
        ...fixtures.rehearsalAnalyzeRequest,
        segments: [
          {
            ...fixtures.rehearsalAnalyzeRequest.segments[0],
            endSeconds: null,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      rehearsalAnalyzeRequestV2Schema.safeParse({
        ...fixtures.rehearsalAnalyzeRequest,
        segments: [
          fixtures.rehearsalAnalyzeRequest.segments[0],
          {
            ...fixtures.rehearsalAnalyzeRequest.segments[1],
            startSeconds: 0.1,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      rehearsalAnalyzeRequestV2Schema.safeParse({
        ...fixtures.rehearsalAnalyzeRequest,
        slideTimeline: [
          {
            ...fixtures.rehearsalAnalyzeRequest.slideTimeline[0],
            enteredSecond: 2,
          },
          {
            ...fixtures.rehearsalAnalyzeRequest.slideTimeline[1],
            enteredSecond: 1,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      rehearsalAnalyzeRequestV2Schema.safeParse({
        ...fixtures.rehearsalAnalyzeRequest,
        sttConfidence: {
          value: 0.9,
          source: "provider-overall",
          normalizationProfileId: "unknown-profile",
        },
      }).success,
    ).toBe(false);
  });

  it("keeps v1 as a temporary dual-read compatibility surface", () => {
    const legacyRequest = fixtures.rehearsalAnalyzeRequestV1;
    expect(
      rehearsalAnalyzeRequestV1Schema.safeParse(legacyRequest).success,
    ).toBe(true);
    expect(rehearsalAnalyzeRequestSchema.safeParse(legacyRequest).success).toBe(
      true,
    );
    expect(
      rehearsalAnalyzeRequestV2Schema.safeParse(legacyRequest).success,
    ).toBe(false);
  });

  it("shares the strict Python-to-TypeScript analyze response v2 DTO", () => {
    const parsed = rehearsalAnalyzeResponseV2Schema.parse(
      fixtures.rehearsalAnalyzeResponse,
    );
    expect(parsed.contractVersion).toBe(2);
    expect(parsed.sttQualityGate.state).toBe("unavailable");
    expect(parsed.measurements.pauseV2.metricDefinitionVersion).toBe(2);
    expect(
      rehearsalAnalyzeResponseV2Schema.safeParse({
        ...fixtures.rehearsalAnalyzeResponse,
        providerPayload: "must-be-rejected",
      }).success,
    ).toBe(false);
    expect(
      rehearsalAnalyzeResponseV2Schema.safeParse({
        ...fixtures.rehearsalAnalyzeResponse,
        measurements: {
          ...fixtures.rehearsalAnalyzeResponse.measurements,
          duration: {
            ...fixtures.rehearsalAnalyzeResponse.measurements.duration,
            providerPayload: "must-be-rejected",
          },
        },
      }).success,
    ).toBe(false);
  });

  it("keeps the canonical CPM fixture aligned with the Unicode calculation", () => {
    const normalizedTranscript =
      fixtures.rehearsalAnalyzeRequest.transcript.normalize("NFKC");
    const characterCount = Array.from(normalizedTranscript).filter(
      (character) => /[\p{L}\p{N}]/u.test(character),
    ).length;
    const expectedCharactersPerMinute =
      (characterCount * 60) /
      fixtures.rehearsalAnalyzeRequest.recordingDurationSeconds;

    expect(characterCount).toBe(21);
    expect(expectedCharactersPerMinute).toBe(100.8);
    expect(fixtures.rehearsalAnalyzeResponse.charactersPerMinute).toBe(
      expectedCharactersPerMinute,
    );
  });

  it("enforces response measurement, count, and quality gate invariants", () => {
    expect(
      rehearsalAnalyzeResponseV2Schema.safeParse({
        ...fixtures.rehearsalAnalyzeResponse,
        charactersPerMinute: null,
      }).success,
    ).toBe(false);
    expect(
      rehearsalAnalyzeResponseV2Schema.safeParse({
        ...fixtures.rehearsalAnalyzeResponse,
        fillerWordCount: 2,
      }).success,
    ).toBe(false);
    expect(
      rehearsalAnalyzeResponseV2Schema.safeParse({
        ...fixtures.rehearsalAnalyzeResponse,
        pauseV2Details: [
          {
            ...fixtures.rehearsalAnalyzeResponse.pauseV2Details[0],
            intent: "hesitation",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      rehearsalAnalyzeResponseV2Schema.safeParse({
        ...fixtures.rehearsalAnalyzeResponse,
        sttQualityGate: {
          version: 1,
          state: "failed",
          reasonCode: "LOW_TRANSCRIPTION_CONFIDENCE",
          confidence: 0.4,
          threshold: 0.7,
          policyId: "quality-policy-1",
        },
      }).success,
    ).toBe(false);
    expect(
      rehearsalAnalyzeSttQualityGateSchema.safeParse({
        version: 1,
        state: "passed",
        reasonCode: "CONFIDENCE_ACCEPTED",
        confidence: 0.69,
        threshold: 0.7,
        policyId: "quality-policy-1",
      }).success,
    ).toBe(false);
  });

  it("rejects slide insights when filler or pause v1 is unmeasured", () => {
    const fillerUnmeasured = {
      ...fixtures.rehearsalAnalyzeResponse,
      fillerWordCount: null,
      fillerWordDetails: [],
      measurements: {
        ...fixtures.rehearsalAnalyzeResponse.measurements,
        fillerWordCount: {
          measurementState: "unmeasured",
          metricDefinitionVersion: 1,
          reasonCode: "EMPTY_TRANSCRIPT",
        },
      },
    };
    const pauseV1Unmeasured = {
      ...fixtures.rehearsalAnalyzeResponse,
      pauseCount: null,
      pauseDetails: [],
      measurements: {
        ...fixtures.rehearsalAnalyzeResponse.measurements,
        pauseV1: {
          measurementState: "unmeasured",
          metricDefinitionVersion: 1,
          reasonCode: "SEGMENT_TIMESTAMPS_UNAVAILABLE",
        },
      },
    };

    expect(
      rehearsalAnalyzeResponseV2Schema.safeParse(fillerUnmeasured).success,
    ).toBe(false);
    expect(
      rehearsalAnalyzeResponseV2Schema.safeParse({
        ...fillerUnmeasured,
        slideInsights: [],
      }).success,
    ).toBe(true);
    expect(
      rehearsalAnalyzeResponseV2Schema.safeParse(pauseV1Unmeasured).success,
    ).toBe(false);
    expect(
      rehearsalAnalyzeResponseV2Schema.safeParse({
        ...pauseV1Unmeasured,
        slideInsights: [],
      }).success,
    ).toBe(true);
  });

  it("rejects slide insights when the STT quality gate fails", () => {
    const lowConfidenceMeasurementV1 = {
      measurementState: "unmeasured" as const,
      metricDefinitionVersion: 1,
      reasonCode: "LOW_TRANSCRIPTION_CONFIDENCE" as const,
    };
    const failedQualityGateResponse = {
      ...fixtures.rehearsalAnalyzeResponse,
      charactersPerMinute: null,
      wordsPerMinute: null,
      fillerWordCount: null,
      pauseCount: null,
      keywordCoverage: null,
      sttQualityGate: {
        version: 1,
        state: "failed",
        reasonCode: "LOW_TRANSCRIPTION_CONFIDENCE",
        confidence: 0.4,
        threshold: 0.7,
        policyId: "quality-policy-1",
      },
      measurements: {
        duration: fixtures.rehearsalAnalyzeResponse.measurements.duration,
        charactersPerMinute: lowConfidenceMeasurementV1,
        wordsPerMinute: lowConfidenceMeasurementV1,
        fillerWordCount: lowConfidenceMeasurementV1,
        pauseV1: lowConfidenceMeasurementV1,
        pauseV2: {
          measurementState: "unmeasured",
          metricDefinitionVersion: 2,
          reasonCode: "LOW_TRANSCRIPTION_CONFIDENCE",
        },
        keywordCoverage: lowConfidenceMeasurementV1,
      },
      speedSamples: [],
      fillerWordDetails: [],
      pauseDetails: [],
      pauseV2Details: [],
      missedKeywords: [],
    };

    expect(
      rehearsalAnalyzeResponseV2Schema.safeParse(failedQualityGateResponse)
        .success,
    ).toBe(false);
    expect(
      rehearsalAnalyzeResponseV2Schema.safeParse({
        ...failedQualityGateResponse,
        slideInsights: [],
      }).success,
    ).toBe(true);
  });

  it("requires pause v2 position values to match their evidence source", () => {
    const pause = fixtures.rehearsalAnalyzeResponse.pauseV2Details[0];

    expect(
      rehearsalAnalyzePauseV2DetailSchema.safeParse({
        ...pause,
        positionSource: "none",
        position: "slide-transition",
      }).success,
    ).toBe(false);
    expect(
      rehearsalAnalyzePauseV2DetailSchema.safeParse({
        ...pause,
        positionSource: "slide-timeline",
        position: "within-sentence",
      }).success,
    ).toBe(false);
    expect(
      rehearsalAnalyzePauseV2DetailSchema.safeParse({
        ...pause,
        positionSource: "provider",
        position: "slide-transition",
      }).success,
    ).toBe(false);
    expect(
      rehearsalAnalyzePauseV2DetailSchema.safeParse({
        ...pause,
        positionSource: "none",
        position: "unknown",
      }).success,
    ).toBe(true);
    expect(
      rehearsalAnalyzePauseV2DetailSchema.safeParse({
        ...pause,
        positionSource: "provider",
        position: "between-sentences",
      }).success,
    ).toBe(true);
    expect(
      rehearsalAnalyzePauseV2DetailSchema.safeParse({
        ...pause,
        positionSource: "provider",
        position: "within-sentence",
      }).success,
    ).toBe(true);
  });

  it("uses CPM v1 as canonical and keeps WPM as a compatibility value", () => {
    const parsed = speechRateMeasurementSchema.parse(fixtures.speechRate);
    expect(parsed.charactersPerMinute).toBe(318);
    expect(parsed.wordsPerMinute).toBe(112);
    expect(
      speechRateMeasurementSchema.safeParse({
        ...fixtures.speechRate,
        durationSeconds: null,
      }).success,
    ).toBe(false);
    expect(
      speechRateMeasurementSchema.parse(fixtures.speechRateUnmeasured)
        .charactersPerMinute,
    ).toBeNull();
  });

  it("adds CPM to new reports and trends without breaking legacy metrics", () => {
    const baseMetrics = {
      durationSeconds: 60,
      wordsPerMinute: 112,
      fillerWordCount: 1,
      pauseCount: 1,
      keywordCoverage: 0.9,
    };
    expect(rehearsalReportMetricsSchema.safeParse(baseMetrics).success).toBe(
      true,
    );
    expect(
      rehearsalReportMetricsSchema.parse({
        ...baseMetrics,
        speechRate: fixtures.speechRate,
      }).speechRate?.charactersPerMinute,
    ).toBe(318);
    expect(
      trendSeriesSchema.safeParse({
        seriesId: "trend-cpm-1",
        projectId: "project-1",
        metric: "characters-per-minute",
        metricDefinitionVersion: 1,
        unit: "characters-per-minute",
        direction: "neutral",
        targetRange: null,
        points: [
          {
            runId: "run-1",
            createdAt: "2026-07-13T00:00:00.000Z",
            measurementState: "measured",
            comparability: "comparable",
            value: 318,
            reasonCode: null,
          },
        ],
        calculatedAt: "2026-07-13T00:10:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      trendSeriesSchema.safeParse({
        seriesId: "trend-cpm-target-1",
        projectId: "project-1",
        metric: "characters-per-minute",
        metricDefinitionVersion: 1,
        unit: "characters-per-minute",
        direction: "target-range",
        targetRange: { minimum: 250, maximum: 350 },
        points: [],
        calculatedAt: "2026-07-13T00:10:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("does not invent confidence for providers that do not supply it", () => {
    expect(
      sttQualityGateSchema.parse(fixtures.sttQualityGateWithoutConfidence)
        .confidence,
    ).toBeNull();
    expect(
      sttQualityGateSchema.parse(fixtures.sttQualityGateRejected).state,
    ).toBe("rejected");
    expect(
      sttQualityGateSchema.parse(fixtures.sttQualityGateAccepted).state,
    ).toBe("accepted");
    expect(
      sttQualityGateSchema.parse(fixtures.sttQualityGateUnavailable).state,
    ).toBe("unavailable");
    expect(
      sttQualityGateSchema.safeParse({
        ...fixtures.sttQualityGateWithoutConfidence,
        confidence: 0.8,
      }).success,
    ).toBe(false);
    expect(
      sttQualityGateSchema.safeParse({
        ...fixtures.sttQualityGateAccepted,
        confidence: 0.2,
      }).success,
    ).toBe(false);
    expect(
      sttQualityGateSchema.safeParse({
        ...fixtures.sttQualityGateRejected,
        confidence: 0.9,
      }).success,
    ).toBe(false);
  });

  it("keeps pause v2 classification unknown without provider evidence", () => {
    expect(
      pauseV2DetailSchema.parse(fixtures.pauseV2Unknown).classification,
    ).toBe("unknown");
    expect(
      pauseV2DetailSchema.safeParse({
        ...fixtures.pauseV2Unknown,
        classification: "hesitation",
      }).success,
    ).toBe(false);
  });
});

describe("P0 bounded evidence and presenter contracts", () => {
  it("limits derived clips to twelve seconds and owner-only access", () => {
    expect(evidenceClipSchema.parse(fixtures.evidenceClip).durationMs).toBe(
      12_000,
    );
    expect(
      evidenceClipSchema.safeParse({
        ...fixtures.evidenceClip,
        endMs: 15_001,
        durationMs: 12_001,
      }).success,
    ).toBe(false);
    expect(
      evidenceClipSchema.safeParse({
        ...fixtures.evidenceClip,
        accessPolicy: "project-member",
      }).success,
    ).toBe(false);
    expect(
      evidenceClipSchema.safeParse({
        ...fixtures.evidenceClip,
        expiresAt: "2026-07-21T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("keeps signed URLs only in short-lived playback responses", () => {
    expect(
      evidenceClipPlaybackResponseSchema.parse(
        fixtures.evidenceClipPlaybackAvailable,
      ).state,
    ).toBe("available");
    expect(
      evidenceClipPlaybackResponseSchema.parse(
        fixtures.evidenceClipPlaybackExpired,
      ).state,
    ).toBe("expired");
    expect(
      evidenceClipPlaybackResponseSchema.safeParse({
        ...fixtures.evidenceClipPlaybackExpired,
        signedUrl: "https://evidence.example.test/stale",
      }).success,
    ).toBe(false);
  });

  it("links clip IDs to observations without exposing URLs or file IDs", () => {
    const observation = {
      observationId: "observation-1",
      criterionRef: { criterionId: "criterion-1", revision: 1 },
      scope: { type: "slide" as const, slideId: "slide-1" },
      measurementState: "measured" as const,
      value: {
        kind: "characters-per-minute" as const,
        metricDefinitionVersion: 1 as const,
        value: 318,
      },
      evidenceRefs: [
        {
          kind: "evidence-clip" as const,
          clipId: "clip-1",
          observationId: "observation-1",
        },
      ],
      observedAt: "2026-07-13T00:00:00.000Z",
    };
    expect(
      reportObservationSchema.parse(observation).evidenceRefs[0],
    ).not.toHaveProperty("signedUrl");
    expect(
      reportObservationSchema.safeParse({
        ...observation,
        evidenceRefs: [
          {
            ...observation.evidenceRefs[0],
            observationId: "observation-other",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("bounds the presenter aid and never includes the full script", () => {
    expect(presenterAidSchema.parse(fixtures.presenterAid).scriptVisible).toBe(
      false,
    );
    expect(
      presenterAidSchema.safeParse({
        ...fixtures.presenterAid,
        keywords: ["a", "b", "c", "d"],
      }).success,
    ).toBe(false);
    expect(
      presenterAidSchema.safeParse({
        ...fixtures.presenterAid,
        script: "민감한 발표자 원문",
      }).success,
    ).toBe(false);
  });
});
