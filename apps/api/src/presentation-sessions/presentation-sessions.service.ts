import { randomInt, randomUUID } from "node:crypto";
import {
  assertAudienceSafePayload,
  audienceStateResponseSchema,
  createPresentationSessionRequestSchema,
  createPresentationSessionResponseSchema,
  getCurrentPresentationSessionResponseSchema,
  updatePresentationSessionEntryResponseSchema,
} from "@orbit/shared";
import type {
  AudienceEventType,
  AudienceFeatureSettings,
  AudienceJoinResponse,
  AudienceParticipant,
  AudienceRealtimeState,
  AudienceStateResponse,
  CreatePresentationSessionResponse,
  GetCurrentPresentationSessionResponse,
  PresentationEntryStatus,
  PresentationSession,
  PresentationSessionStatus,
  UpdatePresentationSessionEntryResponse,
} from "@orbit/shared";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
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

type AudienceParticipantRow = {
  audience_id: string;
  session_id: string;
  nickname: string;
  joined_at: Date | string;
  last_seen_at: Date | string;
  joined_before_end: boolean;
};

type AudienceRealtimeStateRow = {
  session_id: string;
  slide_id: string | null;
  slide_index: number | null;
  effect_state_json: Record<string, unknown> | string | null;
  active_interaction_id: string | null;
  updated_at: Date | string;
};

type AudienceFeatureSettingsRow = {
  session_id: string;
  qna_enabled: boolean;
  ai_qna_enabled: boolean;
  polls_enabled: boolean;
  quizzes_enabled: boolean;
  reactions_enabled: boolean;
  survey_enabled: boolean;
  updated_at: Date | string;
};

type JoinAudienceInput = {
  audienceId: string;
  nickname: string;
  tokenHash: string;
};

type UpdateAudienceRealtimeStateInput = {
  sessionId: string;
  actorId: string;
  slideId: string | null;
  slideIndex: number | null;
  effectState: Record<string, unknown>;
  activeInteractionId?: string | null;
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

  async joinAudience(
    session: PresentationSession,
    input: JoinAudienceInput,
  ): Promise<AudienceJoinResponse> {
    if (session.status === "ended") {
      throw new NotFoundException("입장 코드를 확인해 주세요.");
    }

    if (session.entryStatus === "closed") {
      throw new ForbiddenException("현재 새 입장이 닫혀 있습니다.");
    }

    try {
      const rows = await this.dataSource.query<AudienceParticipantRow[]>(
        `
          INSERT INTO audience_participants (
            audience_id,
            session_id,
            nickname,
            token_hash,
            joined_at,
            last_seen_at,
            joined_before_end
          )
          VALUES ($1, $2, $3, $4, now(), now(), true)
          RETURNING
            audience_id,
            session_id,
            nickname,
            joined_at,
            last_seen_at,
            joined_before_end
        `,
        [input.audienceId, session.sessionId, input.nickname, input.tokenHash],
      );

      const participant = this.toParticipantDto(rows[0]);
      await this.appendAudienceJoinedEvent(
        session.sessionId,
        participant.audienceId,
      );

      return {
        session: toAudiencePublicSession(session),
        participant,
      };
    } catch (error) {
      if (!isPostgresUniqueViolation(error)) {
        throw error;
      }

      throw new ConflictException("이미 사용 중인 닉네임입니다.");
    }
  }

  async getAudienceMe(
    sessionId: string,
    audienceId: string,
    tokenHash: string,
  ): Promise<AudienceJoinResponse> {
    const rows = await this.dataSource.query<AudienceParticipantRow[]>(
      `
        UPDATE audience_participants
        SET last_seen_at = now()
        WHERE session_id = $1
          AND audience_id = $2
          AND token_hash = $3
        RETURNING
          audience_id,
          session_id,
          nickname,
          joined_at,
          last_seen_at,
          joined_before_end
      `,
      [sessionId, audienceId, tokenHash],
    );

    const row = rows[0];
    if (!row) {
      throw new UnauthorizedException("Audience access required");
    }

    return {
      session: toAudiencePublicSession(await this.getSessionById(sessionId)),
      participant: this.toParticipantDto(row),
    };
  }

  async getAudienceState(
    sessionId: string,
    audienceId: string,
    tokenHash: string,
  ): Promise<AudienceStateResponse> {
    const me = await this.getAudienceMe(sessionId, audienceId, tokenHash);
    const [state, features] = await Promise.all([
      this.getAudienceRealtimeState(sessionId),
      this.getAudienceFeatureSettings(sessionId),
    ]);

    return audienceStateResponseSchema.parse({
      ...me,
      state,
      features,
    });
  }

  async updateAudienceRealtimeState(
    input: UpdateAudienceRealtimeStateInput,
  ): Promise<AudienceRealtimeState> {
    const effectState = assertAudienceSafePayload(input.effectState);
    const rows = await this.dataSource.query<AudienceRealtimeStateRow[]>(
      `
        UPDATE audience_realtime_state
        SET
          slide_id = $2,
          slide_index = $3,
          effect_state_json = $4::jsonb,
          active_interaction_id = $5,
          updated_at = now()
        WHERE session_id = $1
        RETURNING
          session_id,
          slide_id,
          slide_index,
          effect_state_json,
          active_interaction_id,
          updated_at
      `,
      [
        input.sessionId,
        input.slideId,
        input.slideIndex,
        effectState,
        input.activeInteractionId ?? null,
      ],
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException("Audience realtime state not found");
    }

    const state = this.toRealtimeStateDto(row);
    await this.appendAudienceEvent({
      sessionId: input.sessionId,
      actorType: "presenter",
      actorId: input.actorId,
      type: "slide.changed",
      payload: {
        slideId: state.slideId,
        slideIndex: state.slideIndex,
        effectState: state.effectState,
      },
    });

    return state;
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

  private async getAudienceRealtimeState(
    sessionId: string,
  ): Promise<AudienceRealtimeState> {
    const rows = await this.dataSource.query<AudienceRealtimeStateRow[]>(
      `
        SELECT
          session_id,
          slide_id,
          slide_index,
          effect_state_json,
          active_interaction_id,
          updated_at
        FROM audience_realtime_state
        WHERE session_id = $1
        LIMIT 1
      `,
      [sessionId],
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException("Audience realtime state not found");
    }

    return this.toRealtimeStateDto(row);
  }

  private async getAudienceFeatureSettings(
    sessionId: string,
  ): Promise<AudienceFeatureSettings> {
    const rows = await this.dataSource.query<AudienceFeatureSettingsRow[]>(
      `
        SELECT
          session_id,
          qna_enabled,
          ai_qna_enabled,
          polls_enabled,
          quizzes_enabled,
          reactions_enabled,
          survey_enabled,
          updated_at
        FROM audience_feature_settings
        WHERE session_id = $1
        LIMIT 1
      `,
      [sessionId],
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException("Audience feature settings not found");
    }

    return this.toFeatureSettingsDto(row);
  }

  private async appendAudienceJoinedEvent(
    sessionId: string,
    audienceId: string,
  ): Promise<void> {
    await this.appendAudienceEvent({
      sessionId,
      actorType: "audience",
      actorId: audienceId,
      type: "audience.joined",
      payload: {},
    });
  }

  private async appendAudienceEvent(input: {
    sessionId: string;
    actorType: "audience" | "presenter" | "system";
    actorId: string | null;
    type: AudienceEventType;
    payload: Record<string, unknown>;
  }): Promise<void> {
    const payload = assertAudienceSafePayload(input.payload);
    await this.dataSource.query(
      `
        INSERT INTO audience_events (
          event_id,
          session_id,
          actor_type,
          actor_id,
          type,
          payload_json,
          occurred_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
      `,
      [
        `event_${randomUUID()}`,
        input.sessionId,
        input.actorType,
        input.actorId,
        input.type,
        payload,
      ],
    );
  }

  private async getSessionById(
    sessionId: string,
  ): Promise<PresentationSession> {
    const rows = await this.dataSource.query<PresentationSessionRow[]>(
      `
        ${selectPresentationSessionSql()}
        WHERE session_id = $1
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

  private toParticipantDto(row: AudienceParticipantRow): AudienceParticipant {
    return {
      audienceId: row.audience_id,
      sessionId: row.session_id,
      nickname: row.nickname,
      joinedAt: toIso(row.joined_at),
      lastSeenAt: toIso(row.last_seen_at),
      joinedBeforeEnd: row.joined_before_end,
    };
  }

  private toRealtimeStateDto(
    row: AudienceRealtimeStateRow,
  ): AudienceRealtimeState {
    return {
      sessionId: row.session_id,
      slideId: row.slide_id,
      slideIndex: row.slide_index,
      effectState: normalizeJsonRecord(row.effect_state_json),
      activeInteractionId: row.active_interaction_id,
      updatedAt: toIso(row.updated_at),
    };
  }

  private toFeatureSettingsDto(
    row: AudienceFeatureSettingsRow,
  ): AudienceFeatureSettings {
    return {
      sessionId: row.session_id,
      qnaEnabled: row.qna_enabled,
      aiQnaEnabled: row.ai_qna_enabled,
      pollsEnabled: row.polls_enabled,
      quizzesEnabled: row.quizzes_enabled,
      reactionsEnabled: row.reactions_enabled,
      surveyEnabled: row.survey_enabled,
      updatedAt: toIso(row.updated_at),
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

function normalizeJsonRecord(
  value: Record<string, unknown> | string | null,
): Record<string, unknown> {
  if (value === null) {
    return {};
  }

  if (typeof value === "string") {
    const parsed: unknown = JSON.parse(value);
    return assertAudienceSafePayload(parsed);
  }

  return assertAudienceSafePayload(value);
}

function generateJoinCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function toAudiencePublicSession(session: PresentationSession) {
  return {
    sessionId: session.sessionId,
    projectId: session.projectId,
    joinCode: session.joinCode,
    status: session.status,
    entryStatus: session.entryStatus,
  };
}
