import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NoiseCalibrationOverlay } from "./NoiseCalibrationOverlay";

describe("NoiseCalibrationOverlay", () => {
  it("실제 소음 측정 중 사용자가 조용히 기다리도록 안내한다", () => {
    const html = renderToStaticMarkup(<NoiseCalibrationOverlay />);

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("주변 소음을 확인하고 있어요");
    expect(html).toContain("잠시 말하지 말아 주세요");
    expect(html).toContain("자동으로 사라집니다");
  });
});
