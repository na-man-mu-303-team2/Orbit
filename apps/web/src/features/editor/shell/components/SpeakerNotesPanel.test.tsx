import { createDemoDeck } from "@orbit/editor-core";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { getSpeakerNotesLengthGuidance } from "../speakerNotesAssistant";
import { SpeakerNotesPanel } from "./SpeakerNotesPanel";

describe("SpeakerNotesPanel", () => {
  it("대본, QnA, 리포트 탭과 헤더 아래 대본 액션을 렌더링한다", () => {
    const currentSlide = createDemoDeck().slides[0] ?? null;
    const html = renderToStaticMarkup(
      <SpeakerNotesPanel
        contentRef={createRef<HTMLDivElement>()}
        currentSlide={currentSlide}
        draft={currentSlide?.speakerNotes ?? ""}
        guidance={getSpeakerNotesLengthGuidance(currentSlide?.speakerNotes ?? "")}
        height={240}
        isEditing={false}
        isExpanded
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

    expect(html).toContain('role="tablist"');
    expect(html).toContain(">대본</button>");
    expect(html).toContain(">QnA</button>");
    expect(html).toContain(">리포트</button>");
    expect(html).toContain('id="speaker-notes-script-tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html.indexOf("speaker-notes-tabs")).toBeLessThan(
      html.indexOf("speaker-notes-action-row"),
    );
    expect(html).toContain('aria-label="AI로 메모 다듬기"');
    expect(html).toContain('aria-label="메모 편집"');
  });
});
