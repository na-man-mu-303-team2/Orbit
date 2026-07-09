import { describe, expect, it } from "vitest";

import { getSemanticCueRuntimeFlags } from "./semanticCueFeatureFlags";

describe("getSemanticCueRuntimeFlags", () => {
  it("keeps semantic cue NLI off by default", () => {
    expect(getSemanticCueRuntimeFlags({})).toMatchObject({
      nliEnabled: false,
      provider: "off",
      debugPanelEnabled: false
    });
  });

  it("accepts the mock provider behind an explicit Vite flag", () => {
    expect(
      getSemanticCueRuntimeFlags({
        VITE_SEMANTIC_CUE_NLI_ENABLED: "true",
        VITE_SEMANTIC_CUE_NLI_PROVIDER: "mock",
        VITE_SEMANTIC_CUE_DEBUG_PANEL: "1"
      })
    ).toMatchObject({
      nliEnabled: true,
      provider: "mock",
      debugPanelEnabled: true
    });
  });
});
