import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Deck, Slide } from "@orbit/shared";
import { createDemoDeck } from "../index";
import { describe, expect, it } from "vitest";

import {
  evaluateMotionEligibility,
  type MotionEligibility,
} from "./motionEligibility";

type FixtureCase = {
  name: string;
  deckSourceType: "manual" | "import";
  slideKind: "content" | "activity" | "activity-results";
  importRenderMode?: "editable" | "hybrid" | "snapshot";
  sourceSlidePartPresent?: boolean;
  importedMainSequenceCoverage?: "absent" | "complete" | "partial" | "unknown";
  stableTargetElementIds?: string[];
  elements: Array<{
    elementId: string;
    role?: "background" | "body" | "decoration" | "footer" | "title";
    visible?: boolean;
    locked?: boolean;
    opacity?: number;
    frameCapable?: boolean;
  }>;
  expected: MotionEligibility;
};

const fixture = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "../../tests/fixtures/motion-eligibility.json"),
    "utf8",
  ),
) as { cases: FixtureCase[] };

describe("motion eligibility", () => {
  it.each(fixture.cases)("matches the shared fixture: $name", (testCase) => {
    const deck = createFixtureDeck(testCase);
    const slide = deck.slides[0]!;

    expect(
      evaluateMotionEligibility(deck, slide, {
        ...(testCase.stableTargetElementIds
          ? { stableTargetElementIds: testCase.stableTargetElementIds }
          : {}),
        requireAuthoritativeImportedTargets:
          testCase.deckSourceType === "import",
      }),
    ).toEqual(testCase.expected);
  });

  it("uses copied Deck capabilities only for the Web preflight gate", () => {
    const deck = createFixtureDeck({
      name: "web imported editable preflight",
      deckSourceType: "import",
      slideKind: "content",
      importRenderMode: "editable",
      sourceSlidePartPresent: true,
      importedMainSequenceCoverage: "complete",
      elements: [{ elementId: "el_body", role: "body", frameCapable: true }],
      expected: {
        outcome: "applicable",
        allowedTargetElementIds: ["el_body"],
        source: "imported-editable",
      },
    });

    expect(evaluateMotionEligibility(deck, deck.slides[0]!)).toEqual({
      outcome: "applicable",
      allowedTargetElementIds: ["el_body"],
      source: "imported-editable",
    });
  });
});

function createFixtureDeck(testCase: FixtureCase): Deck {
  const deck = createDemoDeck();
  deck.metadata.sourceType = testCase.deckSourceType;
  const baseSlide = deck.slides[0]!;
  const baseElement = baseSlide.elements[0]!;
  const slide = {
    ...baseSlide,
    kind: testCase.slideKind,
    ...(testCase.importRenderMode
      ? { importRenderMode: testCase.importRenderMode }
      : {}),
    ...(testCase.sourceSlidePartPresent
      ? { ooxmlSourceSlidePart: "ppt/slides/slide1.xml" }
      : {}),
    ...(testCase.importedMainSequenceCoverage
      ? {
          ooxmlMotionCapabilities: {
            transitionWritable: true,
            importedMainSequenceCoverage:
              testCase.importedMainSequenceCoverage,
          },
        }
      : {}),
    elements: testCase.elements.map((element) => ({
      ...baseElement,
      elementId: element.elementId,
      ...(element.role ? { role: element.role } : { role: undefined }),
      visible: element.visible ?? true,
      locked: element.locked ?? false,
      opacity: element.opacity ?? 1,
      ...(element.frameCapable
        ? {
            ooxmlOrigin: "imported" as const,
            ooxmlEditCapabilities: {
              richText: "full" as const,
              crop: "none" as const,
              tableCellText: false,
              frame: true,
            },
          }
        : {}),
    })),
  } as Slide;
  return { ...deck, slides: [slide] };
}
