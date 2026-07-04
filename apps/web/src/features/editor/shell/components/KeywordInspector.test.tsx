import type { Keyword } from "@orbit/shared";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { KeywordDetail } from "./KeywordInspector";

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
