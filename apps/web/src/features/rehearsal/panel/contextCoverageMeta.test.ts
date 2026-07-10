import type { RehearsalRunMeta, SlideContextItem } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import {
  appendCoveredContextDecision,
  createEmptyRehearsalRunMeta,
  mergeRunMetaWithContextCoverage,
} from "./contextCoverageMeta";

const itemFixture: SlideContextItem = {
  itemId: "11111111-1111-1111-1111-111111111111",
  projectId: "project_demo_1",
  deckId: "deck_demo_1",
  slideId: "slide_1",
  itemOrder: 0,
  label: "문제 배경",
  sentence: "기존 구조는 응답 지연을 만들 수 있습니다.",
  hasEmbedding: false,
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
};

describe("appendCoveredContextDecision", () => {
  it("records the first covered decision for a context item", () => {
    const decisions = appendCoveredContextDecision([], {
      item: itemFixture,
      evaluation: {
        lexicalOverlap: 0.4,
        matched: true,
        method: "semantic",
        semanticSimilarity: 0.89,
        strength: 0.89,
      },
      at: "2026-07-10T01:00:00.000Z",
    });

    expect(decisions).toEqual([
      {
        itemId: itemFixture.itemId,
        slideId: itemFixture.slideId,
        label: itemFixture.label,
        status: "covered",
        method: "semantic",
        lexicalOverlap: 0.4,
        semanticSimilarity: 0.89,
        strength: 0.89,
        at: "2026-07-10T01:00:00.000Z",
      },
    ]);
  });

  it("does not duplicate a covered decision for the same item", () => {
    const current = appendCoveredContextDecision([], {
      item: itemFixture,
      evaluation: {
        lexicalOverlap: 0.4,
        matched: true,
        method: "semantic",
        semanticSimilarity: 0.89,
        strength: 0.89,
      },
      at: "2026-07-10T01:00:00.000Z",
    });

    const next = appendCoveredContextDecision(current, {
      item: itemFixture,
      evaluation: {
        lexicalOverlap: 1,
        matched: true,
        method: "substring",
        semanticSimilarity: 1,
        strength: 1,
      },
      at: "2026-07-10T01:00:05.000Z",
    });

    expect(next).toHaveLength(1);
  });
});

describe("mergeRunMetaWithContextCoverage", () => {
  it("adds missed decisions for uncovered items and preserves base run meta", () => {
    const runMeta: RehearsalRunMeta = {
      ...createEmptyRehearsalRunMeta(),
      slideTimeline: [
        { slideId: "slide_1", enteredAt: "2026-07-10T01:00:00.000Z" },
      ],
    };

    const merged = mergeRunMetaWithContextCoverage({
      runMeta,
      items: [itemFixture],
      coveredItemIds: new Set<string>(),
      decisions: [],
      now: () => "2026-07-10T01:05:00.000Z",
    });

    expect(merged?.slideTimeline).toHaveLength(1);
    expect(merged?.contextCoverageDecisions).toEqual([
      {
        itemId: itemFixture.itemId,
        slideId: itemFixture.slideId,
        label: itemFixture.label,
        status: "missed",
        method: "none",
        lexicalOverlap: 0,
        semanticSimilarity: 0,
        strength: 0,
        at: "2026-07-10T01:05:00.000Z",
      },
    ]);
  });

  it("preserves decisions already present in the base run meta", () => {
    const existingDecision = appendCoveredContextDecision([], {
      item: itemFixture,
      evaluation: {
        lexicalOverlap: 1,
        matched: true,
        method: "substring",
        semanticSimilarity: 1,
        strength: 1,
      },
      at: "2026-07-10T01:00:00.000Z",
    })[0];
    const runMeta: RehearsalRunMeta = {
      ...createEmptyRehearsalRunMeta(),
      contextCoverageDecisions: existingDecision ? [existingDecision] : [],
    };

    const merged = mergeRunMetaWithContextCoverage({
      runMeta,
      items: [itemFixture],
      coveredItemIds: new Set([itemFixture.itemId]),
      decisions: [],
    });

    expect(merged?.contextCoverageDecisions).toEqual([existingDecision]);
  });

  it("returns null when there is no base run meta and no context decisions", () => {
    const merged = mergeRunMetaWithContextCoverage({
      runMeta: null,
      items: [],
      coveredItemIds: new Set<string>(),
      decisions: [],
      now: () => "2026-07-10T01:05:00.000Z",
    });

    expect(merged).toBeNull();
  });
});
