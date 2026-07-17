import {
  activityAnswerSchema,
  activityDefinitionSchema,
  activityPresenterResultSchema,
  activityRetentionSnapshotSchema,
  buildActivityAggregates,
  calculateActivityResponseRate,
  deckSchema,
  type ActivityAnswer,
  type ActivityDefinition,
  type ActivityPresenterResult,
  type Deck,
} from "@orbit/shared";
import type { DataSource } from "typeorm";

type QueryExecutor = Pick<DataSource, "query">;
type ExportRunRow = {
  activity_run_id: string;
  activity_id: string;
  definition_snapshot: unknown;
  status: "draft" | "open" | "closed" | "results";
  revision: number;
  response_count: number;
  participant_count: number;
  aggregate_json: unknown | null;
  raw_responses_deleted_at: Date | string | null;
};
type ResponseRow = { answers_json: unknown };
type TextRow = {
  entry_id: string;
  question_id: string;
  text_value: string;
  answered_at: Date | string | null;
  updated_at: Date | string;
};
type LoadedActivityExportResult =
  | {
      kind: "result";
      definition: ActivityDefinition;
      result: ActivityPresenterResult;
    }
  | { kind: "not-revealed" };

export async function projectActivityDeckForStaticExport(
  dataSource: QueryExecutor,
  projectId: string,
  deck: Deck,
  presentationSessionId?: string,
): Promise<Deck> {
  const projected = deckSchema.parse(deck);
  const sourceActivities = new Map(
    projected.slides
      .filter((slide) => slide.kind === "activity")
      .map((slide) => [slide.activity.activityId, slide.activity]),
  );

  for (const [index, slide] of projected.slides.entries()) {
    if (slide.kind === "activity") {
      const { kind: _kind, activity, ...base } = slide;
      projected.slides[index] = {
        ...base,
        kind: "content",
        speakerNotes: "",
        elements: staticActivityElements(slide.slideId, activity),
      };
      continue;
    }
    if (slide.kind !== "activity-results") continue;

    const { kind: _kind, activityResult, ...base } = slide;
    const source = sourceActivities.get(slide.activityResult.sourceActivityId);
    if (!source) {
      projected.slides[index] = {
        ...base,
        kind: "content",
        speakerNotes: "",
        elements: staticMessageElements(
          slide.slideId,
          slide.title || "참여 결과",
          "연결된 참여 장표를 찾을 수 없습니다.",
        ),
      };
      continue;
    }
    if (!presentationSessionId) {
      projected.slides[index] = {
        ...base,
        kind: "content",
        speakerNotes: "",
        elements: staticMessageElements(
          slide.slideId,
          source.title,
          "발표 세션을 선택하면 결과를 포함할 수 있습니다",
        ),
      };
      continue;
    }

    const result = await loadActivityExportResult(
      dataSource,
      projectId,
      projected.deckId,
      presentationSessionId,
      source.activityId,
    );
    projected.slides[index] = {
      ...base,
      kind: "content",
      speakerNotes: "",
      elements: result?.kind === "result"
        ? staticResultElements(slide.slideId, result.definition, result.result)
        : staticMessageElements(
            slide.slideId,
            source.title,
            result?.kind === "not-revealed"
              ? "발표자가 결과를 공개하면 export에 포함됩니다."
              : "선택한 발표 세션에 결과가 없습니다.",
          ),
    };
  }

  return deckSchema.parse(projected);
}

async function loadActivityExportResult(
  dataSource: QueryExecutor,
  projectId: string,
  deckId: string,
  sessionId: string,
  activityId: string,
): Promise<LoadedActivityExportResult | null> {
  const runs = readQueryRows<ExportRunRow>(
    await dataSource.query(
      `
        SELECT runs.activity_run_id, runs.activity_id, runs.definition_snapshot,
               runs.status, runs.revision, runs.response_count,
               (SELECT COUNT(*)::int
                FROM presentation_session_audiences AS audiences
                WHERE audiences.project_id = runs.project_id
                  AND audiences.session_id = runs.session_id) AS participant_count,
               snapshots.aggregate_json, sessions.raw_responses_deleted_at
        FROM activity_runs AS runs
        INNER JOIN presentation_sessions AS sessions
          ON sessions.project_id = runs.project_id
         AND sessions.session_id = runs.session_id
        LEFT JOIN activity_result_snapshots AS snapshots
          ON snapshots.project_id = runs.project_id
         AND snapshots.activity_run_id = runs.activity_run_id
        WHERE runs.project_id = $1 AND runs.session_id = $2
          AND runs.activity_id = $3
          AND sessions.deck_id = $4
          AND sessions.results_deleted_at IS NULL
        ORDER BY runs.is_current DESC, runs.version DESC
        LIMIT 1
      `,
      [projectId, sessionId, activityId, deckId],
    ),
  );
  const run = runs[0];
  if (!run) return null;
  if (run.status !== "results") return { kind: "not-revealed" };
  const definition = activityDefinitionSchema.parse(run.definition_snapshot);
  if (run.aggregate_json !== null) {
    return {
      kind: "result",
      definition,
      result: activityRetentionSnapshotSchema.parse(run.aggregate_json),
    };
  }
  if (run.raw_responses_deleted_at) return null;

  const [responses, approvedText] = await Promise.all([
    dataSource.query(
      `
        SELECT answers_json
        FROM activity_responses
        WHERE project_id = $1 AND activity_run_id = $2
        ORDER BY submitted_at ASC
      `,
      [projectId, run.activity_run_id],
    ),
    dataSource.query(
      `
        SELECT entries.entry_id, entries.question_id, entries.text_value,
               entries.answered_at, entries.updated_at
        FROM activity_text_entries AS entries
        INNER JOIN activity_responses AS responses
          ON responses.project_id = entries.project_id
         AND responses.response_id = entries.response_id
        WHERE entries.project_id = $1
          AND responses.activity_run_id = $2
          AND entries.moderation_status = 'approved'
        ORDER BY entries.updated_at ASC
      `,
      [projectId, run.activity_run_id],
    ),
  ]);
  const answers = readQueryRows<ResponseRow>(responses).map((row) =>
    activityAnswerSchema.array().parse(row.answers_json),
  );
  return {
    kind: "result",
    definition,
    result: activityPresenterResultSchema.parse({
      activityRunId: run.activity_run_id,
      activityId: run.activity_id,
      status: run.status,
      revision: run.revision,
      responseCount: run.response_count,
      participantCount: run.participant_count,
      responseRate: calculateActivityResponseRate(
        run.response_count,
        run.participant_count,
      ),
      aggregates: buildActivityAggregates(
        definition,
        answers as ActivityAnswer[][],
      ),
      textEntries: readQueryRows<TextRow>(approvedText).map((entry) => ({
        entryId: entry.entry_id,
        questionId: entry.question_id,
        text: entry.text_value,
        displayName: null,
        moderationStatus: "approved" as const,
        answeredAt: toOptionalIso(entry.answered_at),
        updatedAt: toIso(entry.updated_at),
      })),
    }),
  };
}

function staticActivityElements(
  slideId: string,
  definition: ReturnType<typeof activityDefinitionSchema.parse>,
) {
  const questions = definition.questions
    .map((question, index) => `${index + 1}. ${question.prompt}`)
    .join("\n");
  return [
    textElement(
      slideId,
      "eyebrow",
      "참여 장표",
      120,
      100,
      1680,
      70,
      30,
      "semibold",
    ),
    textElement(
      slideId,
      "title",
      definition.title,
      120,
      200,
      1680,
      150,
      62,
      "bold",
    ),
    textElement(
      slideId,
      "questions",
      questions,
      120,
      410,
      1680,
      330,
      30,
      "normal",
    ),
    textElement(
      slideId,
      "notice",
      "실시간 참여는 발표 중 제공됩니다.",
      120,
      850,
      1680,
      80,
      26,
      "semibold",
    ),
  ];
}

function staticMessageElements(
  slideId: string,
  title: string,
  message: string,
) {
  return [
    textElement(slideId, "title", title, 160, 220, 1600, 150, 58, "bold"),
    textElement(slideId, "message", message, 160, 470, 1600, 160, 34, "normal"),
  ];
}

function staticResultElements(
  slideId: string,
  definition: ReturnType<typeof activityDefinitionSchema.parse>,
  result: ActivityPresenterResult,
) {
  const aggregateLines = result.aggregates.map((aggregate) => {
    const question = definition.questions.find(
      (candidate) => candidate.questionId === aggregate.questionId,
    );
    const label = question?.prompt ?? aggregate.questionId;
    if (aggregate.type === "rating") {
      return `${label}: ${aggregate.average?.toFixed(1) ?? "–"} / 5`;
    }
    if (
      (question?.type === "single-choice" ||
        question?.type === "multiple-choice") &&
      aggregate.choices.length > 0
    ) {
      const top = [...aggregate.choices].sort(
        (left, right) => right.count - left.count,
      )[0];
      const option = question.options.find(
        (candidate) => candidate.optionId === top?.optionId,
      );
      return `${label}: ${option?.label ?? "–"} (${top?.count ?? 0}명)`;
    }
    return `${label}: ${aggregate.responseCount}개 의견`;
  });
  const approved = result.textEntries
    .filter((entry) => entry.moderationStatus === "approved")
    .slice(0, 5)
    .map((entry) => `• ${entry.text.replace(/\s+/g, " ").slice(0, 180)}`);
  return [
    textElement(
      slideId,
      "eyebrow",
      "발표 결과",
      120,
      90,
      1680,
      65,
      28,
      "semibold",
    ),
    textElement(
      slideId,
      "title",
      definition.title,
      120,
      170,
      1680,
      120,
      56,
      "bold",
    ),
    textElement(
      slideId,
      "count",
      `${result.responseCount}명 응답`,
      120,
      310,
      1680,
      80,
      30,
      "semibold",
    ),
    textElement(
      slideId,
      "aggregates",
      aggregateLines.join("\n"),
      120,
      430,
      800,
      450,
      28,
      "normal",
    ),
    textElement(
      slideId,
      "approved",
      approved.length > 0
        ? `승인된 의견\n${approved.join("\n")}`
        : "승인된 의견이 없습니다.",
      980,
      430,
      820,
      450,
      26,
      "normal",
    ),
  ];
}

function textElement(
  slideId: string,
  suffix: string,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  fontWeight: "normal" | "semibold" | "bold",
) {
  return {
    elementId: `el_export_${slideId}_${suffix}`,
    type: "text" as const,
    role: suffix === "title" ? ("title" as const) : ("body" as const),
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    locked: true,
    visible: true,
    props: {
      text,
      fontSize,
      fontWeight,
      color: "#111827",
      align: "left" as const,
      verticalAlign: "middle" as const,
      lineHeight: 1.25,
    },
  };
}

function readQueryRows<T>(queryResult: unknown): T[] {
  if (!Array.isArray(queryResult)) return [];
  if (Array.isArray(queryResult[0])) return queryResult[0] as T[];
  return queryResult as T[];
}

function toIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function toOptionalIso(value: Date | string | null): string | null {
  return value === null ? null : toIso(value);
}
