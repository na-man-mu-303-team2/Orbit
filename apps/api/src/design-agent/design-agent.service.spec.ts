import { createDemoDeck } from "@orbit/editor-core";
import type { DeckPatch } from "@orbit/shared";
import type { Repository } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import type { DecksService } from "../decks/decks.service";
import { DesignAgentMessageEntity } from "./design-agent-message.entity";
import { DesignAgentProposalEntity } from "./design-agent-proposal.entity";
import type { DesignAgentPythonClient } from "./design-agent-python.client";
import { DesignAgentService } from "./design-agent.service";

describe("DesignAgentService.applyProposal", () => {
  it("applies a pending proposal through the shared deck patch path", async () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0]!;
    const proposal = {
      proposalId: "design_proposal_1",
      projectId: deck.projectId,
      deckId: deck.deckId,
      slideId: slide.slideId,
      requestMessageId: "design_message_1",
      responseMessageId: "design_message_2",
      baseVersion: deck.version,
      title: "AI design proposal",
      summary: "Move the element.",
      operations: [{
        type: "update_slide_style",
        slideId: slide.slideId,
        style: { layout: "title-content" },
      }],
      interpretedIntent: null,
      affectedElementIds: [],
      warnings: [],
      status: "pending",
      appliedChangeId: null,
      rejectedReason: null,
      createdAt: new Date("2026-07-11T00:00:00.000Z"),
      updatedAt: new Date("2026-07-11T00:00:00.000Z"),
    } as unknown as DesignAgentProposalEntity;
    const proposalsRepository = {
      findOne: vi.fn(async () => proposal),
      save: vi.fn(async (value: DesignAgentProposalEntity) => value),
    } as unknown as Repository<DesignAgentProposalEntity>;
    const nextDeck = { ...deck, version: deck.version + 1 };
    const decksService = {
      getDeck: vi.fn(async () => ({ projectId: deck.projectId, deck, updatedAt: "2026-07-11T00:00:00.000Z" })),
      appendPatch: vi.fn(async (_projectId: string, body: { patch: DeckPatch }) => ({
        deck: nextDeck,
        changeRecord: {
          changeId: "change_design_1",
          deckId: deck.deckId,
          beforeVersion: deck.version,
          afterVersion: nextDeck.version,
          source: "ai",
          actorUserId: body.patch.actorUserId,
          createdAt: "2026-07-11T00:00:01.000Z",
          operations: body.patch.operations,
        },
        snapshot: null,
        updatedAt: "2026-07-11T00:00:01.000Z",
      })),
    } as unknown as DecksService;
    const service = new DesignAgentService(
      {} as Repository<DesignAgentMessageEntity>,
      proposalsRepository,
      decksService,
      {} as DesignAgentPythonClient,
      { info: vi.fn(), warn: vi.fn() } as never,
    );

    const result = await service.applyProposal(deck.projectId, proposal.proposalId, "user_demo_1");

    expect(result.deck.version).toBe(deck.version + 1);
    expect(result.proposal.status).toBe("applied");
    expect(result.proposal.appliedChangeId).toBe("change_design_1");
    expect(decksService.appendPatch).toHaveBeenCalledWith(deck.projectId, {
      patch: {
        deckId: deck.deckId,
        baseVersion: deck.version,
        source: "ai",
        actorUserId: "user_demo_1",
        operations: proposal.operations,
      },
      snapshotReason: "patch-applied",
    });
  });
});
