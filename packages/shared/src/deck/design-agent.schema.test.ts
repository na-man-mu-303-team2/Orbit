import { describe, expect, it } from "vitest";
import {
  createDesignAgentMessageRequestSchema,
  designAgentCapabilities,
  designAgentCapabilitiesSchema,
  designAgentWorkerRequestSchema,
  designAgentWorkerResponseSchema,
} from "./design-agent.schema";

const designAgentContext = {
  deckId: "deck_1",
  baseVersion: 1,
  canvas: {
    preset: "wide-16-9" as const,
    width: 1920 as const,
    height: 1080 as const,
    aspectRatio: "16:9" as const,
  },
  slide: {
    slideId: "slide_1",
    order: 1,
    title: "샘플",
    style: {},
    elements: [],
    animations: [],
    semanticCues: [],
    actions: [],
  },
  selectedElementIds: [],
  theme: {
    themeId: "theme_1",
    name: "기본",
    backgroundColor: "#FFFFFF",
    textColor: "#111111",
    accentColor: "#3B82F6",
    fontFamily: "Pretendard",
  },
};

describe("design agent schema", () => {
  it.each([
    "redesign-slide",
    "tidy-layout",
    "emphasize-message",
    "recommend-animation",
  ] as const)(
    "accepts the %s intent preset through the public and worker contracts",
    (intentPreset) => {
      const request = createDesignAgentMessageRequestSchema.parse({
        content: "현재 슬라이드를 개선해 주세요.",
        intentPreset,
        context: designAgentContext,
      });
      const workerRequest = designAgentWorkerRequestSchema.parse({
        projectId: "project_1",
        sessionId: "session_1",
        question: request.content,
        intentPreset: request.intentPreset,
        context: request.context,
        capabilities: designAgentCapabilities,
      });

      expect(request.intentPreset).toBe(intentPreset);
      expect(workerRequest.intentPreset).toBe(intentPreset);
    },
  );

  it("keeps intentPreset optional for existing clients", () => {
    const request = createDesignAgentMessageRequestSchema.parse({
      content: "오른쪽으로 정렬해 주세요.",
      context: designAgentContext,
    });

    expect(request.intentPreset).toBeUndefined();
  });

  it("rejects an unknown intent preset", () => {
    const result = createDesignAgentMessageRequestSchema.safeParse({
      content: "현재 슬라이드를 개선해 주세요.",
      intentPreset: "replace-slide-with-image",
      context: designAgentContext,
    });

    expect(result.success).toBe(false);
  });

  it("enables supported animation patch operations", () => {
    expect(designAgentCapabilities.operations).toEqual(
      expect.arrayContaining(["add_animation", "update_animation", "delete_animation"]),
    );
  });

  it.each(["1", "2"] as const)(
    "accepts and preserves capability version %s",
    (version) => {
      const parsed = designAgentCapabilitiesSchema.parse({
        ...designAgentCapabilities,
        version,
      });

      expect(parsed.version).toBe(version);
    },
  );

  it("rejects unknown capability versions while continuing to emit version 1", () => {
    const result = designAgentCapabilitiesSchema.safeParse({
      ...designAgentCapabilities,
      version: "3",
    });

    expect(result.success).toBe(false);
    expect(designAgentCapabilities).toMatchObject({
      version: "1",
      addableElementTypes: ["text", "rect", "chart", "table"],
    });
  });

  it("accepts patch operations returned by the worker", () => {
    const response = designAgentWorkerResponseSchema.parse({
      message: "변경안을 준비했습니다.",
      interpretedIntent: {
        target: "selected-elements",
        action: "우측 정렬",
        alignment: "canvas-right",
      },
      operations: [
        {
          type: "update_element_frame",
          slideId: "slide_1",
          elementId: "el_1",
          frame: { x: 100 },
        },
      ],
      affectedElementIds: ["el_1"],
      warnings: [],
    });

    expect(response.operations[0].type).toBe("update_element_frame");
  });

  it("rejects operations for malformed element ids", () => {
    const result = designAgentWorkerResponseSchema.safeParse({
      message: "변경안을 준비했습니다.",
      interpretedIntent: {
        target: "current-slide",
        action: "정렬",
        alignment: null,
      },
      operations: [
        {
          type: "update_element_frame",
          slideId: "slide_1",
          elementId: "invalid",
          frame: { x: 100 },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("accepts adding text and rounded rectangle elements", () => {
    const result = designAgentWorkerResponseSchema.parse({
      message: "카드형 레이아웃을 제안합니다.",
      interpretedIntent: {
        target: "current-slide",
        action: "카드 추가",
        alignment: "custom",
      },
      operations: [
        {
          type: "add_element",
          slideId: "slide_1",
          element: {
            elementId: "el_card_1",
            type: "rect",
            role: "decoration",
            x: 100,
            y: 500,
            width: 500,
            height: 240,
            rotation: 0,
            opacity: 1,
            zIndex: 10,
            locked: false,
            visible: true,
            props: {
              fill: "#FFFFFF",
              stroke: "#D0D5DD",
              strokeWidth: 1,
              borderRadius: 24,
            },
          },
        },
      ],
      affectedElementIds: ["el_card_1"],
      warnings: [],
    });

    expect(result.operations[0]?.type).toBe("add_element");
  });
});
