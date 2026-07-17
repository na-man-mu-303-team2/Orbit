import type { AiDeckPreviewResponse, Deck } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import {
  previewBannerText,
  readySlidePrefix,
} from "./ai-deck-preview-api";

describe("readySlidePrefix", () => {
  it("exposes only the contiguous completed prefix", () => {
    const deck = {
      slides: [
        { slideId: "slide-1" },
        { slideId: "slide-2" },
        { slideId: "slide-3" },
      ],
    } as Deck;

    expect(readySlidePrefix(deck, ["slide-2", "slide-3"])).toBe(0);
    expect(readySlidePrefix(deck, ["slide-1", "slide-3"])).toBe(1);
    expect(readySlidePrefix(deck, ["slide-1", "slide-2", "slide-3"])).toBe(3);
  });
});

describe("previewBannerText", () => {
  const preview = {
    jobId: "job-1",
    projectId: "project-1",
    status: "grounding",
    progress: 10,
    expectedSlideCountRange: { min: 5, max: 8 },
    editable: false,
    outline: [],
    deck: null,
    completedSlideIds: ["slide-1"],
    pendingSlideIds: [],
    updatedAt: "2026-07-17T00:00:00.000Z",
    error: null,
  } satisfies AiDeckPreviewResponse;

  it("mentions all slides only during quality review", () => {
    expect(previewBannerText({ ...preview, status: "grounding" })).not.toContain(
      "모든 슬라이드를 만들었습니다",
    );
    expect(
      previewBannerText({ ...preview, status: "quality-check" }),
    ).toContain("모든 슬라이드를 만들었습니다");
  });
});
