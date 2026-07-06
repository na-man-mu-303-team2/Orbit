import type { Keyword } from "@orbit/shared";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  createKeywordOccurrenceKey,
  KeywordDetail,
  KeywordHighlightedNotes
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
        selectedKeywordOccurrenceKey={createKeywordOccurrenceKey("kw_ai", 0, "AI")}
        showIds={false}
        onSelectKeyword={vi.fn()}
        onSelectKeywordText={vi.fn()}
      />
    );

    expect(html.match(/class="keyword-mark selected"/g)).toHaveLength(1);
    expect(html.match(/class="keyword-mark "/g)).toHaveLength(1);
  });
});
