import { randomInt, randomUUID } from "node:crypto";
import {
  createPresentationSessionRequestSchema,
  createPresentationSessionResponseSchema,
  getCurrentPresentationSessionResponseSchema,
  updatePresentationSessionEntryResponseSchema,
} from "@orbit/shared";
import type {
  CreatePresentationSessionResponse,
  GetCurrentPresentationSessionResponse,
  PresentationEntryStatus,
  PresentationSession,
  PresentationSessionStatus,
  UpdatePresentationSessionEntryResponse,
} from "@orbit/shared";
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

type PresentationSessionRow = {
  session_id: string;
  project_id: string;
  deck_id: string;
  presenter_user_id: string;
  join_code: string;
  status: PresentationSessionStatus;
  entry_status: PresentationEntryStatus;
  audience_slide_render_mode: "image-first";
  created_at: Date | string;
  started_at: Date | string | null;
  ended_at: Date | string | null;
  survey_closes_at: Date | string | null;
  raw_data_delete_after: Date | string;
};

@Injectable()
export class PresentationSessionsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async create(
    projectId: string,
    presenterUserId: string,
    body: unknown,
  ): Promise<CreatePresentationSessionResponse> {
    const input = createPresentationSessionRequestSchema.parse(body);
    const currentActiveSession = await this.findCurrentActiveSession(projectId);
    if (currentActiveSession) {
      return this.toCreateResponse(currentActiveSession);
    }

    const sessionId = `session_${randomUUID()}`;
    const now = new Date();
    const rawDataDeleteAfter = new Date(
      now.getTime() + 30 * 24 * 60 * 60 * 1000,
    );

    try {
      const rows = await this.dataSource.query<PresentationSessionRow[]>(
        `
          INSERT INTO presentation_sessions (
            session_id,
            project_id,
            deck_id,
            presenter_user_id,
            join_code,
            status,
            entry_status,
            audience_slide_render_mode,
            created_at,
            raw_data_delete_after
          )
          VALUES ($1, $2, $3, $4, $5, 'draft', 'open', 'image-first', $6, $7)
          RETURNING
            session_id,
            project_id,
            deck_id,
            presenter_user_id,
            join_code,
            status,
            entry_status,
            audience_slide_render_mode,
            created_at,
            started_at,
            ended_at,
            survey_closes_at,
            raw_data_delete_after
        `,
        [
          sessionId,
          projectId,
          input.deckId,
          presenterUserId,
          generateJoinCode(),
          now,
          rawDataDeleteAfter,
        ],
      );

      await this.insertDefaultAudienceState(sessionId);
      return this.toCreateResponse(rows[0]);
    } catch (error) {
      if (!isPostgresUniqueViolation(error)) {
        throw error;
      }

      const racedActiveSession = await this.findCurrentActiveSession(projectId);
      if (!racedActiveSession) {
        throw error;
      }

      return this.toCreateResponse(racedActiveSession);
    }
  }

  async getCurrent(
    projectId: string,
  ): Promise<GetCurrentPresentationSessionResponse> {
    const row = await this.findCurrentActiveSession(projectId);

    if (!row) {
      return getCurrentPresentationSessionResponseSchema.parse({
        session: null,
        audienceUrl: null,
      });
    }

    const session = this.toSessionDto(row);
    return getCurrentPresentationSessionResponseSchema.parse({
      session,
      audienceUrl: this.buildAudienceUrl(session.joinCode),
    });
  }

  async getActiveSessionById(sessionId: string): Promise<PresentationSession> {
    const rows = await this.dataSource.query<PresentationSessionRow[]>(
      `
        ${selectPresentationSessionSql()}
        WHERE session_id = $1
          AND status IN ('draft', 'live')
        LIMIT 1
      `,
      [sessionId],
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException("Presentation session not found");
    }

    return this.toSessionDto(row);
  }

  async getActiveSessionByJoinCode(
    joinCode: string,
  ): Promise<PresentationSession> {
    const rows = await this.dataSource.query<PresentationSessionRow[]>(
      `
        ${selectPresentationSessionSql()}
        WHERE join_code = $1
          AND status IN ('draft', 'live')
        LIMIT 1
      `,
      [joinCode],
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException("Presentation session not found");
    }

    return this.toSessionDto(row);
  }

  async updateEntryStatus(
    projectId: string,
    sessionId: string,
    entryStatus: PresentationEntryStatus,
  ): Promise<UpdatePresentationSessionEntryResponse> {
    const result = await this.dataSource.query<
      PresentationSessionRow[] | [PresentationSessionRow[], number]
    >(
      `
        UPDATE presentation_sessions
        SET entry_status = $1
        WHERE project_id = $2
          AND session_id = $3
        RETURNING
          session_id,
          project_id,
          deck_id,
          presenter_user_id,
          join_code,
          status,
          entry_status,
          audience_slide_render_mode,
          created_at,
          started_at,
          ended_at,
          survey_closes_at,
          raw_data_delete_after
      `,
      [entryStatus, projectId, sessionId],
    );

    const rows = (
      Array.isArray(result[0]) ? result[0] : result
    ) as PresentationSessionRow[];
    const row = rows[0];
    if (!row) {
      throw new NotFoundException("Presentation session not found");
    }

    return updatePresentationSessionEntryResponseSchema.parse({
      session: this.toSessionDto(row),
    });
  }

  private async findCurrentActiveSession(
    projectId: string,
  ): Promise<PresentationSessionRow | null> {
    const rows = await this.dataSource.query<PresentationSessionRow[]>(
      `
        ${selectPresentationSessionSql()}
        WHERE project_id = $1
          AND status IN ('draft', 'live')
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [projectId],
    );

    return rows[0] ?? null;
  }

  private async insertDefaultAudienceState(sessionId: string): Promise<void> {
    await this.dataSource.query(
      `
        INSERT INTO audience_feature_settings (
          session_id,
          qna_enabled,
          ai_qna_enabled,
          polls_enabled,
          quizzes_enabled,
          reactions_enabled,
          survey_enabled,
          updated_at
        )
        VALUES ($1, false, false, false, false, false, false, now())
      `,
      [sessionId],
    );
    await this.dataSource.query(
      `
        INSERT INTO audience_realtime_state (
          session_id,
          slide_id,
          slide_index,
          effect_state_json,
          active_interaction_id,
          updated_at
        )
        VALUES ($1, NULL, NULL, '{}'::jsonb, NULL, now())
      `,
      [sessionId],
    );
  }

  private buildAudienceUrl(joinCode: string) {
    return `/join/${encodeURIComponent(joinCode)}`;
  }

  private toSessionDto(row: PresentationSessionRow): PresentationSession {
    return {
      sessionId: row.session_id,
      projectId: row.project_id,
      deckId: row.deck_id,
      presenterUserId: row.presenter_user_id,
      joinCode: row.join_code,
      status: row.status,
      entryStatus: row.entry_status,
      audienceSlideRenderMode: row.audience_slide_render_mode,
      createdAt: toIso(row.created_at),
      startedAt: toNullableIso(row.started_at),
      endedAt: toNullableIso(row.ended_at),
      surveyClosesAt: toNullableIso(row.survey_closes_at),
      rawDataDeleteAfter: toIso(row.raw_data_delete_after),
    };
  }

  private toCreateResponse(
    row: PresentationSessionRow,
  ): CreatePresentationSessionResponse {
    const session = this.toSessionDto(row);
    return createPresentationSessionResponseSchema.parse({
      session,
      audienceUrl: this.buildAudienceUrl(session.joinCode),
    });
  }
}

function selectPresentationSessionSql() {
  return `
    SELECT
      session_id,
      project_id,
      deck_id,
      presenter_user_id,
      join_code,
      status,
      entry_status,
      audience_slide_render_mode,
      created_at,
      started_at,
      ended_at,
      survey_closes_at,
      raw_data_delete_after
    FROM presentation_sessions
  `;
}

function isPostgresUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function toIso(value: Date | string) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function toNullableIso(value: Date | string | null) {
  return value === null ? null : toIso(value);
}

function generateJoinCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}
