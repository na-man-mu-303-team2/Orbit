import {
  communityTemplateApiErrorSchema,
  communityTemplateIdSchema,
  communityTemplateListQuerySchema,
  communityTemplateListResponseSchema,
  communityTemplateRecentResponseSchema,
  communityTemplateSourceListResponseSchema,
  publishCommunityTemplateRequestSchema,
  publishCommunityTemplateResponseSchema,
  useCommunityTemplateRequestSchema,
  useCommunityTemplateResponseSchema,
  type CommunityTemplateApiErrorCode,
  type CommunityTemplateListQuery,
} from "@orbit/shared";

export type CommunityTemplateFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export const communityTemplateKeys = {
  all: ["community-templates"] as const,
  shelf: ["community-templates", "shelf"] as const,
  lists: ["community-templates", "list"] as const,
  list: (query: CommunityTemplateListQuery) =>
    ["community-templates", "list", query] as const,
  recent: ["community-templates", "recent"] as const,
  sources: (workspaceId: string) =>
    ["community-templates", "sources", workspaceId] as const,
};

export class CommunityTemplateWebError extends Error {
  readonly code?: CommunityTemplateApiErrorCode;
  readonly status: number;

  constructor(
    message: string,
    status: number,
    code?: CommunityTemplateApiErrorCode,
  ) {
    super(message);
    this.name = "CommunityTemplateWebError";
    this.code = code;
    this.status = status;
  }
}

export function buildCommunityTemplateListSearch(
  rawQuery: CommunityTemplateListQuery,
) {
  const query = communityTemplateListQuerySchema.parse(rawQuery);
  const search = new URLSearchParams();
  if (query.query) search.set("query", query.query);
  if (query.category) search.set("category", query.category);
  search.set("page", String(query.page));
  search.set("limit", String(query.limit));
  return search.toString();
}

export async function fetchCommunityTemplateList(
  query: CommunityTemplateListQuery,
  fetcher: CommunityTemplateFetcher = fetch,
) {
  const response = await fetcher(
    `/api/v1/community-templates?${buildCommunityTemplateListSearch(query)}`,
    { credentials: "include" },
  );
  if (!response.ok) {
    throw await readCommunityTemplateError(
      response,
      "커뮤니티 템플릿을 불러오지 못했습니다.",
    );
  }
  return communityTemplateListResponseSchema.parse(await response.json());
}

export function fetchCommunityTemplateShelf(
  fetcher: CommunityTemplateFetcher = fetch,
) {
  return fetchCommunityTemplateList({ page: 1, limit: 4 }, fetcher);
}

export async function fetchRecentCommunityTemplates(
  fetcher: CommunityTemplateFetcher = fetch,
) {
  const response = await fetcher("/api/v1/community-templates/recent", {
    credentials: "include",
  });
  if (!response.ok) {
    throw await readCommunityTemplateError(
      response,
      "최근 사용한 템플릿을 불러오지 못했습니다.",
    );
  }
  return communityTemplateRecentResponseSchema.parse(await response.json());
}

export async function fetchCommunityTemplateSources(
  rawWorkspaceId: string,
  fetcher: CommunityTemplateFetcher = fetch,
) {
  const workspaceId = parseWorkspaceId(rawWorkspaceId);
  const response = await fetcher(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/community-templates/sources`,
    { credentials: "include" },
  );
  if (!response.ok) {
    throw await readCommunityTemplateError(
      response,
      "공개할 프로젝트를 불러오지 못했습니다.",
    );
  }
  return communityTemplateSourceListResponseSchema.parse(
    await response.json(),
  );
}

export async function publishCommunityTemplate(
  rawInput: {
    workspaceId: string;
    sourceProjectId: string;
    title: string;
    category: string;
    rightsConfirmed: boolean;
  },
  fetcher: CommunityTemplateFetcher = fetch,
) {
  const workspaceId = parseWorkspaceId(rawInput.workspaceId);
  const request = publishCommunityTemplateRequestSchema.parse({
    sourceProjectId: rawInput.sourceProjectId,
    title: rawInput.title,
    category: rawInput.category,
    rightsConfirmed: rawInput.rightsConfirmed,
  });
  const response = await fetcher(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/community-templates`,
    {
      body: JSON.stringify(request),
      credentials: "include",
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) {
    throw await readCommunityTemplateError(
      response,
      "커뮤니티 템플릿을 등록하지 못했습니다.",
    );
  }
  return publishCommunityTemplateResponseSchema.parse(await response.json());
}

export async function useCommunityTemplate(
  rawInput: {
    workspaceId: string;
    templateId: string;
    clientRequestId: string;
  },
  fetcher: CommunityTemplateFetcher = fetch,
) {
  const workspaceId = parseWorkspaceId(rawInput.workspaceId);
  const templateId = communityTemplateIdSchema.parse(rawInput.templateId);
  const request = useCommunityTemplateRequestSchema.parse({
    clientRequestId: rawInput.clientRequestId,
  });
  const response = await fetcher(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/community-templates/${encodeURIComponent(templateId)}/use`,
    {
      body: JSON.stringify(request),
      credentials: "include",
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) {
    throw await readCommunityTemplateError(
      response,
      "템플릿을 적용하지 못했습니다. 다시 시도해 주세요.",
    );
  }
  return useCommunityTemplateResponseSchema.parse(await response.json());
}

function parseWorkspaceId(rawWorkspaceId: string) {
  const workspaceId = rawWorkspaceId.trim();
  if (!workspaceId || workspaceId.length > 200) {
    throw new CommunityTemplateWebError(
      "워크스페이스 정보를 확인할 수 없습니다.",
      400,
    );
  }
  return workspaceId;
}

async function readCommunityTemplateError(
  response: Response,
  fallback: string,
) {
  try {
    const parsed = communityTemplateApiErrorSchema.safeParse(
      await response.json(),
    );
    if (parsed.success) {
      return new CommunityTemplateWebError(
        parsed.data.message,
        response.status,
        parsed.data.code,
      );
    }
  } catch {
    // Only validated bounded API errors may reach the UI.
  }
  return new CommunityTemplateWebError(fallback, response.status);
}
