import type { SemanticCue } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import { selectSemanticCueCandidates } from "./semanticCueCandidateSelector";

describe("selectSemanticCueCandidates", () => {
  it("prefers uncovered required and high-priority cues from the current slide", () => {
    const candidates = selectSemanticCueCandidates({
      slideId: "slide_1",
      transcript:
        "처음엔 세일즈에 돈이 많이 들어 고객 한 명 데려오는 비용이 컸습니다",
      semanticDecisionReason: "ad-lib",
      cues: [
        semanticCue({
          cueId: "scue_required",
          meaning: "CAC가 높은 원인은 초기 영업 비용입니다",
          priority: 1,
          required: true,
          candidateKeywords: ["CAC", "세일즈"],
          requiredConcepts: ["영업 비용", "고객 획득 비용"]
        }),
        semanticCue({
          cueId: "scue_optional",
          meaning: "CAC는 중요한 지표입니다",
          priority: 3,
          required: false,
          candidateKeywords: ["CAC"],
          requiredConcepts: ["중요한 지표"]
        }),
        semanticCue({
          cueId: "scue_other_slide",
          slideId: "slide_2",
          meaning: "다른 슬라이드",
          priority: 1,
          required: true,
          candidateKeywords: ["세일즈"],
          requiredConcepts: ["영업 비용"]
        })
      ],
      coveredCueIds: new Set(["scue_optional"])
    });

    expect(candidates.map((candidate) => candidate.cue.cueId)).toEqual([
      "scue_required"
    ]);
    expect(candidates[0]).toMatchObject({
      lexicalScore: expect.any(Number),
      conceptCoverage: expect.any(Number),
      selectedForNli: true
    });
  });

  it("returns skipped reasons when no cue is eligible for NLI", () => {
    const candidates = selectSemanticCueCandidates({
      slideId: "slide_1",
      transcript: "전혀 관련 없는 발화",
      semanticDecisionReason: "no_match",
      cues: [
        semanticCue({
          cueId: "scue_covered",
          candidateKeywords: ["CAC"],
          requiredConcepts: ["영업 비용"]
        })
      ],
      coveredCueIds: new Set(["scue_covered"])
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        selectedForNli: false,
        nliSkippedReason: "already-covered"
      })
    ]);
  });
});

function semanticCue(overrides: Partial<SemanticCue> = {}): SemanticCue {
  return {
    cueId: "scue_1",
    slideId: "slide_1",
    meaning: "CAC 원인 설명",
    importance: "supporting",
    reviewStatus: "suggested",
    freshness: "current",
    origin: "imported",
    revision: 1,
    sourceRefs: [],
    qualityWarnings: [],
    required: true,
    priority: 1,
    candidateKeywords: [],
    aliases: {},
    requiredConcepts: [],
    nliHypotheses: ["CAC가 초기 영업 비용 때문에 높다"],
    negativeHints: [],
    targetElementIds: [],
    triggerActionIds: [],
    ...overrides
  };
}
