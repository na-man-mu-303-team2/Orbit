import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PresentationJourneyNav } from "./PresentationJourneyNav";

describe("PresentationJourneyNav", () => {
  it("keeps the presentation lifecycle in one project context", () => {
    const html = renderToStaticMarkup(
      <PresentationJourneyNav active="practice" projectId="project a" />,
    );

    expect(html).toContain('aria-label="발표 작업 단계"');
    expect(html).toContain('href="/project/project%20a"');
    expect(html).toContain('href="/rehearsal/project%20a"');
    expect(html).toContain('href="/reports/project%20a"');
    expect(html).toContain('href="/presentation/project%20a"');
    expect(html).toContain('aria-current="page"');
  });
});
