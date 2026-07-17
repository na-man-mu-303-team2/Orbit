import { describe, expect, it } from "vitest";
import {
  designAgentCapabilities,
  designAgentWorkerRequestSchema,
  designAgentWorkerResponseSchema,
} from "./design-agent.schema";

describe("design agent schema", () => {
  it("accepts reference attachments in worker request", () => {
    const request = designAgentWorkerRequestSchema.parse({
      projectId: "project_1",
      sessionId: "design_session_1",
      question: "색상을 바꿔줘",
      context: {
        deckId: "deck_1",
        baseVersion: 3,
        canvas: {
          preset: "wide-16-9",
          width: 1920,
          height: 1080,
          aspectRatio: "16:9",
        },
        slide: {
          slideId: "slide_1",
          elements: [],
          order: 1,
          title: "",
        },
        selectedElementIds: [],
        theme: { name: "Business" },
      },
      referenceAttachments: [
        {
          fileId: "file_1",
          fileName: "sample.pdf",
          mimeType: "application/pdf",
          kind: "document",
        },
      ],
    });

    expect(request.referenceAttachments).toHaveLength(1);
    expect(request.referenceAttachments[0]?.kind).toBe("document");
  });

  it("rejects too many reference attachments", () => {
    const payload = {
      projectId: "project_1",
      sessionId: "design_session_1",
      question: "색상을 바꿔줘",
      context: {
        deckId: "deck_1",
        baseVersion: 3,
        canvas: {
          preset: "wide-16-9",
          width: 1920,
          height: 1080,
          aspectRatio: "16:9",
        },
        slide: {
          slideId: "slide_1",
          elements: [],
          order: 1,
          title: "",
        },
        selectedElementIds: [],
        theme: { name: "Business" },
      },
      referenceAttachments: [
        {
          fileId: "file_1",
          fileName: "sample-1.pdf",
          mimeType: "application/pdf",
          kind: "document",
        },
        {
          fileId: "file_2",
          fileName: "sample-2.pdf",
          mimeType: "application/pdf",
          kind: "document",
        },
        {
          fileId: "file_3",
          fileName: "sample-3.pdf",
          mimeType: "application/pdf",
          kind: "document",
        },
        {
          fileId: "file_4",
          fileName: "sample-4.pdf",
          mimeType: "application/pdf",
          kind: "document",
        },
      ],
    };

    expect(designAgentWorkerRequestSchema.safeParse(payload).success).toBe(false);
  });

  it("enables supported animation patch operations", () => {
    expect(designAgentCapabilities.operations).toEqual(
      expect.arrayContaining(["add_animation", "update_animation", "delete_animation"]),
    );
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
