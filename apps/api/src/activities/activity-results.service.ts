import {
  activityAnswerSchema,
  activityDefinitionSchema,
  activityPresenterResultSchema,
  activityPublicResultSchema,
  activityResponseSchema,
  activityRunSchema,
  getActivityPresenterResultResponseSchema,
  getActivityPublicResultResponseSchema,
  getAudienceActiveActivityResponseSchema,
  getAudienceActivityResponseSchema
} from "@orbit/shared";
import type { ActivityAnswer, ActivityPresenterResult, ActivityPublicResult } from "@orbit/shared";
import { Injectable, NotFoundException } from "@nestjs/common";

import { buildActivityAggregates } from "./activity-aggregate";
import {
  ActivityResultsRepository,
  type ActivityResultResponseRow,
  type ActivityResultRunRow
} from "./activity-results.repository";

@Injectable()
export class ActivityResultsService {
  constructor(private readonly repository: ActivityResultsRepository) {}

  async getPresenterResult(projectId: string, sessionId: string, runId: string) {
    const run = await this.repository.findRun(projectId, sessionId, runId);
    if (!run) throw new NotFoundException("Activity run not found");
    return getActivityPresenterResultResponseSchema.parse({
      result: await this.buildPresenterResult(run)
    });
  }

  async getPublicResult(projectId: string, sessionId: string, runId: string) {
    const run = await this.repository.findRun(projectId, sessionId, runId);
    if (!run) throw new NotFoundException("Activity run not found");
    return getActivityPublicResultResponseSchema.parse({
      result: run.status === "results" ? await this.buildPublicResult(run) : null
    });
  }

  async getAudienceActivity(
    projectId: string,
    sessionId: string,
    activityId: string,
    audienceId: string
  ) {
    const run = await this.repository.findCurrentRun(projectId, sessionId, activityId);
    if (!run) throw new NotFoundException("Activity run not found");
    return this.buildAudienceActivity(run, audienceId);
  }

  async getAudienceActiveActivity(
    projectId: string,
    sessionId: string,
    audienceId: string
  ) {
    const run = await this.repository.findActiveRun(projectId, sessionId);
    return getAudienceActiveActivityResponseSchema.parse({
      activity: run ? await this.buildAudienceActivity(run, audienceId) : null
    });
  }

  private async buildAudienceActivity(
    run: ActivityResultRunRow,
    audienceId: string
  ) {
    const ownResponse = await this.repository.findOwnResponse(
      run.project_id,
      run.activity_run_id,
      audienceId
    );
    return getAudienceActivityResponseSchema.parse({
      activityId: run.activity_id,
      run: this.toRun(run),
      ownResponse: ownResponse ? this.toResponse(run.activity_run_id, ownResponse) : null,
      publicResult: run.status === "results" ? await this.buildPublicResult(run) : null
    });
  }

  private async buildPresenterResult(
    run: ActivityResultRunRow
  ): Promise<ActivityPresenterResult> {
    const definition = activityDefinitionSchema.parse(run.definition_snapshot);
    const [responses, textEntries] = await Promise.all([
      this.repository.listResponses(run.project_id, run.activity_run_id),
      this.repository.listTextEntries(run.project_id, run.activity_run_id)
    ]);
    return activityPresenterResultSchema.parse({
      ...this.resultBase(run, buildActivityAggregates(definition, responses.map(toAnswers))),
      textEntries: textEntries.map((entry) => ({
        entryId: entry.entry_id,
        questionId: entry.question_id,
        text: entry.text_value,
        displayName: entry.display_name,
        moderationStatus: entry.moderation_status,
        answeredAt: toOptionalIso(entry.answered_at),
        updatedAt: toIso(entry.updated_at)
      }))
    });
  }

  private async buildPublicResult(run: ActivityResultRunRow): Promise<ActivityPublicResult> {
    const definition = activityDefinitionSchema.parse(run.definition_snapshot);
    const [responses, textEntries] = await Promise.all([
      this.repository.listResponses(run.project_id, run.activity_run_id),
      this.repository.listTextEntries(run.project_id, run.activity_run_id)
    ]);
    return activityPublicResultSchema.parse({
      ...this.resultBase(run, buildActivityAggregates(definition, responses.map(toAnswers))),
      approvedTextEntries: textEntries
        .filter((entry) => entry.moderation_status === "approved")
        .map((entry) => ({
          entryId: entry.entry_id,
          questionId: entry.question_id,
          text: entry.text_value,
          answered: entry.answered_at !== null
        }))
    });
  }

  private resultBase(
    run: ActivityResultRunRow,
    aggregates: ReturnType<typeof buildActivityAggregates>
  ) {
    return {
      activityRunId: run.activity_run_id,
      activityId: run.activity_id,
      status: run.status,
      revision: run.revision,
      responseCount: run.response_count,
      aggregates
    };
  }

  private toRun(row: ActivityResultRunRow) {
    return activityRunSchema.parse({
      activityRunId: row.activity_run_id,
      presentationSessionId: row.session_id,
      activityId: row.activity_id,
      sourceSlideId: row.source_slide_id,
      version: row.version,
      supersedesActivityRunId: row.supersedes_activity_run_id,
      definitionSnapshot: activityDefinitionSchema.parse(row.definition_snapshot),
      definitionFingerprint: row.definition_fingerprint,
      status: row.status,
      revision: row.revision,
      isCurrent: row.is_current,
      responseCount: row.response_count,
      openedAt: toOptionalIso(row.opened_at),
      closedAt: toOptionalIso(row.closed_at),
      revealedAt: toOptionalIso(row.revealed_at),
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at)
    });
  }

  private toResponse(runId: string, row: ActivityResultResponseRow) {
    return activityResponseSchema.parse({
      responseId: row.response_id,
      activityRunId: runId,
      answers: toAnswers(row),
      displayName: row.display_name,
      revision: row.revision,
      submittedAt: toIso(row.submitted_at),
      updatedAt: toIso(row.updated_at)
    });
  }
}

function toAnswers(row: ActivityResultResponseRow): ActivityAnswer[] {
  return activityAnswerSchema.array().parse(row.answers_json);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toOptionalIso(value: Date | string | null): string | null {
  return value === null ? null : toIso(value);
}
