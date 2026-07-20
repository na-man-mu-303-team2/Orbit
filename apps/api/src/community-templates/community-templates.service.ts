import { randomUUID } from "node:crypto";
import {
  CommunityTemplateSanitizationError,
  materializeCommunityTemplate,
  sanitizeCommunityTemplate,
} from "@orbit/editor-core";
import {
  communityTemplateApiErrorCodeSchema,
  communityTemplateApiErrorSchema,
  communityTemplateCardSchema,
  communityTemplateIdSchema,
  communityTemplateListResponseSchema,
  communityTemplatePreviewSchema,
  communityTemplateRecentResponseSchema,
  communityTemplateSnapshotSchema,
  communityTemplateSourceListResponseSchema,
  publishCommunityTemplateRequestSchema,
  publishCommunityTemplateResponseSchema,
  useCommunityTemplateRequestSchema,
  useCommunityTemplateResponseSchema,
} from "@orbit/shared";
import type {
  CommunityTemplateApiErrorCode,
  CommunityTemplateCard,
  CommunityTemplateCategory,
  CommunityTemplateListQuery,
  PublishCommunityTemplateRequest,
  UseCommunityTemplateRequest,
  UseCommunityTemplateResponse,
} from "@orbit/shared";
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { DataSource, EntityManager } from "typeorm";

import { DecksService } from "../decks/decks.service";
import { ProjectsService } from "../projects/projects.service";

type PublicTemplateRow = {
  template_id: string;
  title: string;
  category: CommunityTemplateCategory;
  preview_json: unknown;
  created_at: Date | string;
};

type StoredTemplateRow = PublicTemplateRow & {
  snapshot_json: unknown;
  source_deck_version: number;
};

type SourceProjectRow = {
  project_id: string;
  title: string;
  created_at: Date | string;
};

type ExistingUseRow = {
  template_id: string;
  project_id: string;
  workspace_id: string;
  title: string;
  created_by: string;
  created_at: Date | string;
  deck_id: string;
};

type UseTransactionResult = {
  response: UseCommunityTemplateResponse;
  category?: CommunityTemplateCategory;
  slideCount?: number;
  idempotent: boolean;
};

@Injectable()
export class CommunityTemplatesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly projectsService: ProjectsService,
    private readonly decksService: DecksService,
    @Optional()
    @InjectPinoLogger(CommunityTemplatesService.name)
    private readonly logger?: PinoLogger,
  ) {}

  async list(query: CommunityTemplateListQuery) {
    try {
      const offset = (query.page - 1) * query.limit;
      const rows = await this.dataSource.query<PublicTemplateRow[]>(
        `
          SELECT template_id, title, category, preview_json, created_at
          FROM community_templates
          WHERE ($1::text IS NULL OR title ILIKE '%' || $1 || '%')
            AND ($2::text IS NULL OR category = $2)
          ORDER BY created_at DESC, template_id DESC
          LIMIT $3 OFFSET $4
        `,
        [query.query ?? null, query.category ?? null, query.limit + 1, offset],
      );
      const hasMore = rows.length > query.limit;
      return communityTemplateListResponseSchema.parse({
        items: this.parsePublicCards(rows.slice(0, query.limit)),
        page: query.page,
        hasMore,
      });
    } catch (error) {
      throw toCommunityTemplateException(error, "read");
    }
  }

  async listRecent(userId: string) {
    try {
      const rows = await this.dataSource.query<PublicTemplateRow[]>(
        `
          SELECT
            community_templates.template_id,
            community_templates.title,
            community_templates.category,
            community_templates.preview_json,
            community_templates.created_at
          FROM community_template_usages
          INNER JOIN community_templates
            ON community_templates.template_id = community_template_usages.template_id
          WHERE community_template_usages.user_id = $1
          ORDER BY community_template_usages.last_used_at DESC
          LIMIT 4
        `,
        [userId],
      );
      return communityTemplateRecentResponseSchema.parse({
        items: this.parsePublicCards(rows).slice(0, 4),
      });
    } catch (error) {
      throw toCommunityTemplateException(error, "read");
    }
  }

  async listSources(workspaceId: string, userId: string) {
    try {
      const rows = await this.dataSource.query<SourceProjectRow[]>(
        `
          SELECT projects.project_id, projects.title, projects.created_at
          FROM projects
          INNER JOIN project_members
            ON project_members.project_id = projects.project_id
          WHERE projects.workspace_id = $1
            AND project_members.user_id = $2
            AND project_members.role = 'owner'
            AND project_members.status = 'accepted'
          ORDER BY projects.created_at DESC, projects.project_id DESC
        `,
        [workspaceId, userId],
      );
      return communityTemplateSourceListResponseSchema.parse({
        items: rows.map((row) => ({
          projectId: row.project_id,
          title: row.title,
          createdAt: toIso(row.created_at),
        })),
      });
    } catch (error) {
      throw toCommunityTemplateException(error, "read");
    }
  }

  async publish(
    workspaceId: string,
    input: PublishCommunityTemplateRequest,
    userId: string,
  ) {
    const request = publishCommunityTemplateRequestSchema.parse(input);
    let templateId: string | undefined;
    try {
      const sourceRows = await this.dataSource.query<
        Array<{ project_id: string }>
      >(
        `
          SELECT project_id
          FROM projects
          WHERE project_id = $1 AND workspace_id = $2
        `,
        [request.sourceProjectId, workspaceId],
      );
      if (!sourceRows[0]) {
        throw communityTemplateException(
          "COMMUNITY_TEMPLATE_SOURCE_NOT_FOUND",
          HttpStatus.NOT_FOUND,
          "공개할 원본 프로젝트를 찾을 수 없습니다.",
        );
      }

      try {
        await this.projectsService.assertIsProjectOwner(
          request.sourceProjectId,
          userId,
        );
      } catch (error) {
        if (error instanceof ForbiddenException) {
          throw communityTemplateException(
            "COMMUNITY_TEMPLATE_OWNER_REQUIRED",
            HttpStatus.FORBIDDEN,
            "프로젝트 소유자만 템플릿을 공개할 수 있습니다.",
          );
        }
        if (error instanceof NotFoundException) {
          throw communityTemplateException(
            "COMMUNITY_TEMPLATE_SOURCE_NOT_FOUND",
            HttpStatus.NOT_FOUND,
            "공개할 원본 프로젝트를 찾을 수 없습니다.",
          );
        }
        throw error;
      }

      const { deck } = await this.decksService.getDeck(request.sourceProjectId);
      const snapshot = sanitizeCommunityTemplate(deck);
      const preview = communityTemplatePreviewSchema.parse({
        canvas: snapshot.canvas,
        theme: snapshot.theme,
        slide: snapshot.slides[0],
      });
      templateId = communityTemplateIdSchema.parse(
        `community_template_${randomUUID()}`,
      );
      const createdAt = new Date().toISOString();

      await this.dataSource.query(
        `
          INSERT INTO community_templates (
            template_id,
            owner_user_id,
            source_project_id,
            source_deck_id,
            source_deck_version,
            title,
            category,
            snapshot_json,
            preview_json,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          templateId,
          userId,
          request.sourceProjectId,
          deck.deckId,
          deck.version,
          request.title,
          request.category,
          snapshot,
          preview,
          createdAt,
        ],
      );

      const card = communityTemplateCardSchema.parse({
        templateId,
        title: request.title,
        category: request.category,
        preview,
        createdAt,
      });
      this.logger?.info(
        {
          event: "community_template.published",
          templateId,
          sourceProjectId: request.sourceProjectId,
          sourceDeckId: deck.deckId,
          sourceVersion: deck.version,
          category: request.category,
          slideCount: snapshot.slides.length,
        },
        "Community template published.",
      );
      return publishCommunityTemplateResponseSchema.parse({ template: card });
    } catch (error) {
      const exception = toCommunityTemplateException(error, "publish");
      this.logger?.error(
        {
          event: "community_template.publish_failed",
          templateId,
          sourceProjectId: request.sourceProjectId,
          workspaceId,
          category: request.category,
          errorCode: readCommunityTemplateErrorCode(exception),
        },
        "Community template publish failed.",
      );
      throw exception;
    }
  }

  async use(
    workspaceId: string,
    rawTemplateId: string,
    input: UseCommunityTemplateRequest,
    userId: string,
  ): Promise<UseCommunityTemplateResponse> {
    const request = useCommunityTemplateRequestSchema.parse(input);
    const templateId = communityTemplateIdSchema.parse(rawTemplateId);
    try {
      const result = await this.dataSource.transaction((manager) =>
        this.useInTransaction(
          manager,
          workspaceId,
          templateId,
          request.clientRequestId,
          userId,
        ),
      );
      this.logger?.info(
        {
          event: "community_template.used",
          templateId,
          projectId: result.response.project.projectId,
          deckId: result.response.deckId,
          category: result.category,
          slideCount: result.slideCount,
          idempotent: result.idempotent,
        },
        "Community template used.",
      );
      return result.response;
    } catch (error) {
      const exception = toCommunityTemplateException(error, "use");
      this.logger?.error(
        {
          event: "community_template.use_failed",
          templateId,
          workspaceId,
          userId,
          clientRequestId: request.clientRequestId,
          errorCode: readCommunityTemplateErrorCode(exception),
        },
        "Community template use failed.",
      );
      throw exception;
    }
  }

  private async useInTransaction(
    manager: EntityManager,
    workspaceId: string,
    templateId: string,
    clientRequestId: string,
    userId: string,
  ): Promise<UseTransactionResult> {
    await manager.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`${userId}:${clientRequestId}`],
    );
    const existingRows = await manager.query<ExistingUseRow[]>(
      `
        SELECT
          community_template_use_requests.template_id,
          projects.project_id,
          projects.workspace_id,
          projects.title,
          projects.created_by,
          projects.created_at,
          decks.deck_id
        FROM community_template_use_requests
        INNER JOIN projects
          ON projects.project_id = community_template_use_requests.project_id
        INNER JOIN decks ON decks.project_id = projects.project_id
        WHERE community_template_use_requests.user_id = $1
          AND community_template_use_requests.client_request_id = $2
        FOR UPDATE
      `,
      [userId, clientRequestId],
    );
    const existing = existingRows[0];
    if (existing) {
      if (existing.template_id !== templateId) {
        throw communityTemplateException(
          "COMMUNITY_TEMPLATE_USE_CONFLICT",
          HttpStatus.CONFLICT,
          "같은 요청 ID가 다른 템플릿에 사용되었습니다.",
        );
      }
      return {
        response: useCommunityTemplateResponseSchema.parse({
          templateId,
          project: {
            projectId: existing.project_id,
            workspaceId: existing.workspace_id,
            title: existing.title,
            createdBy: existing.created_by,
            createdAt: toIso(existing.created_at),
          },
          deckId: existing.deck_id,
        }),
        idempotent: true,
      };
    }

    const templateRows = await manager.query<StoredTemplateRow[]>(
      `
        SELECT
          template_id,
          title,
          category,
          snapshot_json,
          preview_json,
          source_deck_version,
          created_at
        FROM community_templates
        WHERE template_id = $1
        FOR SHARE
      `,
      [templateId],
    );
    const template = templateRows[0];
    if (!template) {
      throw communityTemplateException(
        "COMMUNITY_TEMPLATE_NOT_FOUND",
        HttpStatus.NOT_FOUND,
        "커뮤니티 템플릿을 찾을 수 없습니다.",
      );
    }
    const snapshot = communityTemplateSnapshotSchema.parse(
      template.snapshot_json,
    );
    const createdAt = new Date();
    const project = await this.projectsService.createInTransaction(
      manager,
      workspaceId,
      { title: template.title },
      userId,
      createdAt,
    );
    const deck = materializeCommunityTemplate({
      snapshot,
      projectId: project.projectId,
      title: project.title,
    });
    await this.decksService.createInitialDeckInTransaction(
      manager,
      deck,
      createdAt.toISOString(),
    );
    await manager.query(
      `
        INSERT INTO community_template_usages (
          template_id,
          user_id,
          last_used_at,
          use_count,
          last_project_id
        )
        VALUES ($1, $2, $3, 1, $4)
        ON CONFLICT (template_id, user_id)
        DO UPDATE SET
          last_used_at = EXCLUDED.last_used_at,
          use_count = community_template_usages.use_count + 1,
          last_project_id = EXCLUDED.last_project_id
      `,
      [templateId, userId, createdAt.toISOString(), project.projectId],
    );
    await manager.query(
      `
        INSERT INTO community_template_use_requests (
          user_id,
          client_request_id,
          template_id,
          project_id,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        userId,
        clientRequestId,
        templateId,
        project.projectId,
        createdAt.toISOString(),
      ],
    );

    return {
      response: useCommunityTemplateResponseSchema.parse({
        templateId,
        project,
        deckId: deck.deckId,
      }),
      category: template.category,
      slideCount: snapshot.slides.length,
      idempotent: false,
    };
  }

  private parsePublicCards(rows: PublicTemplateRow[]): CommunityTemplateCard[] {
    return rows.flatMap((row) => {
      const result = communityTemplateCardSchema.safeParse({
        templateId: row.template_id,
        title: row.title,
        category: row.category,
        preview: row.preview_json,
        createdAt: toIso(row.created_at),
      });
      if (result.success) return [result.data];
      this.logger?.error(
        {
          event: "community_template.read_failed",
          templateId: row.template_id,
          errorCode: "COMMUNITY_TEMPLATE_SCHEMA_NOT_READY",
        },
        "Community template row skipped.",
      );
      return [];
    });
  }
}

function toCommunityTemplateException(
  error: unknown,
  operation: "publish" | "use" | "read",
): HttpException {
  if (error instanceof HttpException) {
    const code = readCommunityTemplateErrorCode(error);
    if (code) return error;
  }
  if (error instanceof CommunityTemplateSanitizationError) {
    if (error.code === "COMMUNITY_TEMPLATE_ACTIVITY_UNSUPPORTED") {
      return communityTemplateException(
        error.code,
        HttpStatus.UNPROCESSABLE_ENTITY,
        "활동 장표가 포함된 프로젝트는 템플릿으로 공개할 수 없습니다.",
      );
    }
    if (error.code === "COMMUNITY_TEMPLATE_SNAPSHOT_TOO_LARGE") {
      return communityTemplateException(
        error.code,
        HttpStatus.PAYLOAD_TOO_LARGE,
        "템플릿 크기 제한을 초과했습니다.",
      );
    }
    return communityTemplateException(
      error.code,
      HttpStatus.UNPROCESSABLE_ENTITY,
      "프로젝트를 안전한 템플릿으로 변환할 수 없습니다.",
    );
  }
  const message =
    operation === "read"
      ? "커뮤니티 템플릿을 불러올 수 없습니다."
      : operation === "publish"
        ? "커뮤니티 템플릿을 공개할 수 없습니다."
        : "커뮤니티 템플릿을 사용할 수 없습니다.";
  return communityTemplateException(
    "COMMUNITY_TEMPLATE_SCHEMA_NOT_READY",
    HttpStatus.SERVICE_UNAVAILABLE,
    message,
  );
}

function communityTemplateException(
  code: CommunityTemplateApiErrorCode,
  status: HttpStatus,
  message: string,
) {
  return new HttpException(
    communityTemplateApiErrorSchema.parse({ code, message, details: [] }),
    status,
  );
}

function readCommunityTemplateErrorCode(
  error: HttpException,
): CommunityTemplateApiErrorCode | undefined {
  const response = error.getResponse();
  if (
    typeof response !== "object" ||
    response === null ||
    !("code" in response)
  ) {
    return undefined;
  }
  const result = communityTemplateApiErrorCodeSchema.safeParse(response.code);
  return result.success ? result.data : undefined;
}

function toIso(value: Date | string) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
