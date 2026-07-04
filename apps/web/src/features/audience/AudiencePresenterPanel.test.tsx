import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AudiencePresenterControlPage } from "./AudiencePresenterPanel";

describe("AudiencePresenterPanel", () => {
  it("renders the presenter control/results route shell accessibly", () => {
    const html = renderToStaticMarkup(
      <AudiencePresenterControlPage projectId="project_1" />,
    );

    expect(html).toContain("청중 제어");
    expect(html).toContain("활성 청중 세션 없음");
    expect(html).toContain(
      'aria-labelledby="audience-presenter-control-title"',
    );
  });
});
