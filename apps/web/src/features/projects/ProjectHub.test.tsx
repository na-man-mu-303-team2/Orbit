import { createDemoDeck, sanitizeCommunityTemplate } from "@orbit/editor-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { communityTemplateKeys } from "../community-templates/communityTemplateApi";
import { OrbitWorkspaceHome } from "./ProjectHub";

describe("OrbitWorkspaceHome community template shelf", () => {
  it("places the template shelf before existing recent work without changing the header flow", () => {
    const snapshot = sanitizeCommunityTemplate(createDemoDeck());
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      ["projects"],
      [
        {
          createdAt: "2026-07-21T00:00:00.000Z",
          createdBy: "user_demo_1",
          isPinned: false,
          projectId: "project_recent",
          title: "기존 최근 프로젝트",
          workspaceId: "workspace_demo_1",
        },
      ],
    );
    queryClient.setQueryData(communityTemplateKeys.shelf, {
      items: [
        {
          templateId: "community_template_home",
          title: "홈 비즈니스 템플릿",
          category: "business",
          preview: {
            canvas: snapshot.canvas,
            theme: snapshot.theme,
            slide: snapshot.slides[0],
          },
          createdAt: "2026-07-21T00:00:00.000Z",
        },
      ],
      page: 1,
      hasMore: false,
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <OrbitWorkspaceHome onNavigate={() => undefined} userName="지윤" />
      </QueryClientProvider>,
    );

    expect(html).toContain("템플릿으로 시작하기");
    expect(html).toContain("홈 비즈니스 템플릿");
    expect(html).toContain("최근 작업");
    expect(html.indexOf("템플릿으로 시작하기")).toBeLessThan(
      html.indexOf("최근 작업"),
    );
    expect(html).toContain("기존 최근 프로젝트");
    expect(html).toContain("AI로 발표자료 만들기");
  });
});
