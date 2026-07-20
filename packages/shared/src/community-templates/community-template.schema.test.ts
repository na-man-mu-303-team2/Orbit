import { describe, expect, it } from "vitest";

import {
  communityTemplateIdSchema,
  communityTemplateSnapshotSchema,
  communityTemplateTitleSchema,
  maxCommunityTemplateSlides
} from "./community-template.schema";
import {
  communityTemplateCardSchema,
  communityTemplateListQuerySchema,
  publishCommunityTemplateRequestSchema,
  useCommunityTemplateRequestSchema
} from "./community-template-api.schema";

const safeElement = {
  elementId: "el_safe",
  type: "text" as const,
  role: "title" as const,
  x: 10,
  y: 20,
  width: 600,
  height: 80,
  rotation: 0,
  opacity: 1,
  zIndex: 1,
  locked: false,
  visible: true,
  props: {
    text: "제목을 입력하세요",
    fontFamily: "Pretendard",
    fontSize: 48,
    fontWeight: "bold" as const,
    align: "left" as const,
    verticalAlign: "top" as const,
    lineHeight: 1.2
  }
};

const snapshot = {
  schemaVersion: 1 as const,
  canvas: {
    preset: "wide-16-9" as const,
    width: 1920 as const,
    height: 1080 as const,
    aspectRatio: "16:9" as const
  },
  theme: {
    name: "Community Template" as const,
    fontFamily: "Pretendard",
    backgroundColor: "#ffffff",
    textColor: "#111827",
    accentColor: "#2563eb",
    palette: {
      primary: "#2563eb",
      secondary: "#7c3aed",
      surface: "#ffffff",
      muted: "#f3f4f6",
      border: "#e5e7eb"
    },
    typography: {
      headingFontFamily: "Pretendard",
      bodyFontFamily: "Pretendard",
      titleSize: 56,
      headingSize: 40,
      bodySize: 24,
      captionSize: 16
    },
    effects: { borderRadius: 8 }
  },
  targetDurationMinutes: 5,
  slides: [
    {
      kind: "content" as const,
      slideId: "slide_safe",
      order: 1,
      title: "슬라이드 제목" as const,
      style: { fontFamily: "Pretendard", backgroundColor: "#ffffff" },
      elements: [safeElement]
    }
  ]
};

describe("community template snapshot contract", () => {
  it("accepts only the immutable privacy-safe projection", () => {
    expect(communityTemplateSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it.each([
    ["speakerNotes", "PRIVATE_TEMPLATE_MARKER_9f31"],
    ["semanticCues", []],
    ["aiNotes", {}],
    ["backgroundImage", { src: "https://private.example/internal" }],
    ["activity", { prompt: "PRIVATE_TEMPLATE_MARKER_9f31" }]
  ])("rejects private slide field %s", (field, value) => {
    const unsafe = structuredClone(snapshot);
    Object.assign(unsafe.slides[0], { [field]: value });

    expect(() => communityTemplateSnapshotSchema.parse(unsafe)).toThrow();
  });

  it.each([
    { ...safeElement, type: "image", props: { src: "https://private.example/internal" } },
    { ...safeElement, type: "svg", props: { src: "data:image/svg+xml;base64,private" } },
    { ...safeElement, fileId: "file_private_123" },
    { ...safeElement, ooxmlOrigin: "imported" }
  ])("rejects asset and source element fields", (element) => {
    const unsafe = structuredClone(snapshot);
    unsafe.slides[0].elements = [element as typeof safeElement];

    expect(() => communityTemplateSnapshotSchema.parse(unsafe)).toThrow();
  });

  it("rejects activity slides and more than the shared slide limit", () => {
    const activity = structuredClone(snapshot);
    activity.slides[0].kind = "activity" as "content";
    expect(() => communityTemplateSnapshotSchema.parse(activity)).toThrow();

    const tooMany = structuredClone(snapshot);
    tooMany.slides = Array.from(
      { length: maxCommunityTemplateSlides + 1 },
      (_, index) => ({
        ...snapshot.slides[0],
        slideId: `slide_${index}`,
        order: index + 1
      })
    );
    expect(() => communityTemplateSnapshotSchema.parse(tooMany)).toThrow();
  });
});

describe("community template API contract", () => {
  it("validates prefixed template IDs and trimmed titles", () => {
    expect(communityTemplateIdSchema.parse("community_template_abc-123")).toBe(
      "community_template_abc-123"
    );
    expect(() => communityTemplateIdSchema.parse("template_abc")).toThrow();
    expect(communityTemplateTitleSchema.parse("  교육 템플릿  ")).toBe(
      "교육 템플릿"
    );
    expect(() => communityTemplateTitleSchema.parse("x".repeat(61))).toThrow();
  });

  it("coerces bounded pagination and rejects unknown query keys", () => {
    expect(communityTemplateListQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 24
    });
    expect(
      communityTemplateListQuerySchema.parse({ page: "2", limit: "48" })
    ).toMatchObject({ page: 2, limit: 48 });
    expect(() =>
      communityTemplateListQuerySchema.parse({ limit: "49" })
    ).toThrow();
    expect(() =>
      communityTemplateListQuerySchema.parse({ query: "x".repeat(61) })
    ).toThrow();
    expect(() =>
      communityTemplateListQuerySchema.parse({ ownerUserId: "user_private" })
    ).toThrow();
  });

  it("requires the publish rights acknowledgement and blocks client snapshots", () => {
    const request = {
      sourceProjectId: "project_source",
      title: "교육 템플릿",
      category: "education",
      rightsConfirmed: true
    };
    expect(publishCommunityTemplateRequestSchema.parse(request)).toEqual(request);
    expect(() =>
      publishCommunityTemplateRequestSchema.parse({
        ...request,
        rightsConfirmed: false
      })
    ).toThrow();
    expect(() =>
      publishCommunityTemplateRequestSchema.parse({
        ...request,
        snapshot
      })
    ).toThrow();
  });

  it("uses a UUID idempotency key and rejects extra use input", () => {
    expect(
      useCommunityTemplateRequestSchema.parse({
        clientRequestId: "6d620d1a-4d0d-4b40-b430-68875d5942b1"
      })
    ).toBeDefined();
    expect(() =>
      useCommunityTemplateRequestSchema.parse({ clientRequestId: "retry-1" })
    ).toThrow();
    expect(() =>
      useCommunityTemplateRequestSchema.parse({
        clientRequestId: "6d620d1a-4d0d-4b40-b430-68875d5942b1",
        deck: { projectId: "project_private" }
      })
    ).toThrow();
  });

  it("keeps list cards free of owner, source, and full snapshot data", () => {
    const card = {
      templateId: "community_template_safe",
      title: "안전한 템플릿",
      category: "business",
      preview: {
        canvas: snapshot.canvas,
        theme: snapshot.theme,
        slide: snapshot.slides[0]
      },
      createdAt: "2026-07-21T00:00:00.000Z"
    };
    expect(communityTemplateCardSchema.parse(card)).toEqual(card);
    expect(() =>
      communityTemplateCardSchema.parse({
        ...card,
        ownerUserId: "user_private",
        sourceProjectId: "project_private",
        snapshot
      })
    ).toThrow();
  });
});
