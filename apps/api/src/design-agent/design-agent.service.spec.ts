import { createDemoDeck } from "@orbit/editor-core";
import type { DeckPatch } from "@orbit/shared";
import type { Repository } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import type { DecksService } from "../decks/decks.service";
import type { SmartArtLayoutEntity } from "../smart-art-layouts/smart-art-layout.entity";
import type { SmartArtLayoutsService } from "../smart-art-layouts/smart-art-layouts.service";
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
      {} as SmartArtLayoutsService,
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

describe("DesignAgentService.createMessage smart art expansion", () => {
  it("expands a smartArtRequest into add_element operations using the matched preset", async () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0]!;
    const canvas = deck.canvas;
    const sourceElementId = slide.elements.find((element) => element.visible)?.elementId;
    expect(sourceElementId).toBeTruthy();

    const savedMessages: DesignAgentMessageEntity[] = [];
    const messagesRepository = {
      create: vi.fn((value: Partial<DesignAgentMessageEntity>) => value as DesignAgentMessageEntity),
      save: vi.fn(async (value: DesignAgentMessageEntity) => {
        savedMessages.push(value);
        return value;
      }),
      find: vi.fn(async () => []),
    } as unknown as Repository<DesignAgentMessageEntity>;

    let savedProposal: DesignAgentProposalEntity | undefined;
    const proposalsRepository = {
      create: vi.fn(
        (value: Partial<DesignAgentProposalEntity>) => value as DesignAgentProposalEntity,
      ),
      save: vi.fn(async (value: DesignAgentProposalEntity) => {
        savedProposal = value;
        return value;
      }),
    } as unknown as Repository<DesignAgentProposalEntity>;

    const decksService = {
      getDeck: vi.fn(async () => ({
        projectId: deck.projectId,
        deck,
        updatedAt: "2026-07-17T00:00:00.000Z",
      })),
    } as unknown as DecksService;

    const fakeLayout = {
      layoutId: "smart_art_list_vertical_3",
      elements: [
        {
          elementIdSuffix: "row_bg_0",
          type: "rect",
          itemIndex: 0,
          role: "decoration",
          xFrac: 0.1,
          yFrac: 0.2,
          widthFrac: 0.8,
          heightFrac: 0.1,
          rotation: 0,
          zIndex: 100,
          props: { fill: "#F1F1F1", stroke: "#C8C8C6", strokeWidth: 1, borderRadius: 4 },
        },
        {
          elementIdSuffix: "text_0",
          type: "text",
          itemIndex: 0,
          role: "body",
          xFrac: 0.15,
          yFrac: 0.22,
          widthFrac: 0.7,
          heightFrac: 0.05,
          rotation: 0,
          zIndex: 101,
          textField: "title",
          props: { fontSize: 26, fontWeight: "normal", color: "#222222", align: "left", verticalAlign: "middle", lineHeight: 1.15 },
        },
        {
          elementIdSuffix: "text_1",
          type: "text",
          itemIndex: 1,
          role: "body",
          xFrac: 0.15,
          yFrac: 0.32,
          widthFrac: 0.7,
          heightFrac: 0.05,
          rotation: 0,
          zIndex: 102,
          textField: "title",
          props: { fontSize: 26, fontWeight: "normal", color: "#222222", align: "left", verticalAlign: "middle", lineHeight: 1.15 },
        },
      ],
    } as unknown as SmartArtLayoutEntity;

    const smartArtLayoutsService = {
      findByTypeAndItemCount: vi.fn(async () => fakeLayout),
    } as unknown as SmartArtLayoutsService;

    const pythonClient = {
      propose: vi.fn(async () => ({
        message: "여기 리스트 스마트아트를 만들었어요.",
        interpretedIntent: { target: "current-slide", action: "add smart art" },
        operations: [],
        affectedElementIds: [],
        warnings: [],
        smartArtRequest: {
          layoutType: "list",
          sourceElementIds: [sourceElementId!],
          items: [{ title: "기획" }, { title: "개발" }],
        },
      })),
    } as unknown as DesignAgentPythonClient;

    const service = new DesignAgentService(
      messagesRepository,
      proposalsRepository,
      decksService,
      pythonClient,
      smartArtLayoutsService,
      { info: vi.fn(), warn: vi.fn() } as never,
    );

    await service.createMessage(deck.projectId, "user_demo_1", {
      content: "이 목록을 스마트아트로 만들어줘: 1.기획 2.개발",
      context: {
        deckId: deck.deckId,
        baseVersion: deck.version,
        canvas,
        slide,
        selectedElementIds: [sourceElementId!],
        theme: deck.theme,
      },
    });

    expect(smartArtLayoutsService.findByTypeAndItemCount).toHaveBeenCalledWith("list", 2);
    expect(savedProposal?.operations).toHaveLength(4);
    expect(savedProposal?.operations[0]).toMatchObject({
      type: "delete_element",
      elementId: sourceElementId,
    });
    const texts = savedProposal?.operations
      .filter((op) => op.type === "add_element" && op.element.type === "text")
      .map((op) => (op.type === "add_element" ? (op.element.props as { text?: string }).text : undefined));
    expect(texts).toEqual(["기획", "개발"]);
  });
});
