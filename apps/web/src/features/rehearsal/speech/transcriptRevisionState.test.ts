import { describe, expect, it } from "vitest";

import {
  applyTranscriptRevision,
  createTranscriptRevisionState,
} from "./transcriptRevisionState";

describe("transcript revision state", () => {
  it("replaces a partial with its final revision and exposes only newly revealed words", () => {
    const partial = applyTranscriptRevision(createTranscriptRevisionState(), {
      isFinal: false,
      resultRevision: 1,
      text: "알파 다음",
      utteranceId: "u1",
    });
    const final = applyTranscriptRevision(partial.state, {
      isFinal: true,
      resultRevision: 2,
      text: "알파 다음 베타",
      utteranceId: "u1",
    });

    expect(final.currentTranscript).toBe("알파 다음 베타");
    expect(final.newSegment).toBe("베타");
  });

  it("ignores a stale revision", () => {
    const current = applyTranscriptRevision(createTranscriptRevisionState(), {
      isFinal: false,
      resultRevision: 2,
      text: "베타",
      utteranceId: "u1",
    });
    const stale = applyTranscriptRevision(current.state, {
      isFinal: false,
      resultRevision: 1,
      text: "알파",
      utteranceId: "u1",
    });

    expect(stale.isStale).toBe(true);
    expect(stale.newSegment).toBe("");
  });

  it("deduplicates repeated final text when the engine has no revision identifiers", () => {
    const first = applyTranscriptRevision(createTranscriptRevisionState(), {
      isFinal: true,
      text: "알파 베타"
    });
    const repeated = applyTranscriptRevision(first.state, {
      isFinal: true,
      text: "알파 베타"
    });
    const next = applyTranscriptRevision(repeated.state, {
      isFinal: true,
      text: "베타 감마"
    });

    expect(first.newSegment).toBe("알파베타");
    expect(repeated.newSegment).toBe("");
    expect(next.newSegment).toBe("감마");
  });
});
