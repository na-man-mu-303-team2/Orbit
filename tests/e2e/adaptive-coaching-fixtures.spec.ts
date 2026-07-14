import { expect, test } from "@playwright/test";

import {
  coachingReportViewSchema,
  evidenceClipPlaybackResponseSchema,
  rehearsalFocusProfileRevisionConflictSchema,
} from "../../packages/shared/src";
import {
  adaptiveCoachingReportScenarios,
  evidenceClipPlaybackScenarios,
  rehearsalFocusProfileConflictScenario,
} from "../fixtures/adaptive-coaching/p0-integration-scenarios";

function collectObjectKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectObjectKeys);
  }
  if (value === null || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => [
    key,
    ...collectObjectKeys(nestedValue),
  ]);
}

test.describe("adaptive coaching P0 integration fixtures", () => {
  test("report scenarios pass the shared CoachingReportView contract", () => {
    const reports = Object.values(adaptiveCoachingReportScenarios).map(
      (scenario) => coachingReportViewSchema.parse(scenario),
    );

    expect(reports).toHaveLength(4);
    expect(adaptiveCoachingReportScenarios.ready.topActions).toHaveLength(3);
    expect(
      adaptiveCoachingReportScenarios.ready.trendSeries[0].points,
    ).toHaveLength(5);
    expect(adaptiveCoachingReportScenarios.partial.viewState).toBe("partial");
    expect(adaptiveCoachingReportScenarios.unmeasured.readiness).toBe(
      "unmeasured",
    );
    expect(
      adaptiveCoachingReportScenarios.incomparable.trendSeries[0].points[0]
        .comparability,
    ).toBe("incomparable");
    expect(reports.every((report) => report.timelineEvents.length === 0)).toBe(
      true,
    );
  });

  test("report fixtures exclude private evidence fields", () => {
    const forbiddenFields = new Set([
      "audioBytes",
      "audioFileId",
      "rawAudio",
      "script",
      "signedUrl",
      "speakerNotes",
      "storageKey",
      "transcript",
    ]);
    const exposedFields = collectObjectKeys(
      adaptiveCoachingReportScenarios,
    ).filter((key) => forbiddenFields.has(key));

    expect(exposedFields).toEqual([]);
  });

  test("focus profile conflict carries the current revision and three goals", () => {
    const conflict = rehearsalFocusProfileRevisionConflictSchema.parse(
      rehearsalFocusProfileConflictScenario,
    );

    expect(conflict.expectedRevision).toBe(2);
    expect(conflict.actualRevision).toBe(3);
    expect(conflict.currentProfile.items).toHaveLength(3);
  });

  test("evidence playback covers every bounded state", () => {
    const responses = Object.values(evidenceClipPlaybackScenarios).map(
      (scenario) => evidenceClipPlaybackResponseSchema.parse(scenario),
    );

    expect(responses.map((response) => response.state)).toEqual([
      "available",
      "failed",
      "expired",
      "deleted",
      "not-found",
    ]);
    for (const response of responses) {
      if (response.state !== "available") {
        expect(response).not.toHaveProperty("signedUrl");
        expect(response).not.toHaveProperty("expiresAt");
      }
    }
  });
});
