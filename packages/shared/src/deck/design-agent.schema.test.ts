import { describe, expect, it } from "vitest";
import {
  createDesignAgentMessageRequestSchema,
  createDesignAgentMessageResponseSchema,
  designAgentCapabilities,
  designAgentCapabilitiesSchema,
  designAgentWorkerRequestSchema,
  designAgentWorkerResponseSchema,
  motionPlanMetadataSchema,
} from "./design-agent.schema";

const paletteOptions = [
  ["current-theme", true, "#2563EB"],
  ["calm-blue", false, "#0F766E"],
  ["vivid-coral", false, "#EA580C"],
].map(([optionId, isCurrentTheme, focal], index) => ({
  optionId: optionId as string,
  name: `배색 ${index + 1}`,
  isCurrentTheme: isCurrentTheme as boolean,
  palette: {
    dominant: "#FFFFFF",
    surface: "#F8FAFC",
    text: "#111827",
    focal: focal as string,
    secondary: "#7C3AED",
  },
  rationale: "검증용 배색입니다.",
}));

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
    expect(request.selectedPaletteOptionId).toBeUndefined();
  });

  it("distinguishes a palette option request from legacy requests", () => {
    const request = createDesignAgentMessageRequestSchema.parse({
      content: "이 슬라이드를 재디자인해 주세요.",
      intentPreset: "redesign-slide",
      selectedPaletteOptionId: null,
      context: designAgentContext,
    });
    const workerRequest = designAgentWorkerRequestSchema.parse({
      projectId: "project_1",
      sessionId: "session_1",
      question: request.content,
      intentPreset: request.intentPreset,
      context: request.context,
      capabilities: designAgentCapabilities,
      requestPaletteOptions: true,
    });

    expect(request.selectedPaletteOptionId).toBeNull();
    expect(workerRequest.requestPaletteOptions).toBe(true);
  });

  it("carries palette options through worker and public responses", () => {
    const workerResponse = designAgentWorkerResponseSchema.parse({
      message: "배색을 골라주세요.",
      interpretedIntent: {
        target: "current-slide",
        action: "select-redesign-palette",
        alignment: null,
      },
      operations: [],
      affectedElementIds: [],
      warnings: [],
      paletteOptions,
    });
    const publicResponse = createDesignAgentMessageResponseSchema.parse({
      sessionId: "session_1",
      requestMessage: {
        messageId: "message_1",
        sessionId: "session_1",
        projectId: "project_1",
        deckId: "deck_1",
        slideId: "slide_1",
        role: "user",
        content: "재디자인",
        status: "succeeded",
        createdAt: "2026-07-22T00:00:00.000Z",
        updatedAt: "2026-07-22T00:00:00.000Z",
      },
      responseMessage: {
        messageId: "message_2",
        sessionId: "session_1",
        projectId: "project_1",
        deckId: "deck_1",
        slideId: "slide_1",
        role: "assistant",
        content: workerResponse.message,
        status: "succeeded",
        createdAt: "2026-07-22T00:00:01.000Z",
        updatedAt: "2026-07-22T00:00:01.000Z",
      },
      paletteOptions: workerResponse.paletteOptions,
      uiAction: null,
    });

    expect(publicResponse.proposal).toBeUndefined();
    expect(publicResponse.paletteOptions).toHaveLength(3);
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
      expect.arrayContaining([
        "add_animation",
        "update_animation",
        "delete_animation",
      ]),
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

  it("rejects unknown capability versions while emitting the v2 shape contract", () => {
    const result = designAgentCapabilitiesSchema.safeParse({
      ...designAgentCapabilities,
      version: "3",
    });

    expect(result.success).toBe(false);
    expect(designAgentCapabilities).toMatchObject({
      version: "2",
      addableElementTypes: [
        "text",
        "rect",
        "ellipse",
        "line",
        "polygon",
        "image",
        "chart",
        "table",
      ],
      canGenerateImages: true,
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

  it.each([
    { type: "ellipse" as const, props: {} },
    { type: "line" as const, props: { lineCap: "round" as const } },
    { type: "polygon" as const, props: { sides: 5 } },
  ])(
    "accepts add_element for capability v2 $type shapes",
    ({ type, props }) => {
      const result = designAgentWorkerResponseSchema.parse({
        message: "장식 도형을 추가했습니다.",
        interpretedIntent: {
          target: "current-slide",
          action: "장식 추가",
          alignment: "custom",
        },
        operations: [
          {
            type: "add_element",
            slideId: "slide_1",
            element: {
              elementId: `el_orn_${type}`,
              type,
              role: "decoration",
              x: 120,
              y: 120,
              width: 120,
              height: 120,
              rotation: 0,
              opacity: 1,
              zIndex: 10,
              locked: false,
              visible: true,
              props: {
                fill: "transparent",
                stroke: "#2563EB",
                strokeWidth: 2,
                borderRadius: 0,
                ...props,
              },
            },
          },
        ],
        affectedElementIds: [`el_orn_${type}`],
        warnings: [],
      });

      expect(result.operations[0]).toMatchObject({
        type: "add_element",
        element: { type, role: "decoration" },
      });
    },
  );

  it("accepts add_element for a capability v2 image", () => {
    const result = designAgentWorkerResponseSchema.parse({
      message: "이미지를 배치했습니다.",
      interpretedIntent: {
        target: "current-slide",
        action: "이미지 배치",
        alignment: "custom",
      },
      operations: [
        {
          type: "add_element",
          slideId: "slide_1",
          element: {
            elementId: "el_media_image",
            type: "image",
            role: "media",
            x: 120,
            y: 120,
            width: 720,
            height: 480,
            rotation: 0,
            opacity: 1,
            zIndex: 3,
            locked: false,
            visible: true,
            props: {
              src: "https://example.com/image.png",
              alt: "제품 이미지",
              fit: "cover",
              focusX: 0.5,
              focusY: 0.5,
            },
          },
        },
      ],
      affectedElementIds: ["el_media_image"],
      warnings: [],
    });

    expect(result.operations[0]?.type).toBe("add_element");
  });

  it("accepts only the bounded internal motion import context", () => {
    const request = designAgentWorkerRequestSchema.parse({
      projectId: "project_1",
      sessionId: "session_1",
      question: "애니메이션을 추천해 주세요.",
      intentPreset: "recommend-animation",
      context: designAgentContext,
      capabilities: designAgentCapabilities,
      motionImportContext: {
        renderMode: "hybrid",
        sourceSlidePartPresent: true,
        importedMainSequenceCoverage: "complete",
        stableTargetElementIds: ["el_stable"],
      },
    });

    expect(request.motionImportContext?.stableTargetElementIds).toEqual([
      "el_stable",
    ]);
    expect(
      designAgentWorkerRequestSchema.safeParse({
        ...request,
        motionImportContext: {
          ...request.motionImportContext,
          notesXml: "forbidden",
        },
      }).success,
    ).toBe(false);
  });

  it("accepts only bounded internal motion planning context", () => {
    const base = {
      projectId: "project_1",
      sessionId: "session_1",
      question: "애니메이션을 추천해 주세요.",
      intentPreset: "recommend-animation" as const,
      context: designAgentContext,
      capabilities: designAgentCapabilities,
    };
    const request = designAgentWorkerRequestSchema.parse({
      ...base,
      motionPlanningContext: {
        allowedTargetElementIds: ["el_1"],
        effectiveTypography: [
          {
            elementId: "el_1",
            characterCount: 10,
            dominantFontSize: 24,
            effectiveFontSize: 20,
            effectiveLetterSpacing: 0,
            effectiveLineHeight: 1.2,
            resolvedFontScale: 0.8,
          },
        ],
        speakerNotes: "발표 흐름",
        notesPresent: true,
        notesTruncated: false,
      },
    });

    expect(request.motionPlanningContext?.speakerNotes).toBe("발표 흐름");
    expect(
      designAgentWorkerRequestSchema.safeParse({
        ...base,
        motionPlanningContext: {
          allowedTargetElementIds: ["el_1"],
          effectiveTypography: [],
          speakerNotes: "x".repeat(4_001),
          notesPresent: true,
          notesTruncated: true,
        },
      }).success,
    ).toBe(false);
  });

  it("accepts bounded semantic motion plan metadata without raw effects", () => {
    const motionPlan = motionPlanMetadataSchema.parse({
      source: "llm",
      model: "gpt-4.1-mini-2025-04-14",
      attemptCount: 2,
      compilerVersion: "motion-compiler-v2",
      plan: {
        schemaVersion: 2,
        pattern: "hero-then-support",
        pacing: "balanced",
        beats: [
          {
            beatId: "beat_intro",
            purpose: "orient",
            trigger: "entry",
            relation: "together",
            targets: [{ elementId: "el_title", motionIntent: "introduce" }],
          },
          {
            beatId: "beat_focus",
            purpose: "emphasize",
            trigger: "click",
            relation: "sequence",
            targets: [{ elementId: "el_media", motionIntent: "focus" }],
          },
        ],
      },
    });

    expect(motionPlan.plan.pacing).toBe("balanced");
    expect(
      motionPlanMetadataSchema.safeParse({
        ...motionPlan,
        plan: {
          ...motionPlan.plan,
          beats: [
            {
              ...motionPlan.plan.beats[0],
              targets: [
                {
                  elementId: "el_title",
                  motionIntent: "introduce",
                  effect: "zoom-in",
                },
              ],
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects repeated motion plan targets", () => {
    const result = motionPlanMetadataSchema.safeParse({
      source: "llm",
      model: "gpt-4.1-mini-2025-04-14",
      attemptCount: 1,
      compilerVersion: "motion-compiler-v2",
      plan: {
        schemaVersion: 2,
        pattern: "cluster-reveal",
        pacing: "brisk",
        beats: [
          {
            beatId: "beat_repeat",
            purpose: "reveal",
            trigger: "entry",
            relation: "together",
            targets: [
              { elementId: "el_repeat", motionIntent: "reveal" },
              { elementId: "el_repeat", motionIntent: "support" },
            ],
          },
        ],
      },
    });

    expect(result.success).toBe(false);
  });
});
