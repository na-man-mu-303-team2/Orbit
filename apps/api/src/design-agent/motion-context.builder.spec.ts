import { createDemoDeck } from "@orbit/editor-core";
import { describe, expect, it } from "vitest";

import {
  buildMotionPlanningContext,
  MOTION_SPEAKER_NOTES_MAX_CHARS,
  sanitizeSlideForMotionWorker,
} from "./motion-context.builder";

describe("buildMotionPlanningContext", () => {
  it("prioritizes approved current cue notes and bounds them", () => {
    const slide = createDemoDeck().slides[0]!;
    const elementId = slide.elements[0]!.elementId;
    slide.semanticCues = [
      {
        cueId: "scue_motion_1",
        slideId: slide.slideId,
        meaning: "핵심 전환",
        importance: "core",
        reviewStatus: "approved",
        freshness: "current",
        origin: "manual",
        revision: 1,
        sourceRefs: [],
        qualityWarnings: [],
        required: true,
        priority: 1,
        candidateKeywords: ["전환"],
        aliases: {},
        requiredConcepts: [],
        nliHypotheses: ["핵심 전환이 설명되었다"],
        negativeHints: [],
        targetElementIds: [elementId],
        triggerActionIds: [],
      },
    ];
    slide.speakerNotes = `${"일반 설명입니다. ".repeat(500)}전환을 먼저 설명합니다.`;

    const context = buildMotionPlanningContext(slide, [elementId]);

    expect(context.speakerNotes.length).toBeLessThanOrEqual(
      MOTION_SPEAKER_NOTES_MAX_CHARS,
    );
    expect(context.speakerNotes.startsWith("전환을 먼저 설명합니다.")).toBe(true);
    expect(context.notesPresent).toBe(true);
    expect(context.notesTruncated).toBe(true);
  });

  it("includes effective typography only for allowed text targets", () => {
    const slide = createDemoDeck().slides[0]!;
    const text = slide.elements.find((element) => element.type === "text")!;
    const other = slide.elements.find((element) => element.type !== "text")!;
    if (text.type !== "text") throw new Error("expected text fixture");
    text.props.autoFit = "shrink-text";
    text.props.fontScale = 0.5;
    text.props.lineSpaceReduction = 0.2;

    const context = buildMotionPlanningContext(slide, [text.elementId, other.elementId]);

    expect(context.effectiveTypography).toEqual([
      expect.objectContaining({
        elementId: text.elementId,
        resolvedFontScale: 0.5,
      }),
    ]);
  });

  it("removes speaker notes from the authoritative Worker slide clone", () => {
    const slide = createDemoDeck().slides[0]!;
    slide.speakerNotes = "MOTION_PRIVATE_SENTINEL";

    const sanitized = sanitizeSlideForMotionWorker(slide);

    expect(sanitized.speakerNotes).toBe("");
    expect(slide.speakerNotes).toBe("MOTION_PRIVATE_SENTINEL");
  });
});
