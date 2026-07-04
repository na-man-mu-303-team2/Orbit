import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AudienceEntrance } from "./AudienceEntrance";

describe("AudienceEntrance", () => {
  it("renders the public join code form with accessible labels", () => {
    const html = renderToStaticMarkup(<AudienceEntrance />);

    expect(html).toContain("청중 입장");
    expect(html).toContain("입장 코드");
    expect(html).toContain("6자리 숫자");
    expect(html).toContain('id="audience-join-code"');
  });
});
