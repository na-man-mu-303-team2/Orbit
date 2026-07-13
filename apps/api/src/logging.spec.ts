import { describe, expect, it } from "vitest";
import { redactedPaths } from "./logging";

describe("API logging redaction", () => {
  it("redacts semantic cue NLI evidence text fields", () => {
    expect(redactedPaths).toEqual(
      expect.arrayContaining([
        "premise",
        "hypothesis",
        "semanticCueDecisions",
        "*.premise",
        "*.hypothesis",
        "*.semanticCueDecisions",
        "payload.semanticCueDecisions",
        "result.semanticCueDecisions"
      ])
    );
  });
});
