import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceContainer } from "./WorkspaceContainer";

describe("WorkspaceContainer", () => {
  it("renders a semantic container while preserving feature classes", () => {
    const html = renderToStaticMarkup(
      <WorkspaceContainer as="main" className="feature-layout">
        workspace
      </WorkspaceContainer>,
    );

    expect(html).toContain("<main");
    expect(html).toContain(
      'class="redesign-workspace-container feature-layout"',
    );
  });

  it("adds the content width modifier when requested", () => {
    const html = renderToStaticMarkup(
      <WorkspaceContainer width="content">workspace</WorkspaceContainer>,
    );

    expect(html).toContain("redesign-workspace-container--content");
  });
});
