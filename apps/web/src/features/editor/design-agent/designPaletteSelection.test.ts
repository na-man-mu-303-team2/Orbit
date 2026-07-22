import type { SlideRedesignPaletteOption } from "@orbit/shared";
import { describe, expect, it } from "vitest";
import {
  buildPaletteFollowUpRequest,
  buildQuickActionDesignRequestOptions,
  type PendingPaletteSelection,
} from "./designPaletteSelection";

describe("design palette selection flow", () => {
  it("opts only redesign-slide into the palette request", () => {
    expect(buildQuickActionDesignRequestOptions("redesign-slide")).toEqual({
      intentPreset: "redesign-slide",
      selectedPaletteOptionId: null,
    });
    expect(buildQuickActionDesignRequestOptions("tidy-layout")).toEqual({
      intentPreset: "tidy-layout",
    });
  });

  it("keeps the original session and content for selection retries", () => {
    const pending = {
      content: "이 슬라이드를 다시 디자인해 주세요.",
      options: [paletteOption("current-theme", "현재 테마 유지")],
      sessionId: "session-palette",
    } satisfies PendingPaletteSelection;

    const first = buildPaletteFollowUpRequest(pending, "current-theme");
    const retry = buildPaletteFollowUpRequest(pending, "current-theme");

    expect(first).toEqual({
      content: pending.content,
      optionName: "현재 테마 유지",
      options: {
        intentPreset: "redesign-slide",
        selectedPaletteOptionId: "current-theme",
        sessionId: "session-palette",
      },
    });
    expect(retry).toEqual(first);
    expect(buildPaletteFollowUpRequest(pending, "missing-option")).toBeNull();
  });
});

function paletteOption(optionId: string, name: string): SlideRedesignPaletteOption {
  return {
    optionId,
    name,
    isCurrentTheme: optionId === "current-theme",
    rationale: "설명",
    palette: {
      dominant: "#ffffff",
      surface: "#f8fafc",
      text: "#111827",
      focal: "#2563eb",
      secondary: "#7c3aed",
    },
  };
}
