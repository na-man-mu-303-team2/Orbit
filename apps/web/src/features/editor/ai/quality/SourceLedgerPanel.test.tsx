import type { Slide } from "@orbit/shared";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SourceLedgerPanel } from "./SourceLedgerPanel";

describe("SourceLedgerPanel", () => {
  it("shows deduplicated current-slide sources with authority and links", () => {
    const slide = {
      slideId: "slide_1",
      order: 1,
      title: "Current facts",
      thumbnailUrl: "",
      style: {},
      speakerNotes: "notes",
      elements: [],
      keywords: [],
      semanticCues: [],
      animations: [],
      actions: [],
      aiNotes: {
        emphasisPoints: [],
        sourceEvidence: [],
        sourceLedger: [
          {
            claim: "Release date",
            source: "https://example.com/release",
            sourceType: "web",
            sourceId: "web:release",
            url: "https://example.com/release",
            title: "Official release",
            authority: "official",
            confidence: 0.9,
            usedInSlideId: "slide_1"
          },
          {
            claim: "Release platform",
            source: "https://example.com/release",
            sourceType: "web",
            sourceId: "web:release",
            url: "https://example.com/release",
            title: "Official release duplicate",
            authority: "official",
            confidence: 0.9,
            usedInSlideId: "slide_1"
          }
        ]
      }
    } satisfies Slide;

    const html = renderToString(<SourceLedgerPanel slide={slide} />);

    expect(html).toContain("현재 슬라이드 출처");
    expect(html).toContain("공식");
    expect(html).toContain("Official release");
    expect(html).toContain('href="https://example.com/release"');
    expect(html).not.toContain("Official release duplicate");
  });
});
