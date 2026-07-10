import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrbitButton, OrbitColorBlock, OrbitStatus } from "./components";

describe("ORBIT design-system primitives", () => {
  it("renders the requested button hierarchy", () => {
    const html = renderToStaticMarkup(
      <>
        <OrbitButton>Primary</OrbitButton>
        <OrbitButton variant="secondary">Secondary</OrbitButton>
        <OrbitButton variant="quiet">Quiet</OrbitButton>
      </>
    );

    expect(html).toContain("orbit-ds-button-primary");
    expect(html).toContain("orbit-ds-button-secondary");
    expect(html).toContain("orbit-ds-button-quiet");
  });

  it("renders semantic status and large color-block tones", () => {
    const html = renderToStaticMarkup(
      <>
        <OrbitStatus tone="lilac">편집 중</OrbitStatus>
        <OrbitColorBlock icon={<span>icon</span>} tone="lime">
          템플릿에서 시작
        </OrbitColorBlock>
      </>
    );

    expect(html).toContain("orbit-ds-status-lilac");
    expect(html).toContain("orbit-ds-color-block-lime");
  });
});
