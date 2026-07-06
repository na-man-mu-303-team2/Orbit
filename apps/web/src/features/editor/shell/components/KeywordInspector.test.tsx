import { createKeywordOccurrenceId, type Keyword } from "@orbit/shared";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  KeywordDetail,
  KeywordHighlightedNotes,
  KeywordList
} from "./KeywordInspector";

describe("KeywordDetail", () => {
  it("renders selection clearing and deletion controls for a selected keyword", () => {
    const keyword: Keyword = {
      keywordId: "kw_ai",
      text: "AI",
      synonyms: [],
      abbreviations: [],
      required: false
    };

    const html = renderToString(
      <KeywordDetail
        keyword={keyword}
        showIds={false}
        usage={{
          advancesSlide: false,
          animationIds: []
        }}
        onClearSelection={vi.fn()}
        onDeleteKeyword={vi.fn()}
        onToggleAdvanceSlide={vi.fn()}
        onToggleRequired={vi.fn()}
      />
    );

    expect(html).toContain("선택 해제");
    expect(html).toContain("키워드 삭제");
    expect(html).toContain("필수 발화");
    expect(html).toContain("다음 슬라이드");
  });

  it("keeps aggregate keyword badges separate from selected occurrence usage", () => {
    const keyword: Keyword = {
      keywordId: "kw_ai",
      text: "AI",
      synonyms: [],
      abbreviations: [],
      required: false
    };

    const html = renderToString(
      <>
        <KeywordList
          keywords={[keyword]}
          selectedKeywordId="kw_ai"
          showIds={false}
          usageByKeywordId={{
            kw_ai: {
              advancesSlide: true,
              animationIds: ["anim_1"]
            }
          }}
          onSelectKeyword={vi.fn()}
        />
        <KeywordDetail
          keyword={keyword}
          showIds={false}
          usage={{
            advancesSlide: false,
            animationIds: []
          }}
          onClearSelection={vi.fn()}
          onDeleteKeyword={vi.fn()}
          onToggleAdvanceSlide={vi.fn()}
          onToggleRequired={vi.fn()}
        />
      </>
    );

    expect(html).toMatch(/애니메이션.*1/);
    expect(html.match(/다음 슬라이드/g)).toHaveLength(2);
    expect(html).toContain('keyword-control-button "');
    expect(html).not.toContain("keyword-control-button active");
  });
});

describe("KeywordHighlightedNotes", () => {
  it("selects only the clicked keyword occurrence when the same keyword appears repeatedly", () => {
    const keyword: Keyword = {
      keywordId: "kw_ai",
      text: "AI",
      synonyms: [],
      abbreviations: [],
      required: false
    };

    const html = renderToString(
      <KeywordHighlightedNotes
        keywords={[keyword]}
        notes="AI 덱은 AI 흐름을 설명합니다."
        selectedKeywordId="kw_ai"
        selectedKeywordOccurrenceKey={createKeywordOccurrenceId(
          "slide_1",
          "kw_ai",
          0,
          2
        )}
        showIds={false}
        slideId="slide_1"
        onSelectKeyword={vi.fn()}
        onSelectKeywordText={vi.fn()}
      />
    );

    expect(html.match(/class="keyword-mark selected"/g)).toHaveLength(1);
    expect(html.match(/class="keyword-mark "/g)).toBeNull();
    expect(html).toContain(
      'class="keyword-note-token " data-keyword-id="kw_ai" data-occurrence-id="kwo_slide_1_kw_ai_6_8"'
    );
    expect(html).toContain(
      'data-occurrence-id="kwo_slide_1_kw_ai_0_2"'
    );
    expect(html).toContain(
      'data-occurrence-id="kwo_slide_1_kw_ai_6_8"'
    );
  });
});
