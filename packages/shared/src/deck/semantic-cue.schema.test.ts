import { describe, expect, it } from "vitest";

import { semanticCueSchema } from "./semantic-cue.schema";

describe("semanticCueSchema", () => {
  it("normalizes a legacy cue without promoting it to approved", () => {
    const cue = semanticCueSchema.parse(legacySemanticCue());

    expect(cue).toMatchObject({
      importance: "supporting",
      reviewStatus: "suggested",
      freshness: "current",
      origin: "imported",
      revision: 1,
      sourceRefs: [],
      qualityWarnings: []
    });
    expect(cue.required).toBe(true);
    expect(cue.priority).toBe(1);
  });

  it("accepts reviewed lifecycle metadata and bounded source references", () => {
    const cue = semanticCueSchema.parse({
      ...legacySemanticCue(),
      reportLabel: "초기 영업 비용이 높인 CAC",
      presenterTag: "CAC 원인",
      cueType: "cause",
      importance: "core",
      reviewStatus: "approved",
      freshness: "stale",
      origin: "ai",
      revision: 2,
      sourceDeckVersion: 7,
      sourceFingerprint: "fingerprint-123456",
      sourceRefs: [
        {
          kind: "speaker-notes",
          sourceHash: "notes-hash-123456"
        },
        {
          kind: "element",
          refId: "el_1",
          sourceHash: "element-hash-123456"
        }
      ],
      qualityWarnings: ["missing-technical-alias"]
    });

    expect(cue.sourceRefs).toHaveLength(2);
    expect(cue.qualityWarnings).toEqual(["missing-technical-alias"]);
  });

  it("rejects unbounded source metadata", () => {
    const tooManySourceRefs = semanticCueSchema.safeParse({
      ...legacySemanticCue(),
      sourceRefs: Array.from({ length: 17 }, (_, index) => ({
        kind: "element",
        refId: `el_${index}`,
        sourceHash: `source-hash-${index}`
      }))
    });
    const shortSourceHash = semanticCueSchema.safeParse({
      ...legacySemanticCue(),
      sourceRefs: [{ kind: "speaker-notes", sourceHash: "short" }]
    });

    expect(tooManySourceRefs.success).toBe(false);
    expect(shortSourceHash.success).toBe(false);
  });
});

function legacySemanticCue() {
  return {
    cueId: "scue_1",
    slideId: "slide_1",
    meaning: "CAC가 높은 원인은 초기 영업 비용입니다",
    required: true,
    priority: 1,
    candidateKeywords: ["CAC", "영업 비용"],
    aliases: { CAC: ["고객 획득 비용"] },
    requiredConcepts: ["초기 영업 비용", "고객 획득 비용"],
    nliHypotheses: ["발표자는 고객 획득 비용이 초기 영업 비용 때문에 높다고 설명했다"],
    negativeHints: [],
    targetElementIds: ["el_1"],
    triggerActionIds: []
  };
}
