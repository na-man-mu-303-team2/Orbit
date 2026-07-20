import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PracticeCelebrationFeedback } from "./PracticeCelebrationFeedback";
import { practiceCelebrationReportFixture } from "./practiceCelebrationFixture.test-helper";

describe("PracticeCelebrationFeedback", () => {
  it("성공 문구와 GREAT를 의미 있는 텍스트로 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <PracticeCelebrationFeedback animate report={practiceCelebrationReportFixture()} />,
    );
    expect(html).toContain('aria-label="습관어 사용 없음"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("오늘은 ‘음…’ 같은 습관어가 없었어요");
    expect(html).toContain("참 잘했어요 · GREAT");
    expect(html).toContain("is-new");
  });

  it("측정 불가 기록은 성공 문구를 렌더링하지 않는다", () => {
    const report = practiceCelebrationReportFixture();
    const html = renderToStaticMarkup(
      <PracticeCelebrationFeedback
        animate={false}
        report={{ ...report, quality: { state: "unmeasured", reasons: ["insufficient-speech"] } }}
      />,
    );
    expect(html).toBe("");
  });
});
