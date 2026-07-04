import { randomInt, randomUUID } from "node:crypto";
import {
  assertAudienceSafePayload,
  audienceStateResponseSchema,
  audienceActiveInteractionResponseSchema,
  audienceAggregateReportSchema,
  createAdHocSessionInteractionRequestSchema,
  createInteractionLibraryItemRequestSchema,
  createInteractionLibraryItemResponseSchema,
  createPresentationSessionRequestSchema,
  createPresentationSessionResponseSchema,
  getCurrentPresentationSessionResponseSchema,
  interactionResultsResponseSchema,
  audienceQuestionResponseSchema,
  listInteractionLibraryItemsResponseSchema,
  listSessionInteractionsResponseSchema,
  markAudienceQuestionAnsweredResponseSchema,
  presenterQuestionQueueResponseSchema,
  qnaWorkerAnswerResponseSchema,
  audienceQuestionAnswerResponseSchema,
  selectSessionInteractionsRequestSchema,
  sessionInteractionResponseSchema,
  sessionResultsResponseSchema,
  sessionSurveyFormResponseSchema,
  submitAudienceQuestionRequestSchema,
  submitInteractionResponseRequestSchema,
  submitInteractionResponseResponseSchema,
  submitReactionRequestSchema,
  submitReactionResponseSchema,
  submitSurveyResponseRequestSchema,
  submitSurveyResponseResponseSchema,
  updateAiAnswerFeedbackRequestSchema,
  updateAiReferenceSelectionRequestSchema,
  updateAiReferenceSelectionResponseSchema,
  updateAudienceFeatureSettingsRequestSchema,
  updateAudienceFeatureSettingsResponseSchema,
  updatePresentationSessionEntryResponseSchema,
  upsertSessionSurveyFormRequestSchema,
} from "@orbit/shared";
import type {
  AudienceEventType,
  AudienceAggregateReport,
  AudienceFeatureSettings,
  AudienceJoinResponse,
  AudienceParticipant,
  AudienceRealtimeState,
  AudienceStateResponse,
  AudienceQuestion,
  AudienceQuestionAnswer,
  CreatePresentationSessionResponse,
  GetCurrentPresentationSessionResponse,
  InteractionAnswer,
  InteractionQuestion,
  InteractionResponse,
  InteractionResults,
  ProjectInteractionLibraryItem,
  QnaWorkerAnswerResponse,
  PresentationEntryStatus,
  PresentationSession,
  PresentationSessionStatus,
  SessionInteraction,
  SurveyForm,
  SurveyResponse,
  UpdateAudienceFeatureSettingsRequest,
  UpdateAudienceFeatureSettingsResponse,
  UpdatePresentationSessionEntryResponse,
} from "@orbit/shared";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
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

type ProjectInteractionLibraryRow = {
  library_interaction_id: string;
  project_id: string;
  title: string;
  kind: "poll" | "quiz";
  questions_json: InteractionQuestion[] | string;
  result_visibility: "hidden" | "manual" | "after-close" | "live";
  quiz_scoring: "none" | "correct-count" | "speed-bonus";
  created_at: Date | string;
  updated_at: Date | string;
};

type SessionInteractionRow = {
  interaction_id: string;
  session_id: string;
  kind: "poll" | "quiz";
  title: string;
  questions_json: InteractionQuestion[] | string;
  result_visibility: "hidden" | "manual" | "after-close" | "live";
  quiz_scoring: "none" | "correct-count" | "speed-bonus";
  source: "library" | "ad-hoc";
  display_order: number;
  activated_at: Date | string | null;
  closed_at: Date | string | null;
};

type InteractionResponseRow = {
  response_id: string;
  interaction_id: string;
  session_id: string;
  audience_id: string;
  question_id: string;
  answer_json: InteractionAnswer | string;
  is_correct: boolean | null;
  score: number | string;
  submitted_at: Date | string;
  updated_at: Date | string;
};

type AudienceQuestionRow = {
  question_id: string;
  question_group_id: string;
  session_id: string;
  audience_id: string;
  text: string;
  status: "pending" | "answered";
  submitted_at: Date | string;
  answered_at: Date | string | null;
};

type AudienceQuestionAnswerRow = {
  question_id: string;
  session_id: string;
  audience_id: string;
  answer_text: string | null;
  source_references_json: string[] | string;
  confidence: number | string | null;
  failure_reason: "low-confidence" | "no-grounding" | "timeout" | "worker-error" | null;
  feedback: "resolved" | "unresolved" | null;
  escalated_to_presenter: boolean;
  created_at: Date | string;
};

type SessionSurveyFormRow = {
  survey_id: string;
  session_id: string;
  title: string;
  questions_json: InteractionQuestion[] | string;
  contact_json: SurveyForm["contact"] | string;
  locked_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type SessionSurveyResponseRow = {
  response_id: string;
  survey_id: string;
  session_id: string;
  audience_id: string;
  submitted_at: Date | string;
  answers_json: Record<string, unknown> | string;
  contact_consent: boolean;
  contact_answers_json: Record<string, unknown> | string;
};

type SessionSurveyCsvRow = SessionSurveyResponseRow & {
  nickname: string;
};

type AudienceAggregateReportRow = {
  report_id: string;
  session_id: string;
  status: "preliminary" | "final";
  aggregate_json: Record<string, unknown> | string;
  generated_at: Date | string;
  raw_data_deleted_at: Date | string | null;
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

type UpdateAudienceFeatureSettingsInput = {
  projectId: string;
  sessionId: string;
  actorId: string;
  settings: UpdateAudienceFeatureSettingsRequest;
};

type ProjectSessionInput = {
  projectId: string;
  sessionId: string;
};

@Injectable()
export class PresentationSessionsService {
  private readonly questionRateLimiter = new ParticipantRateLimiter(3, 60_000);
  private readonly reactionRateLimiter = new ParticipantRateLimiter(5, 1_000);

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
      this.getAudienceFeatureSettingsForSession(sessionId),
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

  async getAudienceFeatureSettings(
    projectId: string,
    sessionId: string,
  ): Promise<UpdateAudienceFeatureSettingsResponse> {
    const features = await this.getAudienceFeatureSettingsForProject(
      projectId,
      sessionId,
    );
    return updateAudienceFeatureSettingsResponseSchema.parse({ features });
  }

  async updateAudienceFeatureSettings(
    input: UpdateAudienceFeatureSettingsInput,
  ): Promise<UpdateAudienceFeatureSettingsResponse> {
    const patch = updateAudienceFeatureSettingsRequestSchema.parse(
      input.settings,
    );
    const current = await this.getAudienceFeatureSettingsForProject(
      input.projectId,
      input.sessionId,
    );
    const next = normalizeAudienceFeatureSettingsUpdate(current, patch);

    const rows = await this.dataSource.query<AudienceFeatureSettingsRow[]>(
      `
        UPDATE audience_feature_settings AS features
        SET
          qna_enabled = $3,
          ai_qna_enabled = $4,
          polls_enabled = $5,
          quizzes_enabled = $6,
          reactions_enabled = $7,
          survey_enabled = $8,
          updated_at = now()
        FROM presentation_sessions AS sessions
        WHERE features.session_id = $1
          AND sessions.session_id = features.session_id
          AND sessions.project_id = $2
        RETURNING
          features.session_id,
          features.qna_enabled,
          features.ai_qna_enabled,
          features.polls_enabled,
          features.quizzes_enabled,
          features.reactions_enabled,
          features.survey_enabled,
          features.updated_at
      `,
      [
        input.sessionId,
        input.projectId,
        next.qnaEnabled,
        next.aiQnaEnabled,
        next.pollsEnabled,
        next.quizzesEnabled,
        next.reactionsEnabled,
        next.surveyEnabled,
      ],
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException("Audience feature settings not found");
    }

    const features = this.toFeatureSettingsDto(row);
    await this.appendAudienceEvent({
      sessionId: input.sessionId,
      actorType: "presenter",
      actorId: input.actorId,
      type: "feature.changed",
      payload: { features },
    });

    return updateAudienceFeatureSettingsResponseSchema.parse({ features });
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

  async startSession(input: {
    projectId: string;
    sessionId: string;
    actorId: string;
  }) {
    const rows = await this.dataSource.query<PresentationSessionRow[]>(
      `
        UPDATE presentation_sessions
        SET status = 'live',
            started_at = COALESCE(started_at, now())
        WHERE project_id = $1
          AND session_id = $2
          AND status = 'draft'
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
      [input.projectId, input.sessionId],
    );

    const row = rows[0];
    if (!row) {
      throw new BadRequestException("세션을 시작할 수 없습니다.");
    }

    await this.dataSource.query(
      `
        UPDATE session_survey_forms
        SET locked_at = COALESCE(locked_at, now()),
            updated_at = now()
        WHERE session_id = $1
      `,
      [input.sessionId],
    );

    const session = this.toSessionDto(row);
    await this.appendAudienceEvent({
      sessionId: input.sessionId,
      actorType: "presenter",
      actorId: input.actorId,
      type: "session.started",
      payload: { sessionId: input.sessionId },
    });

    return { session };
  }

  async endSession(input: {
    projectId: string;
    sessionId: string;
    actorId: string;
  }) {
    const rows = await this.dataSource.query<PresentationSessionRow[]>(
      `
        UPDATE presentation_sessions
        SET status = 'ended',
            entry_status = 'closed',
            ended_at = COALESCE(ended_at, now()),
            survey_closes_at = COALESCE(survey_closes_at, now() + interval '1 hour')
        WHERE project_id = $1
          AND session_id = $2
          AND status IN ('draft', 'live')
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
      [input.projectId, input.sessionId],
    );

    const row = rows[0];
    if (!row) {
      throw new BadRequestException("세션을 종료할 수 없습니다.");
    }

    const session = this.toSessionDto(row);
    await this.appendAudienceEvent({
      sessionId: input.sessionId,
      actorType: "presenter",
      actorId: input.actorId,
      type: "session.ended",
      payload: { sessionId: input.sessionId },
    });
    await this.generateAudienceAggregateReport({
      projectId: input.projectId,
      sessionId: input.sessionId,
      status: "preliminary",
    });

    return { session };
  }

  async getSessionSurveyForm(input: ProjectSessionInput) {
    const survey = await this.findSessionSurveyForm(input);
    return sessionSurveyFormResponseSchema.parse({ survey });
  }

  async upsertSessionSurveyForm(input: ProjectSessionInput & { body: unknown }) {
    const request = upsertSessionSurveyFormRequestSchema.parse(input.body);
    const session = await this.getProjectSession(input);
    if (session.status !== "draft") {
      throw new BadRequestException("세션 시작 후에는 설문을 수정할 수 없습니다.");
    }

    const rows = await this.dataSource.query<SessionSurveyFormRow[]>(
      `
        INSERT INTO session_survey_forms (
          survey_id,
          session_id,
          title,
          questions_json,
          contact_json,
          locked_at,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, null, now(), now())
        ON CONFLICT (session_id)
        DO UPDATE SET
          title = EXCLUDED.title,
          questions_json = EXCLUDED.questions_json,
          contact_json = EXCLUDED.contact_json,
          updated_at = now()
        WHERE session_survey_forms.locked_at IS NULL
        RETURNING
          survey_id,
          session_id,
          title,
          questions_json,
          contact_json,
          locked_at,
          created_at,
          updated_at
      `,
      [
        `survey_${randomUUID()}`,
        input.sessionId,
        request.title,
        JSON.stringify(request.questions),
        JSON.stringify(request.contact),
      ],
    );

    const row = rows[0];
    if (!row) {
      throw new BadRequestException("세션 시작 후에는 설문을 수정할 수 없습니다.");
    }

    return sessionSurveyFormResponseSchema.parse({
      survey: this.toSurveyFormDto(row),
    });
  }

  async createLibraryInteraction(projectId: string, body: unknown) {
    const input = createInteractionLibraryItemRequestSchema.parse(body);
    const rows = await this.dataSource.query<ProjectInteractionLibraryRow[]>(
      `
        INSERT INTO project_interaction_library (
          library_interaction_id,
          project_id,
          title,
          kind,
          questions_json,
          result_visibility,
          quiz_scoring,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, now(), now())
        RETURNING
          library_interaction_id,
          project_id,
          title,
          kind,
          questions_json,
          result_visibility,
          quiz_scoring,
          created_at,
          updated_at
      `,
      [
        `library_interaction_${randomUUID()}`,
        projectId,
        input.title,
        input.kind,
        input.questions,
        input.resultVisibility,
        input.quizScoring,
      ],
    );

    return createInteractionLibraryItemResponseSchema.parse({
      interaction: this.toLibraryInteractionDto(rows[0]),
    });
  }

  async listLibraryInteractions(projectId: string) {
    const rows = await this.dataSource.query<ProjectInteractionLibraryRow[]>(
      `
        SELECT
          library_interaction_id,
          project_id,
          title,
          kind,
          questions_json,
          result_visibility,
          quiz_scoring,
          created_at,
          updated_at
        FROM project_interaction_library
        WHERE project_id = $1
        ORDER BY updated_at DESC
      `,
      [projectId],
    );

    return listInteractionLibraryItemsResponseSchema.parse({
      interactions: rows.map((row) => this.toLibraryInteractionDto(row)),
    });
  }

  async selectSessionInteractions(input: ProjectSessionInput, body: unknown) {
    const parsed = selectSessionInteractionsRequestSchema.parse(body);
    await this.assertSessionBelongsToProject(input.projectId, input.sessionId);

    await this.dataSource.query(
      `
        DELETE FROM session_interactions
        WHERE session_id = $1
          AND source = 'library'
          AND activated_at IS NULL
      `,
      [input.sessionId],
    );

    if (parsed.libraryInteractionIds.length === 0) {
      return listSessionInteractionsResponseSchema.parse({
        interactions: await this.getSessionInteractions(input),
      });
    }

    const libraryRows =
      await this.dataSource.query<ProjectInteractionLibraryRow[]>(
        `
          SELECT
            library_interaction_id,
            project_id,
            title,
            kind,
            questions_json,
            result_visibility,
            quiz_scoring,
            created_at,
            updated_at
          FROM project_interaction_library
          WHERE project_id = $1
            AND library_interaction_id = ANY($2)
        `,
        [input.projectId, parsed.libraryInteractionIds],
      );
    const byId = new Map(
      libraryRows.map((row) => [row.library_interaction_id, row]),
    );

    for (let index = 0; index < parsed.libraryInteractionIds.length; index += 1) {
      const libraryInteractionId = parsed.libraryInteractionIds[index];
      const row = byId.get(libraryInteractionId);
      if (!row) {
        throw new NotFoundException("Interaction library item not found");
      }

      await this.dataSource.query(
        `
          INSERT INTO session_interactions (
            interaction_id,
            session_id,
            library_interaction_id,
            kind,
            title,
            questions_json,
            result_visibility,
            quiz_scoring,
            source,
            display_order,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, 'library', $9, now())
        `,
        [
          `interaction_${randomUUID()}`,
          input.sessionId,
          row.library_interaction_id,
          row.kind,
          row.title,
          normalizeQuestions(row.questions_json),
          row.result_visibility,
          row.quiz_scoring,
          index,
        ],
      );
    }

    return listSessionInteractionsResponseSchema.parse({
      interactions: await this.getSessionInteractions(input),
    });
  }

  async listSessionInteractions(input: ProjectSessionInput) {
    return listSessionInteractionsResponseSchema.parse({
      interactions: await this.getSessionInteractions(input),
    });
  }

  async createAdHocSessionInteraction(input: ProjectSessionInput, body: unknown) {
    const parsed = createAdHocSessionInteractionRequestSchema.parse(body);
    await this.assertSessionBelongsToProject(input.projectId, input.sessionId);
    const rows = await this.dataSource.query<SessionInteractionRow[]>(
      `
        INSERT INTO session_interactions (
          interaction_id,
          session_id,
          kind,
          title,
          questions_json,
          result_visibility,
          quiz_scoring,
          source,
          display_order,
          created_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5::jsonb,
          $6,
          $7,
          'ad-hoc',
          (
            SELECT COALESCE(MAX(display_order), -1) + 1
            FROM session_interactions
            WHERE session_id = $2
          ),
          now()
        )
        RETURNING
          interaction_id,
          session_id,
          kind,
          title,
          questions_json,
          result_visibility,
          quiz_scoring,
          source,
          display_order,
          activated_at,
          closed_at
      `,
      [
        `interaction_${randomUUID()}`,
        input.sessionId,
        parsed.kind,
        parsed.title,
        parsed.questions,
        parsed.resultVisibility,
        parsed.quizScoring,
      ],
    );

    return sessionInteractionResponseSchema.parse({
      interaction: this.toSessionInteractionDto(rows[0]),
    });
  }

  async activateSessionInteraction(input: ProjectSessionInput & {
    interactionId: string;
    actorId: string;
  }) {
    await this.assertSessionBelongsToProject(input.projectId, input.sessionId);

    try {
      const rows = await this.dataSource.query<SessionInteractionRow[]>(
        `
          UPDATE session_interactions
          SET activated_at = COALESCE(activated_at, now())
          WHERE session_id = $1
            AND interaction_id = $2
            AND closed_at IS NULL
          RETURNING
            interaction_id,
            session_id,
            kind,
            title,
            questions_json,
            result_visibility,
            quiz_scoring,
            source,
            display_order,
            activated_at,
            closed_at
        `,
        [input.sessionId, input.interactionId],
      );

      const row = rows[0];
      if (!row) {
        throw new NotFoundException("Session interaction not found");
      }

      await this.updateAudienceRealtimeState({
        sessionId: input.sessionId,
        actorId: input.actorId,
        slideId: null,
        slideIndex: null,
        effectState: {},
        activeInteractionId: input.interactionId,
      });

      return sessionInteractionResponseSchema.parse({
        interaction: this.toSessionInteractionDto(row),
      });
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        throw new ConflictException("이미 활성화된 상호작용이 있습니다.");
      }

      throw error;
    }
  }

  async closeSessionInteraction(input: ProjectSessionInput & {
    interactionId: string;
    actorId: string;
  }) {
    await this.assertSessionBelongsToProject(input.projectId, input.sessionId);
    const rows = await this.dataSource.query<SessionInteractionRow[]>(
      `
        UPDATE session_interactions
        SET closed_at = COALESCE(closed_at, now())
        WHERE session_id = $1
          AND interaction_id = $2
        RETURNING
          interaction_id,
          session_id,
          kind,
          title,
          questions_json,
          result_visibility,
          quiz_scoring,
          source,
          display_order,
          activated_at,
          closed_at
      `,
      [input.sessionId, input.interactionId],
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException("Session interaction not found");
    }

    await this.updateAudienceRealtimeState({
      sessionId: input.sessionId,
      actorId: input.actorId,
      slideId: null,
      slideIndex: null,
      effectState: {},
      activeInteractionId: null,
    });

    return sessionInteractionResponseSchema.parse({
      interaction: this.toSessionInteractionDto(row),
    });
  }

  async submitInteractionResponse(input: {
    sessionId: string;
    audienceId: string;
    tokenHash: string;
    interactionId: string;
    body: unknown;
  }) {
    await this.getAudienceMe(input.sessionId, input.audienceId, input.tokenHash);
    const request = submitInteractionResponseRequestSchema.parse(input.body);
    const interaction = await this.getActiveInteraction(
      input.sessionId,
      input.interactionId,
    );
    const question = interaction.questions.find(
      (candidate) => candidate.questionId === request.questionId,
    );
    if (!question) {
      throw new NotFoundException("Interaction question not found");
    }

    validateAnswerForQuestion(question, request.answer);
    const { isCorrect, score } = scoreInteractionAnswer(question, request.answer);
    const responseId = `response_${randomUUID()}`;
    const isPoll = interaction.kind === "poll";

    try {
      const rows = await this.dataSource.query<InteractionResponseRow[]>(
        isPoll
          ? `
              INSERT INTO interaction_responses (
                response_id,
                interaction_id,
                session_id,
                audience_id,
                question_id,
                answer_json,
                is_correct,
                score,
                submitted_at,
                updated_at
              )
              VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, now(), now())
              ON CONFLICT (interaction_id, audience_id, question_id)
              DO UPDATE SET
                answer_json = EXCLUDED.answer_json,
                is_correct = EXCLUDED.is_correct,
                score = EXCLUDED.score,
                updated_at = now()
              RETURNING
                response_id,
                interaction_id,
                session_id,
                audience_id,
                question_id,
                answer_json,
                is_correct,
                score,
                submitted_at,
                updated_at
            `
          : `
              INSERT INTO interaction_responses (
                response_id,
                interaction_id,
                session_id,
                audience_id,
                question_id,
                answer_json,
                is_correct,
                score,
                submitted_at,
                updated_at
              )
              VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, now(), now())
              RETURNING
                response_id,
                interaction_id,
                session_id,
                audience_id,
                question_id,
                answer_json,
                is_correct,
                score,
                submitted_at,
                updated_at
            `,
        [
          responseId,
          input.interactionId,
          input.sessionId,
          input.audienceId,
          request.questionId,
          request.answer,
          isCorrect,
          score,
        ],
      );

      await this.appendAudienceEvent({
        sessionId: input.sessionId,
        actorType: "audience",
        actorId: input.audienceId,
        type: "interaction.responded",
        payload: {
          interactionId: input.interactionId,
          questionId: request.questionId,
        },
      });

      return submitInteractionResponseResponseSchema.parse({
        response: this.toInteractionResponseDto(rows[0]),
      });
    } catch (error) {
      if (isPostgresUniqueViolation(error) && !isPoll) {
        throw new ConflictException("퀴즈 응답은 제출 후 수정할 수 없습니다.");
      }

      throw error;
    }
  }

  async getAudienceActiveInteraction(input: {
    sessionId: string;
    audienceId: string;
    tokenHash: string;
  }) {
    await this.getAudienceMe(input.sessionId, input.audienceId, input.tokenHash);
    const features = await this.getAudienceFeatureSettingsForSession(
      input.sessionId,
    );
    const rows = await this.dataSource.query<SessionInteractionRow[]>(
      `
        SELECT
          interaction_id,
          session_id,
          kind,
          title,
          questions_json,
          result_visibility,
          quiz_scoring,
          source,
          display_order,
          activated_at,
          closed_at
        FROM session_interactions
        WHERE session_id = $1
          AND activated_at IS NOT NULL
          AND closed_at IS NULL
        ORDER BY activated_at DESC
        LIMIT 1
      `,
      [input.sessionId],
    );

    const row = rows[0];
    if (!row) {
      return audienceActiveInteractionResponseSchema.parse({
        interaction: null,
        results: null,
      });
    }

    const interaction = this.toSessionInteractionDto(row);
    const enabled =
      (interaction.kind === "poll" && features.pollsEnabled) ||
      (interaction.kind === "quiz" && features.quizzesEnabled);
    if (!enabled) {
      return audienceActiveInteractionResponseSchema.parse({
        interaction: null,
        results: null,
      });
    }

    const resultsResponse = await this.getInteractionResults({
      projectId: (await this.getSessionById(input.sessionId)).projectId,
      sessionId: input.sessionId,
      interactionId: interaction.interactionId,
      audienceVisible: true,
    });

    return audienceActiveInteractionResponseSchema.parse({
      interaction,
      results: resultsResponse.results,
    });
  }

  async submitAudienceQuestion(input: {
    sessionId: string;
    audienceId: string;
    tokenHash: string;
    body: unknown;
  }) {
    await this.getAudienceMe(input.sessionId, input.audienceId, input.tokenHash);
    const features = await this.getAudienceFeatureSettingsForSession(
      input.sessionId,
    );
    if (!features.qnaEnabled) {
      throw new ForbiddenException("현재 Q&A가 열려 있지 않습니다.");
    }

    const key = `${input.sessionId}:${input.audienceId}`;
    if (!this.questionRateLimiter.consume(key)) {
      throw new ConflictException("질문은 1분에 3개까지 보낼 수 있습니다.");
    }

    const request = submitAudienceQuestionRequestSchema.parse(input.body);
    const questionId = `question_${randomUUID()}`;
    const rows = await this.dataSource.query<AudienceQuestionRow[]>(
      `
        INSERT INTO audience_questions (
          question_id,
          question_group_id,
          session_id,
          audience_id,
          text,
          status,
          submitted_at
        )
        VALUES ($1, $1, $2, $3, $4, 'pending', now())
        RETURNING
          question_id,
          question_group_id,
          session_id,
          audience_id,
          text,
          status,
          submitted_at,
          answered_at
      `,
      [questionId, input.sessionId, input.audienceId, request.text],
    );

    await this.appendAudienceEvent({
      sessionId: input.sessionId,
      actorType: "audience",
      actorId: input.audienceId,
      type: "question.submitted",
      payload: { questionId },
    });

    const question = this.toAudienceQuestionDto(rows[0]);
    if (features.aiQnaEnabled) {
      await this.createAiAnswerForQuestion(question);
    }

    return audienceQuestionResponseSchema.parse({
      question,
    });
  }

  async getAudienceQuestionStatus(input: {
    sessionId: string;
    audienceId: string;
    tokenHash: string;
    questionId: string;
  }) {
    await this.getAudienceMe(input.sessionId, input.audienceId, input.tokenHash);
    const rows = await this.dataSource.query<AudienceQuestionRow[]>(
      `
        SELECT
          question_id,
          question_group_id,
          session_id,
          audience_id,
          text,
          status,
          submitted_at,
          answered_at
        FROM audience_questions
        WHERE session_id = $1
          AND audience_id = $2
          AND question_id = $3
        LIMIT 1
      `,
      [input.sessionId, input.audienceId, input.questionId],
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException("Audience question not found");
    }

    return audienceQuestionResponseSchema.parse({
      question: this.toAudienceQuestionDto(row),
    });
  }

  async listPresenterQuestions(input: ProjectSessionInput) {
    await this.assertSessionBelongsToProject(input.projectId, input.sessionId);
    const rows = await this.dataSource.query<AudienceQuestionRow[]>(
      `
        SELECT
          question_id,
          question_group_id,
          session_id,
          audience_id,
          text,
          status,
          submitted_at,
          answered_at
        FROM audience_questions
        WHERE session_id = $1
        ORDER BY status ASC, submitted_at ASC
      `,
      [input.sessionId],
    );

    return presenterQuestionQueueResponseSchema.parse({
      questions: rows.map((row) => this.toAudienceQuestionDto(row)),
    });
  }

  async markQuestionAnswered(input: ProjectSessionInput & {
    questionId: string;
    actorId: string;
  }) {
    await this.assertSessionBelongsToProject(input.projectId, input.sessionId);
    const rows = await this.dataSource.query<AudienceQuestionRow[]>(
      `
        UPDATE audience_questions
        SET status = 'answered',
            answered_at = COALESCE(answered_at, now())
        WHERE session_id = $1
          AND question_id = $2
        RETURNING
          question_id,
          question_group_id,
          session_id,
          audience_id,
          text,
          status,
          submitted_at,
          answered_at
      `,
      [input.sessionId, input.questionId],
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException("Audience question not found");
    }

    await this.appendAudienceEvent({
      sessionId: input.sessionId,
      actorType: "presenter",
      actorId: input.actorId,
      type: "question.answered",
      payload: { questionId: input.questionId },
    });

    return markAudienceQuestionAnsweredResponseSchema.parse({
      question: this.toAudienceQuestionDto(row),
    });
  }

  async updateAiReferenceSelection(input: ProjectSessionInput, body: unknown) {
    const parsed = updateAiReferenceSelectionRequestSchema.parse(body);
    await this.assertSessionBelongsToProject(input.projectId, input.sessionId);
    const rows = await this.dataSource.query<
      { selected_reference_ids_json: string[] | string }[]
    >(
      `
        UPDATE presentation_sessions
        SET selected_reference_ids_json = $3::jsonb
        WHERE project_id = $1
          AND session_id = $2
        RETURNING selected_reference_ids_json
      `,
      [input.projectId, input.sessionId, parsed.referenceIds],
    );
    const value = rows[0]?.selected_reference_ids_json ?? [];
    return updateAiReferenceSelectionResponseSchema.parse({
      referenceIds:
        typeof value === "string" ? (JSON.parse(value) as string[]) : value,
    });
  }

  async getAudienceQuestionAnswer(input: {
    sessionId: string;
    audienceId: string;
    tokenHash: string;
    questionId: string;
  }) {
    const questionResponse = await this.getAudienceQuestionStatus(input);
    const rows = await this.dataSource.query<AudienceQuestionAnswerRow[]>(
      `
        SELECT
          question_id,
          session_id,
          audience_id,
          answer_text,
          source_references_json,
          confidence,
          failure_reason,
          feedback,
          escalated_to_presenter,
          created_at
        FROM audience_question_answers
        WHERE session_id = $1
          AND audience_id = $2
          AND question_id = $3
        LIMIT 1
      `,
      [input.sessionId, input.audienceId, input.questionId],
    );

    return audienceQuestionAnswerResponseSchema.parse({
      question: questionResponse.question,
      answer: rows[0] ? this.toQuestionAnswerDto(rows[0]) : null,
    });
  }

  async updateAiAnswerFeedback(input: {
    sessionId: string;
    audienceId: string;
    tokenHash: string;
    questionId: string;
    body: unknown;
  }) {
    const feedback = updateAiAnswerFeedbackRequestSchema.parse(input.body);
    await this.getAudienceQuestionStatus(input);
    const escalated = feedback.feedback === "unresolved";
    const rows = await this.dataSource.query<AudienceQuestionAnswerRow[]>(
      `
        UPDATE audience_question_answers
        SET feedback = $4,
            escalated_to_presenter = escalated_to_presenter OR $5
        WHERE session_id = $1
          AND audience_id = $2
          AND question_id = $3
        RETURNING
          question_id,
          session_id,
          audience_id,
          answer_text,
          source_references_json,
          confidence,
          failure_reason,
          feedback,
          escalated_to_presenter,
          created_at
      `,
      [
        input.sessionId,
        input.audienceId,
        input.questionId,
        feedback.feedback,
        escalated,
      ],
    );

    if (escalated) {
      await this.dataSource.query(
        `
          UPDATE audience_questions
          SET status = 'pending',
              answered_at = NULL
          WHERE session_id = $1
            AND question_id = $2
        `,
        [input.sessionId, input.questionId],
      );
    }

    return audienceQuestionAnswerResponseSchema.parse({
      question: (
        await this.getAudienceQuestionStatus(input)
      ).question,
      answer: rows[0] ? this.toQuestionAnswerDto(rows[0]) : null,
    });
  }

  async submitReaction(input: {
    sessionId: string;
    audienceId: string;
    tokenHash: string;
    body: unknown;
  }) {
    await this.getAudienceMe(input.sessionId, input.audienceId, input.tokenHash);
    const features = await this.getAudienceFeatureSettingsForSession(
      input.sessionId,
    );
    if (!features.reactionsEnabled) {
      throw new ForbiddenException("현재 반응 보내기가 닫혀 있습니다.");
    }

    if (
      !this.reactionRateLimiter.consume(
        `${input.sessionId}:${input.audienceId}`,
      )
    ) {
      throw new ConflictException("반응을 잠시 후 다시 보내 주세요.");
    }

    const request = submitReactionRequestSchema.parse(input.body);
    await this.appendAudienceEvent({
      sessionId: input.sessionId,
      actorType: "audience",
      actorId: input.audienceId,
      type: "reaction.sent",
      payload: { reaction: request.reaction },
    });

    return submitReactionResponseSchema.parse({
      reaction: request.reaction,
      accepted: true,
    });
  }

  async getAudienceSurveyForm(input: {
    sessionId: string;
    audienceId: string;
    tokenHash: string;
  }) {
    await this.getAudienceMe(input.sessionId, input.audienceId, input.tokenHash);
    const features = await this.getAudienceFeatureSettingsForSession(
      input.sessionId,
    );
    if (!features.surveyEnabled) {
      return sessionSurveyFormResponseSchema.parse({ survey: null });
    }

    const survey = await this.findSessionSurveyForm({
      sessionId: input.sessionId,
    });
    return sessionSurveyFormResponseSchema.parse({ survey });
  }

  async submitSurveyResponse(input: {
    sessionId: string;
    audienceId: string;
    tokenHash: string;
    body: unknown;
  }) {
    const request = submitSurveyResponseRequestSchema.parse(input.body);
    const { participant } = await this.getAudienceMe(
      input.sessionId,
      input.audienceId,
      input.tokenHash,
    );
    if (!participant.joinedBeforeEnd) {
      throw new ForbiddenException("설문 제출 대상이 아닙니다.");
    }

    const [session, features, survey] = await Promise.all([
      this.getSessionById(input.sessionId),
      this.getAudienceFeatureSettingsForSession(input.sessionId),
      this.findSessionSurveyForm({ sessionId: input.sessionId }),
    ]);
    if (!features.surveyEnabled || !survey) {
      throw new ForbiddenException("현재 설문이 열려 있지 않습니다.");
    }
    if (session.status !== "ended" || !session.endedAt) {
      throw new ForbiddenException("발표 종료 후 설문을 제출할 수 있습니다.");
    }

    const closesAt = session.surveyClosesAt
      ? new Date(session.surveyClosesAt)
      : new Date(new Date(session.endedAt).getTime() + 60 * 60 * 1000);
    if (Date.now() > closesAt.getTime()) {
      throw new ForbiddenException("설문 응답 시간이 종료되었습니다.");
    }

    validateSurveyAnswers(survey.questions, request.answers, "answers");
    if (!survey.contact.enabled && Object.keys(request.contactAnswers).length) {
      throw new BadRequestException("연락처 수집이 비활성화되어 있습니다.");
    }
    if (request.contactConsent) {
      validateSurveyAnswers(
        survey.contact.fields,
        request.contactAnswers,
        "contactAnswers",
      );
    }

    try {
      const rows = await this.dataSource.query<SessionSurveyResponseRow[]>(
        `
          INSERT INTO session_survey_responses (
            response_id,
            survey_id,
            session_id,
            audience_id,
            answers_json,
            contact_consent,
            contact_answers_json,
            submitted_at
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, now())
          RETURNING
            response_id,
            survey_id,
            session_id,
            audience_id,
            submitted_at,
            answers_json,
            contact_consent,
            contact_answers_json
        `,
        [
          `survey_response_${randomUUID()}`,
          survey.surveyId,
          input.sessionId,
          input.audienceId,
          JSON.stringify(request.answers),
          request.contactConsent,
          JSON.stringify(request.contactAnswers),
        ],
      );

      const response = this.toSurveyResponseDto(rows[0]);
      await this.appendAudienceEvent({
        sessionId: input.sessionId,
        actorType: "audience",
        actorId: input.audienceId,
        type: "survey.submitted",
        payload: { surveyId: survey.surveyId, responseId: response.responseId },
      });

      return submitSurveyResponseResponseSchema.parse({ response });
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        throw new ConflictException("이미 설문을 제출했습니다.");
      }
      throw error;
    }
  }

  async exportSessionSurveyCsv(input: ProjectSessionInput): Promise<string> {
    const rawDataDeletedAt = await this.findRawDataDeletedAt(input.sessionId);
    if (rawDataDeletedAt) {
      throw new GoneException("원본 설문 데이터 보관 기간이 종료되었습니다.");
    }

    const survey = await this.findSessionSurveyForm(input);
    if (!survey) {
      return "submittedAt,nickname\n";
    }

    const rows = await this.dataSource.query<SessionSurveyCsvRow[]>(
      `
        SELECT
          responses.response_id,
          responses.survey_id,
          responses.session_id,
          responses.audience_id,
          responses.submitted_at,
          responses.answers_json,
          responses.contact_consent,
          responses.contact_answers_json,
          participants.nickname
        FROM session_survey_responses AS responses
        INNER JOIN audience_participants AS participants
          ON participants.audience_id = responses.audience_id
        INNER JOIN presentation_sessions AS sessions
          ON sessions.session_id = responses.session_id
        WHERE sessions.project_id = $1
          AND responses.session_id = $2
        ORDER BY responses.submitted_at ASC
      `,
      [input.projectId, input.sessionId],
    );

    return buildSurveyCsv(survey, rows);
  }

  async getSessionResults(input: ProjectSessionInput) {
    const report = await this.generateAudienceAggregateReport({
      ...input,
      status: "preliminary",
    });
    const surveyResponses = await this.listSurveyResponses(input);
    return sessionResultsResponseSchema.parse({ report, surveyResponses });
  }

  async cleanupExpiredAudienceRawData(now = new Date()) {
    const sessions = await this.dataSource.query<PresentationSessionRow[]>(
      `
        ${selectPresentationSessionSql()}
        WHERE raw_data_delete_after <= $1
      `,
      [now],
    );
    let cleanedCount = 0;

    for (const row of sessions) {
      const session = this.toSessionDto(row);
      const deletedAt = await this.findRawDataDeletedAt(session.sessionId);
      if (deletedAt) {
        continue;
      }

      await this.generateAudienceAggregateReport({
        projectId: session.projectId,
        sessionId: session.sessionId,
        status: "final",
      });
      await this.deleteAudienceRawData(session.sessionId);
      await this.markAggregateRawDataDeleted(session.sessionId, now);
      cleanedCount += 1;
    }

    return { cleanedCount };
  }

  async getInteractionResults(input: ProjectSessionInput & {
    interactionId: string;
    audienceVisible?: boolean;
  }) {
    const interaction = await this.getSessionInteractionForProject(input);
    const responses = await this.dataSource.query<InteractionResponseRow[]>(
      `
        SELECT
          response_id,
          interaction_id,
          session_id,
          audience_id,
          question_id,
          answer_json,
          is_correct,
          score,
          submitted_at,
          updated_at
        FROM interaction_responses
        WHERE session_id = $1
          AND interaction_id = $2
      `,
      [input.sessionId, input.interactionId],
    );

    const results = aggregateInteractionResults(
      interaction,
      responses.map((row) => this.toInteractionResponseDto(row)),
      Boolean(input.audienceVisible),
    );

    return interactionResultsResponseSchema.parse({ results });
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

  private async getAudienceFeatureSettingsForSession(
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

  private async getAudienceFeatureSettingsForProject(
    projectId: string,
    sessionId: string,
  ): Promise<AudienceFeatureSettings> {
    const rows = await this.dataSource.query<AudienceFeatureSettingsRow[]>(
      `
        SELECT
          features.session_id,
          features.qna_enabled,
          features.ai_qna_enabled,
          features.polls_enabled,
          features.quizzes_enabled,
          features.reactions_enabled,
          features.survey_enabled,
          features.updated_at
        FROM audience_feature_settings AS features
        INNER JOIN presentation_sessions AS sessions
          ON sessions.session_id = features.session_id
        WHERE sessions.project_id = $1
          AND features.session_id = $2
        LIMIT 1
      `,
      [projectId, sessionId],
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException("Audience feature settings not found");
    }

    return this.toFeatureSettingsDto(row);
  }

  private async assertSessionBelongsToProject(
    projectId: string,
    sessionId: string,
  ): Promise<void> {
    const rows = await this.dataSource.query<{ session_id: string }[]>(
      `
        SELECT session_id
        FROM presentation_sessions
        WHERE project_id = $1
          AND session_id = $2
        LIMIT 1
      `,
      [projectId, sessionId],
    );

    if (!rows[0]) {
      throw new NotFoundException("Presentation session not found");
    }
  }

  private async generateAudienceAggregateReport(input: ProjectSessionInput & {
    status: "preliminary" | "final";
  }): Promise<AudienceAggregateReport> {
    await this.assertSessionBelongsToProject(input.projectId, input.sessionId);
    const aggregate = await this.buildAudienceAggregate(input.sessionId);
    const rows = await this.dataSource.query<AudienceAggregateReportRow[]>(
      `
        INSERT INTO audience_aggregate_reports (
          report_id,
          session_id,
          status,
          aggregate_json,
          generated_at
        )
        VALUES ($1, $2, $3, $4::jsonb, now())
        ON CONFLICT (session_id)
        DO UPDATE SET
          status = EXCLUDED.status,
          aggregate_json = EXCLUDED.aggregate_json,
          generated_at = now()
        RETURNING
          report_id,
          session_id,
          status,
          aggregate_json,
          generated_at,
          raw_data_deleted_at
      `,
      [
        `audience_report_${randomUUID()}`,
        input.sessionId,
        input.status,
        JSON.stringify(aggregate),
      ],
    );

    return this.toAggregateReportDto(rows[0]);
  }

  private async buildAudienceAggregate(sessionId: string) {
    const [qnaRows, reactionRows, interactionRows, surveyRows] =
      await Promise.all([
        this.dataSource.query<
          { total: number | string; unanswered: number | string }[]
        >(
          `
            SELECT
              count(*) AS total,
              count(*) FILTER (WHERE status = 'pending') AS unanswered
            FROM audience_questions
            WHERE session_id = $1
          `,
          [sessionId],
        ),
        this.dataSource.query<{ reaction: string | null; count: string }[]>(
          `
            SELECT payload_json ->> 'reaction' AS reaction, count(*) AS count
            FROM audience_events
            WHERE session_id = $1
              AND type = 'reaction.sent'
            GROUP BY payload_json ->> 'reaction'
          `,
          [sessionId],
        ),
        this.dataSource.query<
          {
            interaction_id: string;
            kind: string;
            title: string;
            response_count: number | string;
          }[]
        >(
          `
            SELECT
              interactions.interaction_id,
              interactions.kind,
              interactions.title,
              count(responses.response_id) AS response_count
            FROM session_interactions AS interactions
            LEFT JOIN interaction_responses AS responses
              ON responses.interaction_id = interactions.interaction_id
            WHERE interactions.session_id = $1
            GROUP BY interactions.interaction_id, interactions.kind, interactions.title
            ORDER BY interactions.display_order ASC
          `,
          [sessionId],
        ),
        this.dataSource.query<{ response_count: number | string }[]>(
          `
            SELECT count(*) AS response_count
            FROM session_survey_responses
            WHERE session_id = $1
          `,
          [sessionId],
        ),
      ]);

    return {
      qna: {
        total: Number(qnaRows[0]?.total ?? 0),
        unanswered: Number(qnaRows[0]?.unanswered ?? 0),
      },
      reactions: Object.fromEntries(
        reactionRows
          .filter((row) => row.reaction)
          .map((row) => [row.reaction!, Number(row.count)]),
      ),
      interactions: interactionRows.map((row) => ({
        interactionId: row.interaction_id,
        kind: row.kind,
        title: row.title,
        responseCount: Number(row.response_count),
      })),
      survey: {
        responseCount: Number(surveyRows[0]?.response_count ?? 0),
      },
    };
  }

  private async listSurveyResponses(
    input: ProjectSessionInput,
  ): Promise<SurveyResponse[]> {
    await this.assertSessionBelongsToProject(input.projectId, input.sessionId);
    const rows = await this.dataSource.query<SessionSurveyResponseRow[]>(
      `
        SELECT
          responses.response_id,
          responses.survey_id,
          responses.session_id,
          responses.audience_id,
          responses.submitted_at,
          responses.answers_json,
          responses.contact_consent,
          responses.contact_answers_json
        FROM session_survey_responses AS responses
        WHERE responses.session_id = $1
        ORDER BY responses.submitted_at ASC
      `,
      [input.sessionId],
    );

    return rows.map((row) => this.toSurveyResponseDto(row));
  }

  private async findRawDataDeletedAt(
    sessionId: string,
  ): Promise<string | null> {
    const rows = await this.dataSource.query<
      { raw_data_deleted_at: Date | string | null }[]
    >(
      `
        SELECT raw_data_deleted_at
        FROM audience_aggregate_reports
        WHERE session_id = $1
        LIMIT 1
      `,
      [sessionId],
    );

    return rows[0]?.raw_data_deleted_at
      ? toIso(rows[0].raw_data_deleted_at)
      : null;
  }

  private async markAggregateRawDataDeleted(sessionId: string, deletedAt: Date) {
    await this.dataSource.query(
      `
        UPDATE audience_aggregate_reports
        SET raw_data_deleted_at = $2
        WHERE session_id = $1
      `,
      [sessionId, deletedAt],
    );
  }

  private async deleteAudienceRawData(sessionId: string) {
    for (const statement of [
      "DELETE FROM session_survey_responses WHERE session_id = $1",
      "DELETE FROM interaction_responses WHERE session_id = $1",
      "DELETE FROM audience_question_answers WHERE session_id = $1",
      "DELETE FROM audience_questions WHERE session_id = $1",
      "DELETE FROM audience_events WHERE session_id = $1",
      "DELETE FROM audience_participants WHERE session_id = $1",
    ]) {
      await this.dataSource.query(statement, [sessionId]);
    }
  }

  private async createAiAnswerForQuestion(
    question: AudienceQuestion,
  ): Promise<AudienceQuestionAnswer> {
    const session = await this.getSessionById(question.sessionId);
    const [selectedReferenceIds, publicSlideContext] = await Promise.all([
      this.getSelectedReferenceIds(question.sessionId),
      this.getPublicSlideContext(question.sessionId),
    ]);

    let workerResponse: QnaWorkerAnswerResponse;
    try {
      workerResponse = await callQnaWorker({
        projectId: session.projectId,
        sessionId: question.sessionId,
        questionId: question.questionId,
        questionText: question.text,
        publicSlideContext,
        selectedReferenceIds,
      });
    } catch (error) {
      workerResponse = {
        status: error instanceof DOMException && error.name === "TimeoutError"
          ? "failed"
          : "failed",
        failureReason:
          error instanceof DOMException && error.name === "TimeoutError"
            ? "timeout"
            : "worker-error",
        sourceReferences: [],
        confidence: null,
      };
    }

    const rowInput =
      workerResponse.status === "answered"
        ? {
            answerText: workerResponse.answerText,
            sourceReferences: workerResponse.sourceReferences,
            confidence: workerResponse.confidence,
            failureReason: null,
            escalatedToPresenter: false,
          }
        : {
            answerText: null,
            sourceReferences: workerResponse.sourceReferences,
            confidence: workerResponse.confidence,
            failureReason: workerResponse.failureReason,
            escalatedToPresenter: true,
          };

    const rows = await this.dataSource.query<AudienceQuestionAnswerRow[]>(
      `
        INSERT INTO audience_question_answers (
          question_id,
          session_id,
          audience_id,
          answer_text,
          source_references_json,
          confidence,
          failure_reason,
          feedback,
          escalated_to_presenter,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NULL, $8, now())
        ON CONFLICT (question_id)
        DO UPDATE SET
          answer_text = EXCLUDED.answer_text,
          source_references_json = EXCLUDED.source_references_json,
          confidence = EXCLUDED.confidence,
          failure_reason = EXCLUDED.failure_reason,
          escalated_to_presenter = EXCLUDED.escalated_to_presenter
        RETURNING
          question_id,
          session_id,
          audience_id,
          answer_text,
          source_references_json,
          confidence,
          failure_reason,
          feedback,
          escalated_to_presenter,
          created_at
      `,
      [
        question.questionId,
        question.sessionId,
        question.audienceId,
        rowInput.answerText,
        rowInput.sourceReferences,
        rowInput.confidence,
        rowInput.failureReason,
        rowInput.escalatedToPresenter,
      ],
    );

    return this.toQuestionAnswerDto(rows[0]);
  }

  private async getSelectedReferenceIds(sessionId: string): Promise<string[]> {
    const rows = await this.dataSource.query<
      { selected_reference_ids_json: string[] | string }[]
    >(
      `
        SELECT selected_reference_ids_json
        FROM presentation_sessions
        WHERE session_id = $1
        LIMIT 1
      `,
      [sessionId],
    );
    const value = rows[0]?.selected_reference_ids_json ?? [];
    return typeof value === "string" ? (JSON.parse(value) as string[]) : value;
  }

  private async getPublicSlideContext(sessionId: string): Promise<string> {
    const rows = await this.dataSource.query<{ slide_id: string | null }[]>(
      `
        SELECT slide_id
        FROM audience_realtime_state
        WHERE session_id = $1
        LIMIT 1
      `,
      [sessionId],
    );
    const slideId = rows[0]?.slide_id;
    return slideId ? `Current public slide: ${slideId}` : "";
  }

  private async getSessionInteractions(
    input: ProjectSessionInput,
  ): Promise<SessionInteraction[]> {
    await this.assertSessionBelongsToProject(input.projectId, input.sessionId);
    const rows = await this.dataSource.query<SessionInteractionRow[]>(
      `
        SELECT
          interaction_id,
          session_id,
          kind,
          title,
          questions_json,
          result_visibility,
          quiz_scoring,
          source,
          display_order,
          activated_at,
          closed_at
        FROM session_interactions
        WHERE session_id = $1
        ORDER BY display_order ASC
      `,
      [input.sessionId],
    );

    return rows.map((row) => this.toSessionInteractionDto(row));
  }

  private async getActiveInteraction(
    sessionId: string,
    interactionId: string,
  ): Promise<SessionInteraction> {
    const rows = await this.dataSource.query<SessionInteractionRow[]>(
      `
        SELECT
          interaction_id,
          session_id,
          kind,
          title,
          questions_json,
          result_visibility,
          quiz_scoring,
          source,
          display_order,
          activated_at,
          closed_at
        FROM session_interactions
        WHERE session_id = $1
          AND interaction_id = $2
          AND activated_at IS NOT NULL
          AND closed_at IS NULL
        LIMIT 1
      `,
      [sessionId, interactionId],
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException("Active interaction not found");
    }

    return this.toSessionInteractionDto(row);
  }

  private async getSessionInteractionForProject(
    input: ProjectSessionInput & { interactionId: string },
  ): Promise<SessionInteraction> {
    await this.assertSessionBelongsToProject(input.projectId, input.sessionId);
    const rows = await this.dataSource.query<SessionInteractionRow[]>(
      `
        SELECT
          interaction_id,
          session_id,
          kind,
          title,
          questions_json,
          result_visibility,
          quiz_scoring,
          source,
          display_order,
          activated_at,
          closed_at
        FROM session_interactions
        WHERE session_id = $1
          AND interaction_id = $2
        LIMIT 1
      `,
      [input.sessionId, input.interactionId],
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException("Session interaction not found");
    }

    return this.toSessionInteractionDto(row);
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

  private async getProjectSession(
    input: ProjectSessionInput,
  ): Promise<PresentationSession> {
    const rows = await this.dataSource.query<PresentationSessionRow[]>(
      `
        ${selectPresentationSessionSql()}
        WHERE project_id = $1
          AND session_id = $2
        LIMIT 1
      `,
      [input.projectId, input.sessionId],
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException("Presentation session not found");
    }

    return this.toSessionDto(row);
  }

  private async findSessionSurveyForm(input: {
    projectId?: string;
    sessionId: string;
  }): Promise<SurveyForm | null> {
    const rows = input.projectId
      ? await this.dataSource.query<SessionSurveyFormRow[]>(
          `
            SELECT
              forms.survey_id,
              forms.session_id,
              forms.title,
              forms.questions_json,
              forms.contact_json,
              forms.locked_at,
              forms.created_at,
              forms.updated_at
            FROM session_survey_forms AS forms
            INNER JOIN presentation_sessions AS sessions
              ON sessions.session_id = forms.session_id
            WHERE sessions.project_id = $1
              AND forms.session_id = $2
            LIMIT 1
          `,
          [input.projectId, input.sessionId],
        )
      : await this.dataSource.query<SessionSurveyFormRow[]>(
          `
            SELECT
              survey_id,
              session_id,
              title,
              questions_json,
              contact_json,
              locked_at,
              created_at,
              updated_at
            FROM session_survey_forms
            WHERE session_id = $1
            LIMIT 1
          `,
          [input.sessionId],
        );

    return rows[0] ? this.toSurveyFormDto(rows[0]) : null;
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

  private toLibraryInteractionDto(
    row: ProjectInteractionLibraryRow,
  ): ProjectInteractionLibraryItem {
    return {
      libraryInteractionId: row.library_interaction_id,
      projectId: row.project_id,
      title: row.title,
      kind: row.kind,
      questions: normalizeQuestions(row.questions_json),
      resultVisibility: row.result_visibility,
      quizScoring: row.quiz_scoring,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    };
  }

  private toSessionInteractionDto(row: SessionInteractionRow): SessionInteraction {
    return {
      interactionId: row.interaction_id,
      sessionId: row.session_id,
      kind: row.kind,
      title: row.title,
      questions: normalizeQuestions(row.questions_json),
      resultVisibility: row.result_visibility,
      quizScoring: row.quiz_scoring,
      source: row.source,
      order: row.display_order,
      activatedAt: toNullableIso(row.activated_at),
      closedAt: toNullableIso(row.closed_at),
    };
  }

  private toInteractionResponseDto(
    row: InteractionResponseRow,
  ): InteractionResponse {
    return {
      responseId: row.response_id,
      interactionId: row.interaction_id,
      sessionId: row.session_id,
      audienceId: row.audience_id,
      questionId: row.question_id,
      answer: normalizeInteractionAnswer(row.answer_json),
      isCorrect: row.is_correct,
      score: Number(row.score),
      submittedAt: toIso(row.submitted_at),
      updatedAt: toIso(row.updated_at),
    };
  }

  private toAudienceQuestionDto(row: AudienceQuestionRow): AudienceQuestion {
    return {
      questionId: row.question_id,
      questionGroupId: row.question_group_id,
      sessionId: row.session_id,
      audienceId: row.audience_id,
      text: row.text,
      status: row.status,
      submittedAt: toIso(row.submitted_at),
      answeredAt: toNullableIso(row.answered_at),
    };
  }

  private toSurveyFormDto(row: SessionSurveyFormRow): SurveyForm {
    const questions =
      typeof row.questions_json === "string"
        ? (JSON.parse(row.questions_json) as InteractionQuestion[])
        : row.questions_json;
    const contact =
      typeof row.contact_json === "string"
        ? (JSON.parse(row.contact_json) as SurveyForm["contact"])
        : row.contact_json;

    return sessionSurveyFormResponseSchema.parse({
      survey: {
        surveyId: row.survey_id,
        sessionId: row.session_id,
        title: row.title,
        questions,
        contact,
        lockedAt: toNullableIso(row.locked_at),
      },
    }).survey!;
  }

  private toSurveyResponseDto(row: SessionSurveyResponseRow): SurveyResponse {
    return {
      responseId: row.response_id,
      surveyId: row.survey_id,
      sessionId: row.session_id,
      audienceId: row.audience_id,
      submittedAt: toIso(row.submitted_at),
      answers: normalizeJsonRecord(row.answers_json),
      contactConsent: row.contact_consent,
      contactAnswers: normalizeJsonRecord(row.contact_answers_json),
    };
  }

  private toAggregateReportDto(
    row: AudienceAggregateReportRow,
  ): AudienceAggregateReport {
    return audienceAggregateReportSchema.parse({
      reportId: row.report_id,
      sessionId: row.session_id,
      status: row.status,
      aggregate: normalizeJsonRecord(row.aggregate_json),
      generatedAt: toIso(row.generated_at),
      rawDataDeletedAt: toNullableIso(row.raw_data_deleted_at),
    });
  }

  private toQuestionAnswerDto(
    row: AudienceQuestionAnswerRow,
  ): AudienceQuestionAnswer {
    const sourceReferences =
      typeof row.source_references_json === "string"
        ? (JSON.parse(row.source_references_json) as string[])
        : row.source_references_json;

    return {
      questionId: row.question_id,
      sessionId: row.session_id,
      audienceId: row.audience_id,
      answerText: row.answer_text,
      sourceReferences,
      confidence: row.confidence === null ? null : Number(row.confidence),
      failureReason: row.failure_reason,
      feedback: row.feedback,
      escalatedToPresenter: row.escalated_to_presenter,
      createdAt: toIso(row.created_at),
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

function normalizeQuestions(value: InteractionQuestion[] | string) {
  return typeof value === "string"
    ? (JSON.parse(value) as InteractionQuestion[])
    : value;
}

function normalizeInteractionAnswer(value: InteractionAnswer | string) {
  return typeof value === "string"
    ? (JSON.parse(value) as InteractionAnswer)
    : value;
}

function validateAnswerForQuestion(
  question: InteractionQuestion,
  answer: InteractionAnswer,
) {
  if (question.type !== answer.type) {
    throw new ConflictException("질문 유형과 응답 유형이 일치하지 않습니다.");
  }

  if (
    (question.type === "choice" || question.type === "quiz-multiple-choice") &&
    answer.type === question.type
  ) {
    const optionIds = new Set(question.options.map((option) => option.optionId));
    const selected = answer.selectedOptionIds;
    if (
      (question.type === "choice" && !question.allowMultiple && selected.length > 1) ||
      selected.some((optionId) => !optionIds.has(optionId))
    ) {
      throw new ConflictException("선택한 보기가 유효하지 않습니다.");
    }
  }

  if (question.type === "ranking" && answer.type === "ranking") {
    const optionIds = new Set(question.options.map((option) => option.optionId));
    if (answer.orderedOptionIds.some((optionId) => !optionIds.has(optionId))) {
      throw new ConflictException("선택한 순위 보기가 유효하지 않습니다.");
    }
  }
}

function scoreInteractionAnswer(
  question: InteractionQuestion,
  answer: InteractionAnswer,
): { isCorrect: boolean | null; score: number } {
  if (question.type === "quiz-true-false" && answer.type === "quiz-true-false") {
    const isCorrect = question.correctAnswer === answer.answer;
    return { isCorrect, score: isCorrect ? 1 : 0 };
  }

  if (
    question.type === "quiz-multiple-choice" &&
    answer.type === "quiz-multiple-choice"
  ) {
    const expected = [...question.correctOptionIds].sort();
    const actual = [...answer.selectedOptionIds].sort();
    const isCorrect =
      expected.length === actual.length &&
      expected.every((optionId, index) => optionId === actual[index]);
    return { isCorrect, score: isCorrect ? 1 : 0 };
  }

  return { isCorrect: null, score: 0 };
}

function aggregateInteractionResults(
  interaction: SessionInteraction,
  responses: InteractionResponse[],
  audienceVisible: boolean,
): InteractionResults {
  const visibleToAudience =
    !audienceVisible ||
    interaction.resultVisibility === "live" ||
    interaction.resultVisibility === "manual" ||
    (interaction.resultVisibility === "after-close" &&
      interaction.closedAt !== null);

  const questionResults = interaction.questions.map((question) => {
    const questionResponses = responses.filter(
      (response) => response.questionId === question.questionId,
    );
    const optionCounts: Record<string, number> = {};
    const openTextResponses: string[] = [];
    const scaleValues: number[] = [];

    for (const response of questionResponses) {
      const answer = response.answer;
      if (
        (answer.type === "choice" || answer.type === "quiz-multiple-choice") &&
        "selectedOptionIds" in answer
      ) {
        for (const optionId of answer.selectedOptionIds) {
          optionCounts[optionId] = (optionCounts[optionId] ?? 0) + 1;
        }
      }

      if (answer.type === "quiz-true-false") {
        const key = String(answer.answer);
        optionCounts[key] = (optionCounts[key] ?? 0) + 1;
      }

      if (answer.type === "ranking") {
        answer.orderedOptionIds.forEach((optionId, index) => {
          optionCounts[optionId] = (optionCounts[optionId] ?? 0) + index + 1;
        });
      }

      if (answer.type === "scale") {
        scaleValues.push(answer.value);
      }

      if (answer.type === "open-text") {
        openTextResponses.push(answer.text);
      }
    }

    const average =
      scaleValues.length === 0
        ? null
        : scaleValues.reduce((sum, value) => sum + value, 0) /
          scaleValues.length;

    return {
      questionId: question.questionId,
      responseCount: questionResponses.length,
      optionCounts: visibleToAudience ? optionCounts : {},
      average: visibleToAudience ? average : null,
      openTextResponses: visibleToAudience ? openTextResponses : [],
    };
  });

  return {
    interactionId: interaction.interactionId,
    sessionId: interaction.sessionId,
    visibleToAudience,
    responseCount: responses.length,
    questionResults,
  };
}

function normalizeAudienceFeatureSettingsUpdate(
  current: AudienceFeatureSettings,
  patch: UpdateAudienceFeatureSettingsRequest,
): AudienceFeatureSettings {
  const next = {
    ...current,
    ...patch,
  };

  if (patch.aiQnaEnabled === true) {
    next.qnaEnabled = true;
  }

  if (patch.qnaEnabled === false) {
    next.aiQnaEnabled = false;
  }

  return next;
}

function validateSurveyAnswers(
  questions: InteractionQuestion[],
  answers: Record<string, unknown>,
  label: "answers" | "contactAnswers",
) {
  for (const question of questions) {
    if (question.type.startsWith("quiz-")) {
      throw new BadRequestException("설문에는 퀴즈 문항을 사용할 수 없습니다.");
    }

    const value = answers[question.questionId];
    if (isMissingSurveyAnswer(value)) {
      if ("required" in question && question.required) {
        throw new BadRequestException(
          `${label}.${question.questionId} 필수 응답입니다.`,
        );
      }
      continue;
    }

    if (question.type === "choice") {
      validateChoiceAnswer(question, value);
    } else if (question.type === "scale") {
      if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < question.min ||
        value > question.max
      ) {
        throw new BadRequestException(
          `${label}.${question.questionId} 응답 범위가 올바르지 않습니다.`,
        );
      }
    } else if (question.type === "open-text") {
      if (typeof value !== "string" || value.length > question.maxLength) {
        throw new BadRequestException(
          `${label}.${question.questionId} 응답 형식이 올바르지 않습니다.`,
        );
      }
    } else if (question.type === "ranking") {
      validateRankingAnswer(question, value);
    }
  }
}

function isMissingSurveyAnswer(value: unknown) {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function validateChoiceAnswer(
  question: Extract<InteractionQuestion, { type: "choice" }>,
  value: unknown,
) {
  const optionIds = new Set(question.options.map((option) => option.optionId));
  const values = Array.isArray(value) ? value : [value];
  if (!question.allowMultiple && values.length !== 1) {
    throw new BadRequestException(`${question.questionId} 단일 선택 문항입니다.`);
  }
  if (
    values.length === 0 ||
    !values.every((item) => typeof item === "string" && optionIds.has(item))
  ) {
    throw new BadRequestException(
      `${question.questionId} 선택지가 올바르지 않습니다.`,
    );
  }
}

function validateRankingAnswer(
  question: Extract<InteractionQuestion, { type: "ranking" }>,
  value: unknown,
) {
  if (!Array.isArray(value)) {
    throw new BadRequestException(
      `${question.questionId} 순위 응답 형식이 올바르지 않습니다.`,
    );
  }

  const optionIds = new Set(question.options.map((option) => option.optionId));
  const uniqueValues = new Set(value);
  if (
    value.length > question.options.length ||
    uniqueValues.size !== value.length ||
    !value.every((item) => typeof item === "string" && optionIds.has(item))
  ) {
    throw new BadRequestException(
      `${question.questionId} 순위 응답 값이 올바르지 않습니다.`,
    );
  }
}

function buildSurveyCsv(survey: SurveyForm, rows: SessionSurveyCsvRow[]) {
  const surveyQuestions = survey.questions;
  const contactFields = survey.contact.fields;
  const headers = [
    "submittedAt",
    "nickname",
    ...surveyQuestions.map((question) => `answer:${question.prompt}`),
    "contactConsent",
    ...contactFields.map((field) => `contact:${field.prompt}`),
  ];
  const lines = [headers.map(csvEscape).join(",")];

  for (const row of rows) {
    const answers = normalizeJsonRecord(row.answers_json);
    const contactAnswers = normalizeJsonRecord(row.contact_answers_json);
    lines.push(
      [
        toIso(row.submitted_at),
        row.nickname,
        ...surveyQuestions.map((question) =>
          csvValue(answers[question.questionId]),
        ),
        row.contact_consent ? "true" : "false",
        ...contactFields.map((field) =>
          csvValue(contactAnswers[field.questionId]),
        ),
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  return `${lines.join("\n")}\n`;
}

function csvValue(value: unknown) {
  if (value === undefined || value === null) {
    return "";
  }
  if (Array.isArray(value) || typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function csvEscape(value: string) {
  return /[",\n]/.test(value) ? `"${value.replaceAll("\"", "\"\"")}"` : value;
}

function generateJoinCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

async function callQnaWorker(input: {
  projectId: string;
  sessionId: string;
  questionId: string;
  questionText: string;
  publicSlideContext: string;
  selectedReferenceIds: string[];
}): Promise<QnaWorkerAnswerResponse> {
  const baseUrl = process.env.PYTHON_WORKER_URL ?? "http://localhost:8000";
  const response = await fetch(`${baseUrl}/qna/answer`, {
    body: JSON.stringify({
      ...input,
      retrievalLimit: 5,
      confidenceThreshold: 0.65,
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error("Q&A worker failed");
  }

  return qnaWorkerAnswerResponseSchema.parse(await response.json());
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

class ParticipantRateLimiter {
  private readonly attempts = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  consume(key: string, now = Date.now()): boolean {
    const current = this.attempts.get(key);
    if (!current || current.resetAt <= now) {
      this.attempts.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (current.count >= this.limit) {
      return false;
    }

    current.count += 1;
    return true;
  }
}
