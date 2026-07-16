import { describe, expect, it, vi } from "vitest";

import type { ActivityResultsRepository } from "./activity-results.repository";
import { ActivityResultsService } from "./activity-results.service";

const definition = {
  activityId: "activity_1",
  template: "satisfaction" as const,
  title: "만족도",
  description: "",
  questions: [
    {
      questionId: "question_rating",
      type: "rating" as const,
      prompt: "평점",
      required: true,
      leftLabel: "낮음",
      rightLabel: "높음"
    },
    {
      questionId: "question_text",
      type: "free-text" as const,
      prompt: "의견",
      required: false
    }
  ],
  allowDisplayName: true,
  hideResultsUntilReveal: true
};

const run = {
  activity_run_id: "activity_run_1",
  project_id: "project_1",
  session_id: "session_1",
  activity_id: "activity_1",
  source_slide_id: "slide_1",
  version: 1,
  supersedes_activity_run_id: null,
  definition_snapshot: definition,
  definition_fingerprint: "fingerprint-1",
  status: "results" as const,
  revision: 5,
  is_current: true,
  response_count: 2,
  opened_at: "2026-07-17T00:00:00.000Z",
  closed_at: "2026-07-17T00:10:00.000Z",
  revealed_at: "2026-07-17T00:11:00.000Z",
  created_at: "2026-07-17T00:00:00.000Z",
  updated_at: "2026-07-17T00:11:00.000Z"
};

const responses = [
  {
    response_id: "activity_response_1",
    answers_json: [
      { questionId: "question_rating", type: "rating", value: 5 },
      { questionId: "question_text", type: "free-text", text: "공개 의견" }
    ],
    display_name: "PRIVATE_NAME_SENTINEL",
    revision: 1,
    submitted_at: "2026-07-17T00:05:00.000Z",
    updated_at: "2026-07-17T00:05:00.000Z"
  },
  {
    response_id: "activity_response_2",
    answers_json: [{ questionId: "question_rating", type: "rating", value: 3 }],
    display_name: null,
    revision: 1,
    submitted_at: "2026-07-17T00:06:00.000Z",
    updated_at: "2026-07-17T00:06:00.000Z"
  }
];

function createService(status: typeof run.status | "closed" = "results") {
  const repository = {
    findRun: vi.fn().mockResolvedValue({ ...run, status }),
    findCurrentRun: vi.fn().mockResolvedValue({ ...run, status }),
    findActiveRun: vi.fn().mockResolvedValue({ ...run, status }),
    findOwnResponse: vi.fn().mockResolvedValue(responses[0]),
    listResponses: vi.fn().mockResolvedValue(responses),
    listTextEntries: vi.fn().mockResolvedValue([
      {
        entry_id: "activity_text_approved",
        question_id: "question_text",
        text_value: "공개 의견",
        display_name: "PRIVATE_NAME_SENTINEL",
        moderation_status: "approved",
        answered_at: null,
        updated_at: "2026-07-17T00:05:00.000Z"
      },
      {
        entry_id: "activity_text_pending",
        question_id: "question_text",
        text_value: "PENDING_TEXT_SENTINEL",
        display_name: "PRIVATE_NAME_SENTINEL",
        moderation_status: "pending",
        answered_at: null,
        updated_at: "2026-07-17T00:06:00.000Z"
      }
    ])
  } as unknown as ActivityResultsRepository;
  return new ActivityResultsService(repository);
}

describe("ActivityResultsService", () => {
  it("returns full text moderation details only to the presenter projection", async () => {
    const result = await createService().getPresenterResult(
      "project_1",
      "session_1",
      "activity_run_1"
    );

    expect(result.result.responseCount).toBe(2);
    expect(result.result.aggregates[0]).toMatchObject({
      questionId: "question_rating",
      average: 4,
      responseCount: 2
    });
    expect(result.result.textEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entryId: "activity_text_approved",
          displayName: "PRIVATE_NAME_SENTINEL"
        }),
        expect.objectContaining({
          entryId: "activity_text_pending",
          text: "PENDING_TEXT_SENTINEL"
        })
      ])
    );
  });

  it("removes display names and pending text from the public projection", async () => {
    const result = await createService().getPublicResult(
      "project_1",
      "session_1",
      "activity_run_1"
    );
    const serialized = JSON.stringify(result);

    expect(result.result?.approvedTextEntries).toEqual([
      {
        entryId: "activity_text_approved",
        questionId: "question_text",
        text: "공개 의견",
        answered: false
      }
    ]);
    expect(serialized).not.toContain("PRIVATE_NAME_SENTINEL");
    expect(serialized).not.toContain("PENDING_TEXT_SENTINEL");
  });

  it("does not expose aggregate results before the results state", async () => {
    await expect(
      createService("closed").getPublicResult("project_1", "session_1", "activity_run_1")
    ).resolves.toEqual({ result: null });
  });

  it("returns the active activity with the current audience response", async () => {
    const result = await createService("closed").getAudienceActiveActivity(
      "project_1",
      "session_1",
      "audience_private"
    );

    expect(result.activity).toMatchObject({
      activityId: "activity_1",
      ownResponse: { responseId: "activity_response_1" },
      publicResult: null
    });
  });
});
