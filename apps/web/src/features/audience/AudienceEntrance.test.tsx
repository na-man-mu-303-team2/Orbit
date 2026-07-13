import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AudienceEntrance } from "./AudienceEntrance";

describe("AudienceEntrance", () => {
  it("renders the ORBIT audience entry shell and loading state", () => {
    const html = renderToStaticMarkup(
      <AudienceEntrance sessionId="session_demo_1" />,
    );

    expect(html).toContain('alt="ORBIT"');
    expect(html).toContain("LIVE AUDIENCE");
    expect(html).toContain("청중 입장");
    expect(html).toContain("입장 상태 확인 중");
    expect(html).toContain("session_demo_1");
  });

  it("does not expose presenter-only data in the audience shell", () => {
    const html = renderToStaticMarkup(
      <AudienceEntrance sessionId="session_demo_1" />,
    );

    expect(html).not.toContain("speakerNotes");
    expect(html).not.toContain("transcript");
    expect(html).not.toContain("raw audio");
    expect(html).not.toContain("대본");
  });
});
