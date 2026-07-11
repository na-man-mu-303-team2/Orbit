import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  SemanticSpeechDebugPanel,
  semanticSpeechDebugPanelStorageKey,
  shouldShowSemanticSpeechDebugPanel
} from "./SemanticSpeechDebugPanel";
import { createSemanticDebugState } from "../speech/semanticSpeechDebug";

describe("SemanticSpeechDebugPanel", () => {
  it("latest final transcript와 similarity top 3를 표시한다", () => {
    const html = renderToStaticMarkup(
      <SemanticSpeechDebugPanel
        semanticMatchingEnabled
        state={createSemanticDebugState({
          status: "ready",
          slideId: "slide_1",
          transcript: "방금 final STT 문장",
          isFinal: true,
          topMatches: [
            match({ rank: 1, similarity: 0.842, sentenceIndex: 2 }),
            match({ rank: 2, similarity: 0.731, sentenceIndex: 0 }),
            match({ rank: 3, similarity: 0.61, sentenceIndex: 1, covered: true })
          ]
        })}
      />
    );

    expect(html).toContain("Semantic STT");
    expect(html).toContain("방금 인식");
    expect(html).toContain("방금 final STT 문장");
    expect(html).toContain("#1 · 0.842 · 문장 3");
    expect(html).toContain("#2 · 0.731 · 문장 1");
    expect(html).toContain("#3 · 0.610 · 문장 2");
    expect(html).toContain("적용");
    expect(html).toContain("참고");
    expect(html).toContain("covered");
  });

  it("transcript가 없으면 empty copy를 표시하고 error를 노출한다", () => {
    const html = renderToStaticMarkup(
      <SemanticSpeechDebugPanel
        semanticMatchingEnabled={false}
        state={createSemanticDebugState({
          status: "error",
          error: "model load failed"
        })}
      />
    );

    expect(html).toContain("아직 final STT 문장이 없습니다.");
    expect(html).toContain("model load failed");
  });
});

describe("shouldShowSemanticSpeechDebugPanel", () => {
  it("development에서는 기본 표시하고 production에서는 localStorage gate를 따른다", () => {
    expect(
      shouldShowSemanticSpeechDebugPanel({
        isDevelopment: true,
        storage: null
      })
    ).toBe(true);
    expect(
      shouldShowSemanticSpeechDebugPanel({
        isDevelopment: false,
        storage: createStorage(null)
      })
    ).toBe(false);
    expect(
      shouldShowSemanticSpeechDebugPanel({
        isDevelopment: false,
        storage: createStorage("1")
      })
    ).toBe(true);
  });

  it("blocked localStorage는 production에서 숨김으로 처리한다", () => {
    expect(
      shouldShowSemanticSpeechDebugPanel({
        isDevelopment: false,
        storage: {
          getItem: vi.fn(() => {
            throw new DOMException("blocked", "SecurityError");
          })
        }
      })
    ).toBe(false);
  });
});

function match(
  override: Partial<{
    rank: number;
    sentenceId: string;
    sentenceIndex: number;
    text: string;
    similarity: number;
    covered: boolean;
  }>
) {
  return {
    rank: 1,
    sentenceId: "sentence_1",
    sentenceIndex: 0,
    text: "후보 문장",
    similarity: 0.8,
    covered: false,
    ...override
  };
}

function createStorage(value: string | null): Pick<Storage, "getItem"> {
  return {
    getItem: (key) =>
      key === semanticSpeechDebugPanelStorageKey ? value : null
  };
}
