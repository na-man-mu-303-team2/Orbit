import { createDemoDeck } from "@orbit/editor-core";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { getSpeakerNotesLengthGuidance } from "../speakerNotesAssistant";
import { SpeakerNotesPanel } from "./SpeakerNotesPanel";

function renderPanel(isExpanded: boolean, isEditing = false) {
  const currentSlide = createDemoDeck().slides[0] ?? null;

  return renderToStaticMarkup(
    <SpeakerNotesPanel
      contentRef={createRef<HTMLDivElement>()}
      currentSlide={currentSlide}
      draft={currentSlide?.speakerNotes ?? ""}
      guidance={getSpeakerNotesLengthGuidance(currentSlide?.speakerNotes ?? "")}
      height={240}
      isEditing={isEditing}
      isExpanded={isExpanded}
      isResizing={false}
      maxHeight={480}
      minHeight={120}
      onCancelEdit={vi.fn()}
      onClearKeyword={vi.fn()}
      onDeleteKeyword={vi.fn()}
      onDraftChange={vi.fn()}
      onOpenAssistant={vi.fn()}
      onResizeKeyDown={vi.fn()}
      onResizeStart={vi.fn()}
      onSaveEdit={vi.fn()}
      onSelectKeyword={vi.fn()}
      onSelectKeywordText={vi.fn()}
      onStartEdit={vi.fn()}
      onToggleAdvanceSlide={vi.fn()}
      onTogglePanel={vi.fn()}
      onToggleRequired={vi.fn()}
      selectedKeyword={null}
      selectedKeywordId={null}
      selectedKeywordOccurrenceKey={null}
      selectedKeywordRequiredActive={false}
      selectedKeywordUsage={null}
      showIds={false}
      usageByKeywordId={{}}
    />,
  );
}

describe("SpeakerNotesPanel", () => {
  it("접힌 상태에서는 아이콘 없이 대본 레이블과 한 줄 미리보기를 표시한다", () => {
    const html = renderPanel(false);

    expect(html).toContain("speaker-notes-collapsed-label\">대본");
    expect(html).not.toContain("script-panel-icon");
    expect(html).not.toContain("speaker-notes-preview");
    expect(html).toContain("speaker-notes-collapsed-preview");
    expect(html).toContain(createDemoDeck().slides[0]?.speakerNotes ?? "");
    expect(html).not.toContain("speaker-notes-toggle-chevron");
  });

  it("대본, QnA, 리포트 탭과 대본 내부의 압축 액션을 렌더링한다", () => {
    const html = renderPanel(true);

    expect(html).toContain('role="tablist"');
    expect(html).toContain(">대본</button>");
    expect(html).toContain(">QnA</button>");
    expect(html).toContain(">리포트</button>");
    expect(html).toContain('id="speaker-notes-script-tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("script-notes-surface-actions");
    expect(html).not.toContain("speaker-notes-action-row");
    expect(html).toContain('aria-label="AI로 메모 다듬기"');
    expect(html).toContain("tabler-icon-wand");
    expect(html).not.toContain('aria-label="메모 편집"');
    expect(html).toContain("더블클릭하거나 Enter 키를 눌러 편집");
    expect(html.indexOf("speaker-notes-length-meter")).toBeLessThan(
      html.indexOf("script-keyword-section"),
    );
  });

  it("편집 상태에서는 대본 안에 취소와 저장 액션을 표시한다", () => {
    const html = renderPanel(true, true);

    expect(html).toContain("script-notes-editor-shell");
    expect(html).toContain('aria-label="메모 편집 취소"');
    expect(html).toContain('aria-label="메모 저장"');
    expect(html).not.toContain('aria-label="AI로 메모 다듬기"');
  });
});
