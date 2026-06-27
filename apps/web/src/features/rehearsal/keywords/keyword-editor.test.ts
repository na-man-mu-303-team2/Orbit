import { createDemoDeck } from "@orbit/editor-core";
import { describe, expect, it } from "vitest";

import {
  addKeyword,
  applyKeywordsToDeck,
  buildReplaceKeywordsRequest,
  deleteKeyword,
  updateKeywordTerms,
  validateSlideKeywords
} from "./keywordEditorModel";

describe("keyword-editor model", () => {
  it("adds and deletes keywords", () => {
    const keywordIds = ["kw_new_1"];
    const initialKeywords = createDemoDeck().slides[0].keywords;
    const withKeyword = addKeyword(initialKeywords, "리허설", () => keywordIds.shift()!);

    expect(withKeyword).toHaveLength(2);
    expect(withKeyword[1]).toMatchObject({
      keywordId: "kw_new_1",
      text: "리허설",
      synonyms: [],
      abbreviations: []
    });

    expect(deleteKeyword(withKeyword, "kw_new_1")).toEqual(initialKeywords);
  });

  it("adds synonyms and Korean/English mixed abbreviations", () => {
    const [keyword] = addKeyword([], "온디바이스", () => "kw_device");
    const withSynonyms = updateKeywordTerms(
      [keyword],
      "kw_device",
      "synonyms",
      "로컬 STT, 브라우저 음성 인식"
    );
    const withAbbreviations = updateKeywordTerms(
      withSynonyms,
      "kw_device",
      "abbreviations",
      "STT, 음성AI"
    );

    expect(withAbbreviations[0]).toMatchObject({
      synonyms: ["로컬 STT", "브라우저 음성 인식"],
      abbreviations: ["STT", "음성AI"]
    });
    expect(validateSlideKeywords(withAbbreviations)).toEqual([]);
  });

  it("builds a replace_keywords patch request for persisted metadata", () => {
    const deck = createDemoDeck();
    const keywords = [
      {
        keywordId: "kw_rehearsal",
        text: " 리허설 ",
        synonyms: ["발표 연습"],
        abbreviations: ["STT"]
      }
    ];

    const request = buildReplaceKeywordsRequest(deck, "slide_1", keywords);
    const updatedDeck = applyKeywordsToDeck(deck, "slide_1", keywords);

    expect(request.patch).toMatchObject({
      deckId: deck.deckId,
      baseVersion: deck.version,
      source: "user",
      operations: [
        {
          type: "replace_keywords",
          slideId: "slide_1",
          keywords: [
            {
              keywordId: "kw_rehearsal",
              text: "리허설",
              synonyms: ["발표 연습"],
              abbreviations: ["STT"]
            }
          ]
        }
      ]
    });
    const [operation] = request.patch.operations;

    expect(operation.type).toBe("replace_keywords");
    expect(updatedDeck.slides[0].keywords).toEqual(
      operation.type === "replace_keywords" ? operation.keywords : []
    );
  });

  it("rejects slide-level duplicate and empty values", () => {
    const deck = createDemoDeck();
    const keywords = [
      {
        keywordId: "kw_one",
        text: "ORBIT",
        synonyms: ["발표 도우미", ""],
        abbreviations: ["OD"]
      },
      {
        keywordId: "kw_two",
        text: "orbit",
        synonyms: ["발표 도우미"],
        abbreviations: ["od"]
      }
    ];

    expect(validateSlideKeywords(keywords).map((issue) => issue.field)).toEqual([
      "synonym",
      "keyword",
      "synonym",
      "abbreviation"
    ]);
    expect(() => buildReplaceKeywordsRequest(deck, "slide_1", keywords)).toThrow(
      "빈 동의어는 저장할 수 없습니다."
    );
  });
});
