import { describe, expect, it } from "vitest";

import { shouldRunSemanticCueNli } from "./semanticCueNliPolicy";

describe("shouldRunSemanticCueNli", () => {
  it("skips exact keyword and phrase matches", () => {
    expect(
      shouldRunSemanticCueNli({
        nliFeatureEnabled: true,
        semanticMatchingEnabled: true,
        isFinal: true,
        phraseMatched: true,
        keywordCoverage: 1,
        semanticDecisionReason: "accepted-exact",
        cuePriority: 1,
        isRequired: true,
        nowMs: 10_000,
        lastNliRunAtMs: null
      })
    ).toMatchObject({
      run: false,
      reason: "phrase_match"
    });

    expect(
      shouldRunSemanticCueNli({
        nliFeatureEnabled: true,
        semanticMatchingEnabled: true,
        isFinal: true,
        phraseMatched: false,
        keywordCoverage: 1,
        semanticDecisionReason: "ad-lib",
        cuePriority: 1,
        isRequired: true,
        nowMs: 10_000,
        lastNliRunAtMs: null
      })
    ).toMatchObject({
      run: false,
      reason: "exact_keyword_match"
    });
  });

  it("runs only for final ad-lib or ambiguous required candidates after throttle", () => {
    expect(
      shouldRunSemanticCueNli({
        nliFeatureEnabled: true,
        semanticMatchingEnabled: true,
        isFinal: true,
        phraseMatched: false,
        keywordCoverage: 0.2,
        semanticDecisionReason: "ad-lib",
        cuePriority: 1,
        isRequired: true,
        nowMs: 10_000,
        lastNliRunAtMs: 1_000
      })
    ).toMatchObject({
      run: true,
      reason: "ad_lib_candidate"
    });

    expect(
      shouldRunSemanticCueNli({
        nliFeatureEnabled: true,
        semanticMatchingEnabled: true,
        isFinal: false,
        phraseMatched: false,
        keywordCoverage: 0.2,
        semanticDecisionReason: "ad-lib",
        cuePriority: 1,
        isRequired: true,
        nowMs: 10_000,
        lastNliRunAtMs: null
      })
    ).toMatchObject({
      run: false,
      reason: "not_final"
    });
  });
});
