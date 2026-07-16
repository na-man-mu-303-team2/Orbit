import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ActivityTextModerationService } from "./activity-text-moderation.service";

function createService(target: { activity_id: string; activity_run_id: string; revision: number } | null) {
  const repository = {
    transaction: vi.fn(async (work) => work({})),
    lockTarget: vi.fn().mockResolvedValue(target),
    updateEntry: vi.fn().mockResolvedValue(undefined),
    bumpRunRevision: vi.fn().mockResolvedValue(5)
  };
  const results = {
    getPresenterResult: vi.fn().mockResolvedValue({
      result: {
        activityRunId: "activity_run_1",
        activityId: "activity_1",
        status: "results",
        revision: 5,
        responseCount: 1,
        aggregates: [],
        textEntries: []
      }
    })
  };
  const publisher = { publishResultsUpdated: vi.fn() };
  const service = new ActivityTextModerationService(
    repository as never,
    results as never,
    { info: vi.fn() } as never,
    publisher as never
  );
  return { publisher, repository, results, service };
}

describe("ActivityTextModerationService", () => {
  it("updates moderation and publishes the committed revision", async () => {
    const fixture = createService({
      activity_id: "activity_1",
      activity_run_id: "activity_run_1",
      revision: 4
    });
    await expect(fixture.service.moderate(
      "project_1",
      "session_1",
      "activity_text_1",
      { moderationStatus: "approved", answered: true, expectedRevision: 4 }
    )).resolves.toMatchObject({ result: { revision: 5 } });
    expect(fixture.repository.updateEntry).toHaveBeenCalled();
    expect(fixture.publisher.publishResultsUpdated).toHaveBeenCalledWith({
      sessionId: "session_1",
      runId: "activity_run_1",
      revision: 5
    });
  });

  it("rejects missing entries and stale revisions", async () => {
    await expect(createService(null).service.moderate(
      "project_1",
      "session_1",
      "activity_text_missing",
      { moderationStatus: "hidden", expectedRevision: 1 }
    )).rejects.toBeInstanceOf(NotFoundException);

    await expect(createService({
      activity_id: "activity_1",
      activity_run_id: "activity_run_1",
      revision: 3
    }).service.moderate(
      "project_1",
      "session_1",
      "activity_text_1",
      { moderationStatus: "hidden", expectedRevision: 2 }
    )).rejects.toBeInstanceOf(ConflictException);
  });
});
