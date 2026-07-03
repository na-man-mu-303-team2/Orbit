import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { defaultAutoAdvancePolicy } from "./autoAdvanceConfig";
import { AutoAdvanceSettings } from "./AutoAdvanceSettings";

describe("AutoAdvanceSettings", () => {
  it("renders mode toggles and a 5 percent threshold value", () => {
    const html = renderSettings();

    expect(html).toContain("리허설 자동 전환");
    expect(html).toContain("실전 자동 전환");
    expect(html).toContain("70%");
  });

  it("does not expose hidden timing or detector controls", () => {
    const html = renderSettings();

    expect(html).not.toContain("pauseMs");
    expect(html).not.toContain("countdownMs");
    expect(html).not.toContain("manualGuidanceDelayMs");
    expect(html).not.toContain("silenceThresholdDb");
    expect(html).not.toContain("침묵");
  });
});

function renderSettings() {
  return renderToStaticMarkup(
    <AutoAdvanceSettings
      policy={defaultAutoAdvancePolicy}
      saveSettings={vi.fn()}
    />
  );
}
