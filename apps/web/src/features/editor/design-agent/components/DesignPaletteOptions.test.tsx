import type { SlideRedesignPaletteOption } from "@orbit/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DesignPaletteOptions } from "./DesignPaletteOptions";

vi.mock("react", async () => ({
  ...(await vi.importActual<typeof import("react")>("react")),
  useId: () => "palette-test-id",
}));

const options = [
  paletteOption("current-theme", "현재 테마 유지", true, ["#ffffff", "#2563eb", "#7c3aed"]),
  paletteOption("calm-blue", "차분한 블루", false, ["#eff6ff", "#1d4ed8", "#0f766e"]),
  paletteOption("vivid-coral", "선명한 코럴", false, ["#fff7ed", "#ea580c", "#be123c"]),
];

describe("DesignPaletteOptions", () => {
  it("renders three native radios with the current theme selected by default", () => {
    const html = renderToStaticMarkup(
      <DesignPaletteOptions
        onConfirm={() => undefined}
        onSelectionChange={() => undefined}
        options={options}
      />,
    );

    expect(html).toContain('role="radiogroup"');
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toMatch(/<input[^>]*checked=""[^>]*value="current-theme"/);
    expect(html).toContain("현재 테마");
    expect(html).toContain("선택됨");
    expect(html.match(/background-color:/g)).toHaveLength(9);
  });

  it("exposes selection and confirmation callbacks", () => {
    const onSelectionChange = vi.fn();
    const onConfirm = vi.fn();
    const element = DesignPaletteOptions({
      onConfirm,
      onSelectionChange,
      options,
      selectedOptionId: "calm-blue",
    });
    const fieldset = element.props.children[1];
    const cards = fieldset.props.children[1].props.children;
    const selectedRadio = cards[1].props.children[0];
    const confirmButton = element.props.children[2];

    selectedRadio.props.onChange();
    confirmButton.props.onClick();

    expect(onSelectionChange).toHaveBeenCalledWith("calm-blue");
    expect(onConfirm).toHaveBeenCalledWith("calm-blue");
  });

  it("disables the radio group and announces preview generation", () => {
    const html = renderToStaticMarkup(
      <DesignPaletteOptions
        isSubmitting
        onConfirm={() => undefined}
        onSelectionChange={() => undefined}
        options={options}
      />,
    );

    expect(html).toContain('<fieldset disabled="" role="radiogroup">');
    expect(html).toContain("미리보기 생성 중...");
  });
});

function paletteOption(
  optionId: string,
  name: string,
  isCurrentTheme: boolean,
  [dominant, focal, secondary]: [string, string, string],
): SlideRedesignPaletteOption {
  return {
    optionId,
    name,
    isCurrentTheme,
    rationale: `${name} 설명`,
    palette: {
      dominant,
      surface: dominant,
      text: "#111827",
      focal,
      secondary,
    },
  };
}
