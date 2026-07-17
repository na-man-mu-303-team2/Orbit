import type { SlideQuestionGuide } from "@orbit/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  OfficialSourceLinks,
  SlideQuestionGuideResearchNotice,
} from "./SlideQuestionGuidePanel";

const source = {
  kind: "web" as const,
  sourceId: "web:official-1",
  url: "https://example.edu/program",
  title: "공식 교육과정 안내",
  authority: "official" as const,
  contentHash: "b".repeat(64),
  retrievedAt: "2026-07-17T00:00:00.000Z",
};

describe("SlideQuestionGuidePanel official sources", () => {
  it("renders a visible, clickable official citation", () => {
    const html = renderToStaticMarkup(<OfficialSourceLinks sources={[source]} />);

    expect(html).toContain("공식 출처");
    expect(html).toContain("공식 교육과정 안내");
    expect(html).toContain('href="https://example.edu/program"');
    expect(html).toContain('target="_blank"');
  });

  it("explains when web research degrades to existing sources", () => {
    const guide = {
      schemaVersion: 2,
      research: {
        status: "unavailable",
        attempts: 2,
        officialSourceCount: 0,
        issueCodes: ["official-missing"],
        researchedAt: "2026-07-17T00:00:00.000Z",
      },
    } as unknown as SlideQuestionGuide;

    const html = renderToStaticMarkup(<SlideQuestionGuideResearchNotice guide={guide} />);

    expect(html).toContain("공식 웹 근거를 찾지 못해");
    expect(html).toContain("슬라이드와 승인 참고자료만 사용했습니다");
  });
});
