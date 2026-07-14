import { describe, expect, it } from "vitest";

import type { LiveSttResult } from "../stt/liveSttPort";
import { createPrompterFinalDeduplicator } from "./prompterFinalDeduplicator";

describe("createPrompterFinalDeduplicator", () => {
  it("provider identity가 없으면 timestamp와 무관하게 제한된 window에서 차단한다", () => {
    let nowMs = 1_000;
    const deduplicator = createPrompterFinalDeduplicator({ now: () => nowMs });

    expect(deduplicator.acceptFinal(finalResult())).toBe(true);
    expect(deduplicator.acceptFinal(finalResult({ timestampMs: [2_000, 2_100] }))).toBe(false);

    nowMs = 3_001;
    expect(deduplicator.acceptFinal(finalResult({ timestampMs: [3_000, 3_100] }))).toBe(true);
  });

  it("utterance revision 중복과 이미 commit된 utterance의 후속 revision을 차단한다", () => {
    const deduplicator = createPrompterFinalDeduplicator({ now: () => 1_000 });
    const firstRevision = finalResult({
      utteranceId: "utterance_1",
      resultRevision: 1
    });
    const secondRevision = finalResult({
      utteranceId: "utterance_1",
      resultRevision: 2,
      timestampMs: [1_000, 1_100]
    });

    expect(deduplicator.acceptFinal(firstRevision)).toBe(true);
    expect(deduplicator.acceptFinal(firstRevision)).toBe(false);
    expect(deduplicator.acceptFinal(secondRevision)).toBe(true);
    deduplicator.markCommitted(secondRevision);
    expect(
      deduplicator.acceptFinal(
        finalResult({
          utteranceId: "utterance_1",
          resultRevision: 3,
          timestampMs: [2_000, 2_100]
        })
      )
    ).toBe(false);
  });

  it("identity 없는 final도 commit 이후에는 window 밖 재전달을 차단한다", () => {
    let nowMs = 1_000;
    const deduplicator = createPrompterFinalDeduplicator({ now: () => nowMs });
    const result = finalResult();

    expect(deduplicator.acceptFinal(result)).toBe(true);
    deduplicator.markCommitted(result);
    nowMs = 3_001;

    expect(deduplicator.acceptFinal(result)).toBe(false);
  });

  it("reset하면 이전 세션의 identity와 fingerprint를 폐기한다", () => {
    const deduplicator = createPrompterFinalDeduplicator({ now: () => 1_000 });
    const result = finalResult();

    expect(deduplicator.acceptFinal(result)).toBe(true);
    expect(deduplicator.acceptFinal(result)).toBe(false);
    deduplicator.reset();
    expect(deduplicator.acceptFinal(result)).toBe(true);
  });
});

function finalResult(override: Partial<LiveSttResult> = {}): LiveSttResult {
  return {
    text: "첫 문장을 설명합니다",
    isFinal: true,
    timestampMs: [0, 1_000],
    ...override
  };
}
