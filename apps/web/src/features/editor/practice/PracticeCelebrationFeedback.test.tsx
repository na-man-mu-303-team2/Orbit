import fs from "node:fs";
import path from "node:path";
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
    expect(html).toContain("orbit-mascot-thumbs-up.webp");
    expect(html).toContain("orbit-mascot-thumbs-up-blink.webp");
    expect(html).toContain("orbit-great-stamp.webp");
    expect((html.match(/alt=""/g) ?? [])).toHaveLength(3);
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

  it("습관어가 없으면 마스코트를 보여주고 GREAT 도장은 전체 기준 통과 때만 보여준다", () => {
    const report = practiceCelebrationReportFixture();
    const html = renderToStaticMarkup(
      <PracticeCelebrationFeedback
        animate
        report={{ ...report, voice: { ...report.voice, loudnessMadDb: 3.01 } }}
      />,
    );
    expect(html).toContain("오늘은 ‘음…’ 같은 습관어가 없었어요");
    expect(html).toContain("orbit-mascot-thumbs-up.webp");
    expect(html).toContain("orbit-mascot-thumbs-up-blink.webp");
    expect(html).not.toContain("orbit-great-stamp.webp");
    expect(html).not.toContain("참 잘했어요 · GREAT");
    expect((html.match(/alt=""/g) ?? [])).toHaveLength(2);
  });

  it("reduced motion에서는 transform animation을 제거한다", () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), "src/features/editor/practice/slide-practice.css"),
      "utf8",
    );
    const reducedMotion = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reducedMotion).toContain(".editor-practice-celebration-mascot-flight");
    expect(reducedMotion).toContain(".editor-practice-celebration-mascot-stage");
    expect(reducedMotion).toContain(".editor-practice-celebration-mascot-character");
    expect(reducedMotion).toContain(".editor-practice-celebration-mascot.is-blinking");
    expect(reducedMotion).toContain(".editor-practice-celebration-stamp");
    expect(reducedMotion).toContain("animation: none");
    expect(reducedMotion).toContain("transform: none");
  });

  it("새 회차 진입과 상시 부유·눈 깜빡임 모션을 분리한다", () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), "src/features/editor/practice/slide-practice.css"),
      "utf8",
    );
    expect(css).toContain(".is-new .editor-practice-celebration-mascot-flight");
    expect(css).toContain("editor-practice-mascot-fly-in");
    expect(css).toContain("editor-practice-mascot-drift");
    expect(css).toContain("editor-practice-mascot-cheer");
    expect(css).toContain("editor-practice-mascot-open-eyes");
    expect(css).toContain("editor-practice-mascot-blink-eyes");
    expect(css).toContain("infinite");
  });
});
