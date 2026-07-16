import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import {
  audienceAccessSessionSchema,
  getCurrentPresentationSessionResponseSchema,
  listPresentationSessionsResponseSchema,
  presentationSessionResponseSchema,
  presentationSessionWithAudienceUrlResponseSchema,
  verifyAudienceAccessSessionResponseSchema
} from "@orbit/shared";
import type {
  CreatePresentationSessionRequest,
  GetCurrentPresentationSessionResponse,
  PresentationSession,
  PresentationSessionWithAudienceUrlResponse,
  UpdatePresentationSessionAccessRequest
} from "@orbit/shared";
import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import {
  PresentationSessionRepository,
  type PresentationSessionRow
} from "./presentation-session.repository";

const defaultAccessDays = 14;

@Injectable()
export class PresentationSessionsService {
  constructor(
    private readonly repository: PresentationSessionRepository,
    @InjectPinoLogger(PresentationSessionsService.name)
    private readonly logger: PinoLogger
  ) {}

  async create(
    projectId: string,
    userId: string,
    input: CreatePresentationSessionRequest
  ): Promise<PresentationSessionWithAudienceUrlResponse> {
    const now = new Date();
    const startsAt = input.startsAt ? new Date(input.startsAt) : now;
    const expiresAt = input.expiresAt
      ? new Date(input.expiresAt)
      : new Date(startsAt.getTime() + defaultAccessDays * 24 * 60 * 60 * 1000);
    assertAccessWindow(startsAt, expiresAt);
    const passwordHash = input.passcode
      ? await argon2.hash(input.passcode, { type: argon2.argon2id })
      : null;
    const sessionId = `session_${randomUUID()}`;

    const result = await this.repository.transaction(async (manager) => {
      const deck = await this.repository.findStoredDeckForUpdate(
        manager,
        projectId,
        input.deckId
      );
      if (!deck) throw new NotFoundException("Deck not found for presentation session");

      const closedSessionIds = await this.repository.closeActive(manager, projectId, now);
      const row = await this.repository.insert(manager, {
        sessionId,
        projectId,
        deckId: deck.deck_id,
        deckVersion: deck.version,
        userId,
        status: startsAt.getTime() > now.getTime() ? "draft" : "live",
        accessMode: input.accessMode,
        passwordHash,
        startsAt,
        expiresAt,
        now
      });
      return { closedSessionIds, row };
    });

    result.closedSessionIds.forEach((closedSessionId) => {
      this.logger.info(
        { event: "presentation_session.closed", projectId, presentationSessionId: closedSessionId },
        "presentation session closed before replacement"
      );
    });
    this.logger.info(
      { event: "presentation_session.created", projectId, presentationSessionId: sessionId, deckId: input.deckId },
      "presentation session created"
    );
    return this.toResponseWithUrl(result.row);
  }

  async getCurrent(projectId: string, deckId: string): Promise<GetCurrentPresentationSessionResponse> {
    const row = await this.repository.findCurrent(projectId, deckId);
    if (!row) {
      return getCurrentPresentationSessionResponseSchema.parse({ session: null, audienceUrl: null });
    }
    const session = this.toSession(row);
    return getCurrentPresentationSessionResponseSchema.parse({
      session,
      audienceUrl: this.buildAudienceUrl(session.sessionId)
    });
  }

  async list(projectId: string, deckId: string) {
    const rows = await this.repository.list(projectId, deckId);
    return listPresentationSessionsResponseSchema.parse({ sessions: rows.map((row) => this.toSession(row)) });
  }

  async updateAccess(
    projectId: string,
    sessionId: string,
    input: UpdatePresentationSessionAccessRequest
  ) {
    const startsAt = new Date(input.startsAt);
    const expiresAt = new Date(input.expiresAt);
    assertAccessWindow(startsAt, expiresAt);
    const passwordHash = input.passcode
      ? await argon2.hash(input.passcode, { type: argon2.argon2id })
      : null;
    const now = new Date();
    const row = await this.repository.transaction((manager) =>
      this.repository.updateAccess(manager, projectId, sessionId, {
        status: startsAt.getTime() > now.getTime() ? "draft" : "live",
        accessMode: input.accessMode,
        passwordHash,
        startsAt,
        expiresAt,
        now
      })
    );
    if (!row) throw new NotFoundException("Presentation session not found");
    return presentationSessionResponseSchema.parse({ session: this.toSession(row) });
  }

  async close(projectId: string, sessionId: string) {
    const row = await this.repository.transaction((manager) =>
      this.repository.close(manager, projectId, sessionId, new Date())
    );
    if (!row) throw new NotFoundException("Presentation session not found");
    this.logger.info(
      { event: "presentation_session.closed", projectId, presentationSessionId: sessionId },
      "presentation session closed"
    );
    return presentationSessionResponseSchema.parse({ session: this.toSession(row) });
  }

  async getOpenSessionById(sessionId: string) {
    const row = await this.repository.findAccessibleBySessionId(sessionId);
    if (!row) throw new NotFoundException("Audience session not found");
    return this.toLegacyAudienceSession(row);
  }

  async verifyAudienceAccess(sessionId: string, passcode: string) {
    const row = await this.repository.findAccessibleBySessionId(sessionId);
    if (!row || !row.session_password_hash || row.access_mode !== "passcode") {
      throw new NotFoundException("Invalid audience session or passcode");
    }
    const valid = await argon2.verify(row.session_password_hash, passcode);
    if (!valid) throw new UnauthorizedException("Invalid audience session or passcode");
    return verifyAudienceAccessSessionResponseSchema.parse({
      verified: true,
      session: this.toLegacyAudienceSession(row)
    });
  }

  private toResponseWithUrl(row: PresentationSessionRow) {
    const session = this.toSession(row);
    return presentationSessionWithAudienceUrlResponseSchema.parse({
      session,
      audienceUrl: this.buildAudienceUrl(session.sessionId)
    });
  }

  toSession(row: PresentationSessionRow): PresentationSession {
    if (!row.deck_id || !row.deck_version || !row.presenter_user_id || !row.created_by) {
      throw new NotFoundException("Presentation session deck link is unavailable");
    }
    return {
      sessionId: row.session_id,
      projectId: row.project_id,
      deckId: row.deck_id,
      deckVersion: row.deck_version,
      presenterUserId: row.presenter_user_id,
      createdBy: row.created_by,
      status: row.status,
      accessMode: row.access_mode,
      startsAt: toIso(row.starts_at),
      expiresAt: toIso(row.expires_at),
      activeActivityRunId: row.active_activity_run_id,
      startedAt: toOptionalIso(row.started_at),
      endedAt: toOptionalIso(row.ended_at),
      closedAt: toOptionalIso(row.closed_at),
      rawResponsesDeleteAfter: toOptionalIso(row.raw_responses_delete_after),
      rawResponsesDeletedAt: toOptionalIso(row.raw_responses_deleted_at),
      resultsDeletedAt: toOptionalIso(row.results_deleted_at),
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at)
    };
  }

  private buildAudienceUrl(sessionId: string) {
    return `/audience/${encodeURIComponent(sessionId)}`;
  }

  private toLegacyAudienceSession(row: PresentationSessionRow) {
    return audienceAccessSessionSchema.parse({
      sessionId: row.session_id,
      projectId: row.project_id,
      status: row.status === "ended" ? "closed" : "open",
      createdAt: toIso(row.created_at),
      expiresAt: toIso(row.expires_at)
    });
  }
}

function assertAccessWindow(startsAt: Date, expiresAt: Date): void {
  const duration = expiresAt.getTime() - startsAt.getTime();
  if (duration <= 0 || duration > 30 * 24 * 60 * 60 * 1000) {
    throw new RangeError("Presentation access window must be between 1 millisecond and 30 days");
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toOptionalIso(value: Date | string | null): string | null {
  return value === null ? null : toIso(value);
}
