import type { Keyword } from "@orbit/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { KeywordHighlightedText } from "./KeywordHighlightedText";

describe("KeywordHighlightedText", () => {
  it("renders interactive keyword marks when selection is enabled", () => {
    const html = renderToStaticMarkup(
      <p>
        <KeywordHighlightedText
          keywords={[keyword("kw_ai", "생성형 AI", ["인공지능"], ["OAI"])]}
          text="생성형 AI는 인공지능 초안을 OAI 흐름으로 정리합니다."
          onSelectKeyword={() => undefined}
        />
      </p>
    );

    expect(html).toContain("<button");
    expect(html).toContain('class="keyword-mark "');
    expect(html).toContain("<strong>생성형 AI</strong>");
    expect(html).toContain("<strong>인공지능</strong>");
    expect(html).toContain("<strong>OAI</strong>");
  });

  it("keeps the longest keyword match when aliases overlap", () => {
    const html = renderToStaticMarkup(
      <p>
        <KeywordHighlightedText
          keywords={[
            keyword("kw_ai", "AI"),
            keyword("kw_gen_ai", "생성형 AI")
          ]}
          text="생성형 AI와 AI를 비교합니다."
          onSelectKeyword={() => undefined}
        />
      </p>
    );

    expect(html).toContain("<strong>생성형 AI</strong>");
    expect(html.match(/<strong>AI<\/strong>/g)).toHaveLength(1);
  });

  it("renders non-interactive marks when no select handler is provided", () => {
    const html = renderToStaticMarkup(
      <p>
        <KeywordHighlightedText
          keywords={[keyword("kw_privacy", "개인정보")]}
          text="개인정보 기준을 설명합니다."
        />
      </p>
    );

    expect(html).toContain('<span class="keyword-mark ">');
    expect(html).not.toContain("<button");
  });
});

function keyword(
  keywordId: string,
  text: string,
  synonyms: string[] = [],
  abbreviations: string[] = []
): Keyword {
  return {
    keywordId,
    text,
    synonyms,
    abbreviations,
    required: true,
    keywordRole: "required-message" as const
  };
}
