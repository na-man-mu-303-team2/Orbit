import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  applyAudienceFeaturePatch,
  AudienceFeatureSettingsControls,
  AudienceSessionSetupSummary,
  normalizeAudienceFeaturePatch,
} from "./AudienceFeatureSettingsControls";

const features = {
  sessionId: "session_1",
  qnaEnabled: false,
  aiQnaEnabled: false,
  pollsEnabled: false,
  quizzesEnabled: false,
  reactionsEnabled: false,
  surveyEnabled: false,
  updatedAt: "2026-07-05T00:00:00.000Z",
};

describe("AudienceFeatureSettingsControls", () => {
  it("renders accessible feature toggles", () => {
    const html = renderToStaticMarkup(
      <AudienceFeatureSettingsControls
        features={features}
        onToggle={() => undefined}
      />,
    );

    expect(html).toContain('aria-label="Q&amp;A 켜기"');
    expect(html).toContain('aria-label="Poll 켜기"');
    expect(html).toContain('type="checkbox"');
  });

  it("keeps AI Q&A and Q&A dependencies in feature patches", () => {
    expect(normalizeAudienceFeaturePatch("aiQnaEnabled", true)).toEqual({
      aiQnaEnabled: true,
      qnaEnabled: true,
    });
    expect(normalizeAudienceFeaturePatch("qnaEnabled", false)).toEqual({
      aiQnaEnabled: false,
      qnaEnabled: false,
    });

    expect(
      applyAudienceFeaturePatch(features, {
        aiQnaEnabled: true,
        qnaEnabled: true,
      }),
    ).toMatchObject({
      aiQnaEnabled: true,
      qnaEnabled: true,
    });
  });

  it("renders editor setup sections for prepared interactions and references", () => {
    const html = renderToStaticMarkup(<AudienceSessionSetupSummary />);

    expect(html).toContain("선택된 상호작용");
    expect(html).toContain("표시 순서");
    expect(html).toContain("Survey");
    expect(html).toContain("AI Q&amp;A 참고자료");
  });
});
