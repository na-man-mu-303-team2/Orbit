import { createDemoDeck, sanitizeCommunityTemplate } from "@orbit/editor-core";
import { describe, expect, it, vi } from "vitest";

import {
  CommunityTemplateWebError,
  buildCommunityTemplateListSearch,
  fetchCommunityTemplateList,
  fetchRecentCommunityTemplates,
  useCommunityTemplate,
} from "./communityTemplateApi";

const snapshot = sanitizeCommunityTemplate(createDemoDeck());
const publicCard = {
  templateId: "community_template_education",
  title: "교육 발표 템플릿",
  category: "education" as const,
  preview: {
    canvas: snapshot.canvas,
    theme: snapshot.theme,
    slide: snapshot.slides[0],
  },
  createdAt: "2026-07-21T00:00:00.000Z",
};

describe("communityTemplateApi", () => {
  it("serializes combined search, category, page, and limit state", () => {
    const search = buildCommunityTemplateListSearch({
      query: "  교육 자료  ",
      category: "education",
      page: 2,
      limit: 12,
    });

    expect(Object.fromEntries(new URLSearchParams(search))).toEqual({
      query: "교육 자료",
      category: "education",
      page: "2",
      limit: "12",
    });
  });

  it("fetches and strictly parses public list and recent responses", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ items: [publicCard], page: 1, hasMore: false }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [publicCard] }), { status: 200 }),
      );

    const list = await fetchCommunityTemplateList(
      { category: "education", page: 1, limit: 4 },
      fetcher,
    );
    const recent = await fetchRecentCommunityTemplates(fetcher);

    expect(list.items).toEqual([publicCard]);
    expect(recent.items).toEqual([publicCard]);
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/api/v1/community-templates?category=education&page=1&limit=4",
      { credentials: "include" },
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/api/v1/community-templates/recent",
      { credentials: "include" },
    );
  });

  it("rejects list rows containing private source or owner projections", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                ...publicCard,
                ownerUserId: "user_private",
                sourceProjectId: "project_private",
                snapshot,
              },
            ],
            page: 1,
            hasMore: false,
          }),
          { status: 200 },
        ),
    );

    await expect(
      fetchCommunityTemplateList({ page: 1, limit: 4 }, fetcher),
    ).rejects.toThrow();
  });

  it("uses a UUID idempotency key and parses the created project response", async () => {
    const clientRequestId = "6d620d1a-4d0d-4b40-b430-68875d5942b1";
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            templateId: publicCard.templateId,
            project: {
              projectId: "project_from_template",
              workspaceId: "workspace_demo_1",
              title: publicCard.title,
              createdBy: "user_demo_1",
              createdAt: "2026-07-21T01:00:00.000Z",
            },
            deckId: "deck_from_template",
          }),
          { status: 200 },
        ),
    );

    const response = await useCommunityTemplate(
      {
        workspaceId: "workspace_demo_1",
        templateId: publicCard.templateId,
        clientRequestId,
      },
      fetcher,
    );

    expect(response.project.projectId).toBe("project_from_template");
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/workspaces/workspace_demo_1/community-templates/community_template_education/use",
      {
        body: JSON.stringify({ clientRequestId }),
        credentials: "include",
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
  });

  it("maps only validated bounded API errors to a user-facing client error", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: "COMMUNITY_TEMPLATE_USE_CONFLICT",
            message: "같은 요청 ID가 다른 템플릿에 사용되었습니다.",
            details: [],
          }),
          { status: 409 },
        ),
    );

    await expect(
      useCommunityTemplate(
        {
          workspaceId: "workspace_demo_1",
          templateId: publicCard.templateId,
          clientRequestId: "6d620d1a-4d0d-4b40-b430-68875d5942b1",
        },
        fetcher,
      ),
    ).rejects.toMatchObject({
      name: "CommunityTemplateWebError",
      code: "COMMUNITY_TEMPLATE_USE_CONFLICT",
      message: "같은 요청 ID가 다른 템플릿에 사용되었습니다.",
    } satisfies Partial<CommunityTemplateWebError>);
  });
});
