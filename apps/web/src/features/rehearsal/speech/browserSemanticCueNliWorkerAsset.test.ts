import { describe, expect, it } from "vitest";
import { resolveBrowserSemanticCueNliWorkerUrl } from "./browserSemanticCueNliWorkerAsset";

describe("resolveBrowserSemanticCueNliWorkerUrl", () => {
  it("uses the source worker module in dev so Vite serves it as an ES module", () => {
    expect(
      resolveBrowserSemanticCueNliWorkerUrl({
        DEV: true,
        BASE_URL: "/"
      })
    ).toBe("/src/features/rehearsal/speech/browserSemanticCueNliWorker.ts");
  });

  it("uses the separately built worker asset in production", () => {
    expect(
      resolveBrowserSemanticCueNliWorkerUrl({
        DEV: false,
        BASE_URL: "/"
      })
    ).toBe("/semantic-cue-nli-worker.js");
  });

  it("preserves a configured production base URL", () => {
    expect(
      resolveBrowserSemanticCueNliWorkerUrl({
        DEV: false,
        BASE_URL: "/orbit/"
      })
    ).toBe("/orbit/semantic-cue-nli-worker.js");
  });
});
