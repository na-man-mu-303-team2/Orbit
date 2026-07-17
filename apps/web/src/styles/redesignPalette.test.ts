import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveRedesignPalette } from "./redesignPalette";

describe("resolveRedesignPalette", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Redesign CSS 토큰을 기본 팔레트 역할로 변환한다", () => {
    const tokenSource = {} as Element;
    vi.stubGlobal("document", { documentElement: tokenSource });
    vi.stubGlobal("window", {
      getComputedStyle: () => ({
        getPropertyValue: (token: string) => ` resolved-${token} `,
      }),
    });

    expect(resolveRedesignPalette()).toEqual({
      background: "resolved---redesign-color-background",
      onSurface: "resolved---redesign-color-on-surface",
      outlineVariant: "resolved---redesign-color-outline-variant",
      primary: "resolved---redesign-color-primary",
      primaryContainer: "resolved---redesign-color-primary-container",
      primaryFixedDim: "resolved---redesign-color-primary-fixed-dim",
      secondary: "resolved---redesign-color-secondary",
      surface: "resolved---redesign-color-surface",
      surfaceContainer: "resolved---redesign-color-surface-container",
    });
  });

  it("CSS 토큰을 읽을 수 없는 환경에서는 팔레트를 만들지 않는다", () => {
    expect(resolveRedesignPalette()).toBeNull();
  });
});
