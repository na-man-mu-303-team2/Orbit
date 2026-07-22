import { createDemoDeck } from "@orbit/editor-core";
import { describe, expect, it } from "vitest";
import {
  canApplyDesignProposal,
  designProposalLifecycles,
  resolveDesignProposalLifecycle,
} from "./designProposalLifecycle";
import type { DesignProposalPreview } from "./designProposalPreview";

describe("design proposal lifecycle", () => {
  it("keeps the eight public lifecycle states explicit", () => {
    expect(designProposalLifecycles).toEqual([
      "idle",
      "generating",
      "preview-read-only",
      "proposal-ready",
      "stale",
      "applying",
      "applied",
      "failed",
    ]);
  });

  it("turns a proposal stale whenever the current deck version changes", () => {
    const baseDeck = createDemoDeck();
    const preview = {
      baseDeck,
      candidateDeck: { ...baseDeck, version: baseDeck.version + 1 },
      proposal: {
        proposalId: "proposal_1",
        projectId: baseDeck.projectId,
        deckId: baseDeck.deckId,
        slideId: baseDeck.slides[0]!.slideId,
        requestMessageId: "request_1",
        responseMessageId: "response_1",
        baseVersion: baseDeck.version,
        title: "제안",
        operations: [],
        affectedElementIds: [],
        warnings: [],
        status: "pending",
        createdAt: "2026-07-21T00:00:00.000Z",
        updatedAt: "2026-07-21T00:00:00.000Z",
      },
    } satisfies DesignProposalPreview;

    expect(resolveDesignProposalLifecycle(
      "proposal-ready",
      { ...baseDeck, version: baseDeck.version + 1 },
      preview,
    )).toBe("stale");
    expect(canApplyDesignProposal("stale")).toBe(false);
    expect(canApplyDesignProposal("applying")).toBe(false);
    expect(canApplyDesignProposal("proposal-ready")).toBe(true);
    expect(canApplyDesignProposal("failed")).toBe(true);
  });
});
