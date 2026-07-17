import { deckSchema, type Deck } from "@orbit/shared";
import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { projectActivityDeckForStaticExport } from "./activity-export-projection";

describe("projectActivityDeckForStaticExport", () => {
  it("replaces live Activity UI with static copy and a session-selection placeholder", async () => {
    const deck = activityDeck();
    const original = structuredClone(deck);
    const query = vi.fn();

    const projected = await projectActivityDeckForStaticExport(
      { query } as unknown as DataSource,
      deck.projectId,
      deck,
    );

    expect(JSON.stringify(projected)).toContain(
      "실시간 참여는 발표 중 제공됩니다.",
    );
    expect(JSON.stringify(projected)).toContain(
      "발표 세션을 선택하면 결과를 포함할 수 있습니다",
    );
    expect(JSON.stringify(projected)).not.toMatch(
      /qr|joinCode|speaker secret/i,
    );
    expect(projected.slides.every((slide) => slide.kind === "content")).toBe(
      true,
    );
    expect(projected.slides.every((slide) => slide.speakerNotes === "")).toBe(
      true,
    );
    expect(deck).toEqual(original);
    expect(query).not.toHaveBeenCalled();
  });

  it("exports aggregate and approved text only from a selected live session", async () => {
    const deck = activityDeck();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM activity_runs")) {
        return [
          {
            activity_run_id: "activity_run_1",
            activity_id: "activity_1",
            definition_snapshot: activityDefinition(),
            status: "results",
            revision: 3,
            response_count: 2,
            participant_count: 4,
            aggregate_json: null,
            raw_responses_deleted_at: null,
          },
        ];
      }
      if (
        sql.includes("FROM activity_responses") &&
        !sql.includes("INNER JOIN")
      ) {
        return [
          {
            answers_json: [
              { questionId: "question_rating", type: "rating", value: 5 },
              {
                questionId: "question_text",
                type: "free-text",
                text: "RAW_RESPONSE_SENTINEL",
              },
            ],
          },
          {
            answers_json: [
              { questionId: "question_rating", type: "rating", value: 3 },
              {
                questionId: "question_text",
                type: "free-text",
                text: "PENDING_TEXT",
              },
            ],
          },
        ];
      }
      if (sql.includes("FROM activity_text_entries")) {
        return [
          {
            entry_id: "activity_text_entry_1",
            question_id: "question_text",
            text_value: "승인된 의견입니다.",
            answered_at: null,
            updated_at: "2026-07-01T00:00:00.000Z",
            display_name: "PRIVATE_NAME",
          },
        ];
      }
      return [];
    });

    const projected = await projectActivityDeckForStaticExport(
      { query } as unknown as DataSource,
      deck.projectId,
      deck,
      "session_1",
    );
    const serialized = JSON.stringify(projected);

    expect(serialized).toContain("4.0 / 5");
    expect(serialized).toContain("승인된 의견입니다.");
    expect(serialized).not.toMatch(
      /RAW_RESPONSE_SENTINEL|PENDING_TEXT|PRIVATE_NAME/,
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("sessions.deck_id = $4"),
      ["project-a", "session_1", "activity_1", "deck_activity_1"],
    );
  });

  it("keeps unrevealed session results out of static exports", async () => {
    const deck = activityDeck();
    const query = vi.fn(async (sql: string) =>
      sql.includes("FROM activity_runs")
        ? [
            {
              activity_run_id: "activity_run_private",
              activity_id: "activity_1",
              definition_snapshot: activityDefinition(),
              status: "closed",
              revision: 2,
              response_count: 9,
              participant_count: 10,
              aggregate_json: {
                private: "PRIVATE_AGGREGATE_SENTINEL",
              },
              raw_responses_deleted_at: null,
            },
          ]
        : [],
    );

    const projected = await projectActivityDeckForStaticExport(
      { query } as unknown as DataSource,
      deck.projectId,
      deck,
      "session_1",
    );
    const resultSlide = projected.slides.find(
      (slide) => slide.slideId === "slide_result_1",
    );
    const serialized = JSON.stringify(resultSlide);

    expect(serialized).toContain(
      "발표자가 결과를 공개하면 export에 포함됩니다.",
    );
    expect(serialized).not.toContain("PRIVATE_AGGREGATE_SENTINEL");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("renders selected session results with its immutable definition snapshot", async () => {
    const deck = activityDeck();
    const current = deck.slides.find((slide) => slide.kind === "activity");
    if (!current || current.kind !== "activity") throw new Error("activity fixture");
    current.activity.title = "현재 Deck 제목";
    current.activity.questions[0]!.prompt = "현재 Deck 질문";
    const snapshot = activityDefinition();
    snapshot.title = "세션 당시 제목";
    snapshot.questions[0]!.prompt = "세션 당시 질문";
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM activity_runs")) {
        return [
          {
            activity_run_id: "activity_run_snapshot",
            activity_id: "activity_1",
            definition_snapshot: snapshot,
            status: "results",
            revision: 3,
            response_count: 1,
            participant_count: 1,
            aggregate_json: null,
            raw_responses_deleted_at: null,
          },
        ];
      }
      if (sql.includes("FROM activity_responses") && !sql.includes("INNER JOIN")) {
        return [
          {
            answers_json: [
              { questionId: "question_rating", type: "rating", value: 4 },
            ],
          },
        ];
      }
      return [];
    });

    const projected = await projectActivityDeckForStaticExport(
      { query } as unknown as DataSource,
      deck.projectId,
      deck,
      "session_1",
    );
    const resultSlide = projected.slides.find(
      (slide) => slide.slideId === "slide_result_1",
    );
    const serialized = JSON.stringify(resultSlide);

    expect(serialized).toContain("세션 당시 제목");
    expect(serialized).toContain("세션 당시 질문: 4.0 / 5");
    expect(serialized).not.toContain("현재 Deck 제목");
    expect(serialized).not.toContain("현재 Deck 질문");
  });

  it("uses the retention snapshot after raw responses have expired", async () => {
    const deck = activityDeck();
    const query = vi.fn(async (sql: string) =>
      sql.includes("FROM activity_runs")
        ? [
            {
              activity_run_id: "activity_run_1",
              activity_id: "activity_1",
              definition_snapshot: activityDefinition(),
              status: "results",
              revision: 4,
              response_count: 7,
              participant_count: 10,
              raw_responses_deleted_at: "2026-07-01T00:00:00.000Z",
              aggregate_json: {
                activityRunId: "activity_run_1",
                activityId: "activity_1",
                status: "results",
                revision: 4,
                responseCount: 7,
                participantCount: 10,
                responseRate: 70,
                aggregates: [
                  {
                    questionId: "question_rating",
                    type: "rating",
                    responseCount: 7,
                    average: 4.5,
                    choices: [],
                  },
                  {
                    questionId: "question_text",
                    type: "free-text",
                    responseCount: 7,
                    average: null,
                    choices: [],
                  },
                ],
                textEntries: [],
              },
            },
          ]
        : [],
    );

    const projected = await projectActivityDeckForStaticExport(
      { query } as unknown as DataSource,
      deck.projectId,
      deck,
      "session_1",
    );

    expect(JSON.stringify(projected)).toContain("7명 응답");
    expect(JSON.stringify(projected)).toContain("4.5 / 5");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("keeps a visible recovery message for a missing source Activity", async () => {
    const deck = activityDeck();
    deck.slides = deck.slides.filter(
      (slide) => slide.kind === "activity-results",
    );

    const projected = await projectActivityDeckForStaticExport(
      { query: vi.fn() } as unknown as DataSource,
      deck.projectId,
      deck,
      "session_1",
    );

    expect(JSON.stringify(projected)).toContain(
      "연결된 참여 장표를 찾을 수 없습니다.",
    );
  });
});

function activityDeck(): Deck {
  return deckSchema.parse({
    deckId: "deck_activity_1",
    projectId: "project-a",
    title: "Activity export",
    version: 1,
    canvas: {
      preset: "wide-16-9",
      width: 1920,
      height: 1080,
      aspectRatio: "16:9",
    },
    slides: [
      {
        kind: "activity",
        slideId: "slide_activity_1",
        order: 1,
        title: "참여",
        speakerNotes: "speaker secret",
        activity: activityDefinition(),
      },
      {
        kind: "activity-results",
        slideId: "slide_result_1",
        order: 2,
        title: "결과",
        speakerNotes: "speaker secret",
        activityResult: {
          sourceActivityId: "activity_1",
          display: "live",
          layout: "summary",
        },
      },
    ],
  });
}

function activityDefinition() {
  return {
    activityId: "activity_1",
    template: "satisfaction" as const,
    title: "발표 만족도",
    description: "",
    questions: [
      {
        questionId: "question_rating",
        type: "rating" as const,
        prompt: "발표가 유익했나요?",
        required: true,
        leftLabel: "아니요",
        rightLabel: "그래요",
      },
      {
        questionId: "question_text",
        type: "free-text" as const,
        prompt: "의견을 알려주세요.",
        required: false,
      },
    ],
    allowDisplayName: true,
    hideResultsUntilReveal: true,
  };
}
