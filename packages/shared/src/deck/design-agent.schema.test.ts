import { describe, expect, it } from "vitest";
import { designAgentWorkerResponseSchema } from "./design-agent.schema";

describe("design agent schema", () => {
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
