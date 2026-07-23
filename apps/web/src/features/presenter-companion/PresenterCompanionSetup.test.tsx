import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PresenterCompanionSetup,
  PrivateDeviceCheckPad,
  getPurposeLabel,
} from "./PresenterCompanionSetup";
import { getStatusLabel } from "./PresenterCompanionStatus";

describe("PresenterCompanionSetup", () => {
  it("renders a private input check without a realtime publisher", () => {
    const html = renderToStaticMarkup(
      <PresenterCompanionSetup
        projectId="project_1"
        sessionId="session_1"
        sessionPurpose="presentation"
      />,
    );

    expect(html).toContain("iPad 연결");
    expect(html).toContain("실전 발표");
    expect(html).toContain('aria-label="iPad 입력 테스트 패드"');
    expect(html).toContain("청중 화면으로 전송되지 않습니다");
    expect(html).not.toContain("BroadcastChannel");
    expect(html).not.toContain("socket");
  });

  it("keeps the standalone device pad local-only and labels both modes", () => {
    expect(renderToStaticMarkup(<PrivateDeviceCheckPad />)).toContain(
      "비공개 입력 테스트",
    );
    expect(getPurposeLabel("presentation")).toBe("실전 발표");
    expect(getPurposeLabel("rehearsal")).toBe("리허설");
  });

  it("keeps health failures informational instead of blocking presentation", () => {
    expect(getStatusLabel(null, true)).toContain("발표는 계속됩니다");
    expect(
      getStatusLabel(
        {
          connected: true,
          connectedAt: "2026-07-23T00:00:00.000Z",
          pairingGeneration: 1,
          rttBucket: "slow",
        },
        false,
      ),
    ).toBe("연결됨 · 느림");
  });
});
