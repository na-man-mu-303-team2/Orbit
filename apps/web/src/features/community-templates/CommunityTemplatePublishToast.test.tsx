import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CommunityTemplatePublishToast } from "./CommunityTemplatePublishToast";

describe("CommunityTemplatePublishToast", () => {
  it("announces only the bounded template title and success message", () => {
    const html = renderToStaticMarkup(
      <CommunityTemplatePublishToast
        onDismiss={vi.fn()}
        title="팀 회고 템플릿"
      />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("팀 회고 템플릿");
    expect(html).toContain("커뮤니티에 등록했어요.");
    expect(html).not.toContain("project_owner_source");
  });
});
