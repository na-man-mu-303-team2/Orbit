import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AnimationCreateEditor } from "./AnimationCreateEditor";

const defaultProps = {
  canCreateAnimation: true,
  draft: { delayMs: 0, durationMs: 400, startMode: "on-click" as const },
  selectedKeywordId: "kw_ai",
  selectedKeywordLabel: "AI",
  type: "fade-in" as const,
  onAddAnimation: vi.fn(),
  onDraftChange: vi.fn()
};

describe("AnimationCreateEditor", () => {
  it("keeps the creation form hidden until the selected keyword has an occurrence", () => {
    const html = renderToString(
      <AnimationCreateEditor
        {...defaultProps}
        selectedKeywordOccurrenceId={null}
        keywordTriggerRestrictionMessage="발표 메모에서 애니메이션을 시작할 단어를 선택하세요."
      />
    );

    expect(html).toContain("대본에서 트리거 위치를 선택하면");
    expect(html).not.toMatch(/<button[^>]*>애니메이션 추가<\/button>/);
    expect(html).not.toContain("재생 시간");
  });

  it("shows timing controls only for an exact speaker-note occurrence", () => {
    const html = renderToString(
      <AnimationCreateEditor
        {...defaultProps}
        selectedKeywordOccurrenceId="kwo_slide_1_kw_ai_10_12"
      />
    );

    expect(html).toContain("발화 트리거");
    expect(html).toContain("재생 시간");
    expect(html).toContain("애니메이션 추가");
  });
});
