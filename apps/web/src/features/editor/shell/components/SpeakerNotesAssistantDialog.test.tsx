import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SpeakerNotesAssistantDialog } from "./SpeakerNotesAssistantDialog";

describe("SpeakerNotesAssistantDialog", () => {
  it("offers fixed refinement modes for existing notes", () => {
    const html = renderToStaticMarkup(
      <SpeakerNotesAssistantDialog
        errorMessage=""
        mode="naturalize"
        onApply={() => undefined}
        onClose={() => undefined}
        onGenerate={() => undefined}
        onModeChange={() => undefined}
        open
        originalNotes="기존 메모"
        result={null}
        status="idle"
      />,
    );

    expect(html).toContain("더 간결하게");
    expect(html).toContain("말하듯 자연스럽게");
    expect(html).toContain("핵심 강조");
  });

  it("shows comparison and explicit draft-only apply action", () => {
    const html = renderToStaticMarkup(
      <SpeakerNotesAssistantDialog
        errorMessage=""
        mode="naturalize"
        onApply={() => undefined}
        onClose={() => undefined}
        onGenerate={() => undefined}
        onModeChange={() => undefined}
        open
        originalNotes="기존 메모"
        result={{
          slideId: "slide_1",
          baseVersion: 3,
          mode: "naturalize",
          suggestedNotes: "자연스럽게 다듬은 메모입니다.",
          summary: "구어체로 다듬었습니다.",
          warnings: [],
          metrics: { characterCount: 14, estimatedSeconds: 4 },
        }}
        status="succeeded"
      />,
    );

    expect(html).toContain("현재 메모");
    expect(html).toContain("AI 제안");
    expect(html).toContain("편집 초안에 넣기");
    expect(html).not.toContain(">저장<");
  });
  it("shows the dedicated icebreaker flow even when notes are empty", () => {
    const html = renderToStaticMarkup(
      <SpeakerNotesAssistantDialog
        errorMessage=""
        mode="icebreaker"
        onApply={() => undefined}
        onClose={() => undefined}
        onGenerate={() => undefined}
        onModeChange={() => undefined}
        open
        originalNotes=""
        result={null}
        status="idle"
      />,
    );

    expect(html).toContain("아이스브레이킹 인트로 만들기");
    expect(html).toContain("인트로 생성");
    expect(html).not.toContain("어떻게 다듬을까요?");
  });
});
