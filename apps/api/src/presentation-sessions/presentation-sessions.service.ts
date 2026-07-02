import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import {
  createAudienceAccessSessionRequestSchema,
  createAudienceAccessSessionResponseSchema,
  getCurrentAudienceAccessSessionResponseSchema,
  updateAudienceAccessSessionStatusResponseSchema
} from "@orbit/shared";
import type {
  AudienceAccessSession,
  AudienceAccessSessionStatus,
  CreateAudienceAccessSessionResponse,
  GetCurrentAudienceAccessSessionResponse,
  UpdateAudienceAccessSessionStatusResponse
} from "@orbit/shared";
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

type PresentationSessionRow = {
  session_id: string;
  project_id: string;
  status: AudienceAccessSessionStatus;
  created_at: Date | string;
  expires_at: Date | string;
};

@Injectable()
export class PresentationSessionsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async create(
    projectId: string,
    body: unknown
  ): Promise<CreateAudienceAccessSessionResponse> {
    const input = createAudienceAccessSessionRequestSchema.parse(body);
    await this.closeExpiredOpenSessions(projectId);
    const currentOpenSession = await this.findCurrentOpenSession(projectId);
    if (currentOpenSession) {
      const session = this.toSessionDto(currentOpenSession);
      return createAudienceAccessSessionResponseSchema.parse({
        session,
        audienceUrl: this.buildAudienceUrl(session.sessionId)
      });
    }

    const sessionId = `session_${randomUUID()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + input.expiresInHours * 60 * 60 * 1000);
    const passwordHash = await argon2.hash(input.passcode, {
      type: argon2.argon2id
    });

    const rows = await this.dataSource.query<PresentationSessionRow[]>(
      `
        INSERT INTO presentation_sessions (
          session_id,
          session_password_hash,
          project_id,
          status,
          created_at,
          expires_at
        )
        VALUES ($1, $2, $3, 'open', $4, $5)
        RETURNING session_id, project_id, status, created_at, expires_at
      `,
      [sessionId, passwordHash, projectId, now, expiresAt]
    );

    const session = this.toSessionDto(rows[0]);
    return createAudienceAccessSessionResponseSchema.parse({
      session,
      audienceUrl: this.buildAudienceUrl(session.sessionId)
    });
  }

  async getCurrent(projectId: string): Promise<GetCurrentAudienceAccessSessionResponse> {
    const row = await this.findCurrentOpenSession(projectId);

    if (!row) {
      return getCurrentAudienceAccessSessionResponseSchema.parse({
        session: null,
        audienceUrl: null
      });
    }

    const session = this.toSessionDto(row);
    return getCurrentAudienceAccessSessionResponseSchema.parse({
      session,
      audienceUrl: this.buildAudienceUrl(session.sessionId)
    });
  }

  private async closeExpiredOpenSessions(projectId: string): Promise<void> {
    await this.dataSource.query(
      `
        UPDATE presentation_sessions
        SET status = 'closed'
        WHERE project_id = $1
          AND status = 'open'
          AND expires_at <= now()
      `,
      [projectId]
    );
  }

  private async findCurrentOpenSession(
    projectId: string
  ): Promise<PresentationSessionRow | null> {
    const rows = await this.dataSource.query<PresentationSessionRow[]>(
      `
        SELECT session_id, project_id, status, created_at, expires_at
        FROM presentation_sessions
        WHERE project_id = $1
          AND status = 'open'
          AND expires_at > now()
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [projectId]
    );

    return rows[0] ?? null;
  }

  async updateStatus(
    projectId: string,
    sessionId: string,
    status: AudienceAccessSessionStatus
  ): Promise<UpdateAudienceAccessSessionStatusResponse> {
    const result = await this.dataSource.query<
      PresentationSessionRow[] | [PresentationSessionRow[], number]
    >(
      `
        UPDATE presentation_sessions
        SET status = $1
        WHERE project_id = $2
          AND session_id = $3
        RETURNING session_id, project_id, status, created_at, expires_at
      `,
      [status, projectId, sessionId]
    );

    const rows = (Array.isArray(result[0]) ? result[0] : result) as PresentationSessionRow[];
    const row = rows[0];
    if (!row) {
      throw new NotFoundException("Presentation session not found");
    }

    return updateAudienceAccessSessionStatusResponseSchema.parse({
      session: this.toSessionDto(row)
    });
  }

  private buildAudienceUrl(sessionId: string) {
    return `/audience/${encodeURIComponent(sessionId)}`;
  }

  private toSessionDto(row: PresentationSessionRow): AudienceAccessSession {
    return {
      sessionId: row.session_id,
      projectId: row.project_id,
      status: row.status,
      createdAt: toIso(row.created_at),
      expiresAt: toIso(row.expires_at)
    };
  }
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
