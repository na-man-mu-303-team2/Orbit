import { describe, expect, it } from "vitest";
import {
  createProvisionalFillerDetector,
  hasScriptAlignedLexicalEvidence,
} from "./provisionalFillerDetector";

describe("createProvisionalFillerDetector", () => {
  it("대본과 겹치는 독립 lexical token을 구분한다", () => {
    expect(
      hasScriptAlignedLexicalEvidence(
        "오늘 지표를",
        "오늘 지표를 설명하겠습니다",
      ),
    ).toBe(true);
    expect(
      hasScriptAlignedLexicalEvidence("어", "오늘 지표를 설명하겠습니다"),
    ).toBe(false);
  });
  it("독립된 filler token만 lexical 후보로 표시한다", () => {
    const detector = createProvisionalFillerDetector();
    detector.acceptSpeechActivity(started("utterance-1"), 1_000);

    expect(
      detector.acceptPartial({
        transcript: "음 오늘 지표를 보겠습니다",
        detectedAtMs: 1_400,
        hasScriptAlignedLexicalEvidence: true,
      }),
    ).toContainEqual({
      utteranceId: "utterance-1",
      kind: "lexical-filler-candidate",
      surface: "음",
      detectedAtMs: 1_400,
      status: "provisional",
    });
  });

  it("단어 내부 substring을 filler로 오인하지 않는다", () => {
    const detector = createProvisionalFillerDetector();
    detector.acceptSpeechActivity(started("utterance-1"), 1_000);

    expect(
      detector.acceptPartial({
        transcript: "음악과 언어를 설명합니다",
        detectedAtMs: 1_400,
        hasScriptAlignedLexicalEvidence: true,
      }),
    ).toEqual([]);
  });

  it("350~1500ms의 짧은 무대본 발화만 acoustic hesitation 후보로 표시한다", () => {
    const detector = createProvisionalFillerDetector();
    detector.acceptSpeechActivity(started("utterance-1"), 1_000);
    expect(
      detector.acceptSpeechActivity(ended("utterance-1"), 1_700),
    ).toEqual([
      {
        utteranceId: "utterance-1",
        kind: "acoustic-hesitation-candidate",
        detectedAtMs: 1_700,
        status: "provisional",
      },
    ]);

    detector.acceptSpeechActivity(started("utterance-2"), 2_000);
    expect(detector.acceptSpeechActivity(ended("utterance-2"), 3_700)).toEqual(
      [],
    );
  });

  it("script-aligned lexical evidence가 있으면 acoustic 후보를 만들지 않는다", () => {
    const detector = createProvisionalFillerDetector();
    detector.acceptSpeechActivity(started("utterance-1"), 1_000);
    detector.acceptPartial({
      transcript: "오늘 지표",
      detectedAtMs: 1_300,
      hasScriptAlignedLexicalEvidence: true,
    });

    expect(detector.acceptSpeechActivity(ended("utterance-1"), 1_700)).toEqual(
      [],
    );
  });

  it("commit 뒤 늦게 도착한 script evidence로 acoustic 후보를 철회한다", () => {
    const detector = createProvisionalFillerDetector();
    detector.acceptSpeechActivity(started("utterance-1"), 1_000);
    detector.acceptSpeechActivity(ended("utterance-1"), 1_700);

    expect(
      detector.acceptPartial({
        utteranceId: "utterance-1",
        transcript: "오늘 지표",
        detectedAtMs: 1_900,
        hasScriptAlignedLexicalEvidence: true,
      }),
    ).toContainEqual(
      expect.objectContaining({
        kind: "acoustic-hesitation-candidate",
        status: "retracted",
      }),
    );
  });

  it("verbatim 결과로 provisional 후보를 확정하거나 철회한다", () => {
    const detector = createProvisionalFillerDetector();
    detector.acceptSpeechActivity(started("utterance-1"), 1_000);
    detector.acceptPartial({
      transcript: "어 오늘",
      detectedAtMs: 1_300,
      hasScriptAlignedLexicalEvidence: true,
    });

    expect(
      detector.confirmVerbatim({
        utteranceId: "utterance-1",
        transcript: "어 오늘",
        detectedAtMs: 2_000,
      }),
    ).toContainEqual(expect.objectContaining({ status: "confirmed" }));

    detector.acceptSpeechActivity(started("utterance-2"), 3_000);
    detector.acceptPartial({
      transcript: "음 내일",
      detectedAtMs: 3_300,
      hasScriptAlignedLexicalEvidence: true,
    });
    expect(
      detector.confirmVerbatim({
        utteranceId: "utterance-2",
        transcript: "내일",
        detectedAtMs: 4_000,
      }),
    ).toContainEqual(expect.objectContaining({ status: "retracted" }));
  });
});

function started(utteranceId: string) {
  return { type: "speech-started" as const, utteranceId, occurredAtMs: 0 };
}

function ended(utteranceId: string) {
  return {
    type: "speech-ended" as const,
    utteranceId,
    occurredAtMs: 0,
    reason: "silence" as const,
  };
}
