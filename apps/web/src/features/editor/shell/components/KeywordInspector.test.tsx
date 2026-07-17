import { createKeywordOccurrenceId, type Keyword } from "@orbit/shared";
import fs from "node:fs";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  KeywordDetail,
  KeywordHighlightedNotes,
  KeywordList
} from "./KeywordInspector";

const editorShellCssPath = path.join(
  process.cwd(),
  "src/features/editor/editor-shell.css"
);

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

  it("marks required checkpoint badges for emphasized editor styling", () => {
    const keyword: Keyword = {
      keywordId: "kw_required",
      text: "핵심 개념",
      synonyms: [],
      abbreviations: [],
      required: true
    };

    const html = renderToString(
      <KeywordList
        keywords={[keyword]}
        selectedKeywordId={null}
        showIds={false}
        onSelectKeyword={vi.fn()}
      />
    );

    expect(html).toContain('class="keyword-chip-badge required">필수');
  });
});

describe("KeywordHighlightedNotes", () => {
  it("keeps punctuation and manual line breaks in the original reading order", () => {
    const html = renderToString(
      <KeywordHighlightedNotes
        keywords={[]}
        notes={"첫 문장입니다.\n둘째 문장입니다."}
        selectedKeywordId={null}
        showIds={false}
        slideId="slide_1"
        onSelectKeyword={vi.fn()}
        onSelectKeywordText={vi.fn()}
      />
    );

    expect(html).toContain(
      "<strong>문장입니다</strong></button>.\n<button"
    );
  });

  it("uses natural text spacing and preserves line breaks in the editor stylesheet", () => {
    const css = fs.readFileSync(editorShellCssPath, "utf8");

    expect(css).toMatch(
      /\.script-copy\s*\{[^}]*white-space:\s*pre-wrap;[^}]*word-break:\s*keep-all;/s
    );
    expect(css).toMatch(
      /\.keyword-note-token\s*\{[^}]*margin:\s*0;[^}]*padding:\s*0;/s
    );
    expect(css).toMatch(
      /\.keyword-note-token strong\s*\{[^}]*font-weight:\s*inherit;/s
    );
    expect(css).toMatch(
      /\.orbit-shell \.script-notes-editor\s*\{[^}]*font-size:\s*14px;[^}]*line-height:\s*1\.6;/s
    );
  });

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
