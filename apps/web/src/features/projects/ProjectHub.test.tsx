import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OrbitWorkspaceHome } from "./ProjectHub";

describe("OrbitWorkspaceHome community entry", () => {
  it("keeps the community entry above the workspace project controls", () => {
    const queryClient = new QueryClient();

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <OrbitWorkspaceHome onNavigate={() => undefined} userName="지윤" />
      </QueryClientProvider>,
    );

    expect(html).toContain("커뮤니티");
    expect(html).toContain("더보기");
    expect(html.indexOf("커뮤니티")).toBeLessThan(html.indexOf("내 프로젝트"));
    expect(html).toContain("AI 발표자료 만들기");
  });
});
