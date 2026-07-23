import { createDemoDeck } from "@orbit/editor-core";
import { describe, expect, it } from "vitest";

import { projectAiDeckPreview } from "./ai-deck-preview.service";

describe("projectAiDeckPreview", () => {
  it("keeps a completed cover in grounding until the outline exists", () => {
    const source = createDemoDeck();
    const preview = projectAiDeckPreview({
      job: {
        job_id: "job-cover",
        project_id: source.projectId,
        status: "running",
        progress: 12,
        error: null,
        updated_at: "2026-07-17T00:00:00.000Z",
      },
      expectedSlideCountRange: { min: 5, max: 8 },
      stageRows: [{ stage: "source-grounding", status: "running" }],
      planningRows: [],
      imageRows: [],
      qualityRow: null,
      deckRow: null,
      coverRow: {
        payload_json: {
          deck: { ...source, slides: source.slides.slice(0, 1) },
          warnings: [],
          validation: {},
        },
      },
    });

    expect(preview).toMatchObject({
      status: "grounding",
      expectedSlideCountRange: { min: 5, max: 8 },
      outline: [],
    });
    expect(preview.deck?.slides).toHaveLength(1);
  });

  it("reveals only the contiguous server-completed v2 prefix", () => {
    const source = createDemoDeck();
    const slides = source.slides.slice(0, 2).map((slide, index) => ({
      ...slide,
      order: index + 1,
    }));
    const deckShell = (({ slides: ignoredSlides, ...shell }) => {
      void ignoredSlides;
      return shell;
    })(source);
    const manifest = slides.map((slide, index) => ({
      sourceOrder: index + 1,
      order: index + 1,
      slideId: slide.slideId,
      shardKey: `${String(index + 1).padStart(3, "0")}-${slide.slideId}`,
    }));
    const completed = (index: number) => ({
      artifactVersion: 2 as const,
      sourceOrder: index + 1,
      order: index + 1,
      slideId: slides[index]!.slideId,
      slide: slides[index]!,
      warnings: [],
      validation: {},
    });
    const base = {
      job: {
        job_id: "job-v2",
        project_id: source.projectId,
        status: "running" as const,
        progress: 65,
        error: null,
        updated_at: "2026-07-17T00:00:00.000Z",
      },
      planningRows: [
        {
          stage: "content-planning" as const,
          payload_json: {
            contentPlan: {
              slidePlans: slides.map((slide) => ({
                order: slide.order,
                title: slide.title,
                message: `message-${slide.order}`,
              })),
            },
          },
        },
        {
          stage: "layout-compile" as const,
          payload_json: {
            artifactVersion: 2,
            deckShell,
            slides: manifest,
            warnings: [],
          },
        },
      ],
      qualityRow: null,
      deckRow: null,
    };

    const outOfOrder = projectAiDeckPreview({
      ...base,
      imageRows: [
        {
          shard_key: manifest[1]!.shardKey,
          status: "succeeded" as const,
          payload_json: completed(1),
        },
      ],
    });
    expect(outOfOrder.deck).toBeNull();
    expect(outOfOrder.completedSlideIds).toEqual([]);
    expect(outOfOrder.pendingSlideIds).toEqual(
      manifest.map((slide) => slide.slideId),
    );

    const coverAndBody = projectAiDeckPreview({
      ...base,
      coverRow: {
        payload_json: {
          deck: { ...source, slides: [slides[0]!] },
          warnings: [],
          validation: {},
        },
      },
      imageRows: [
        {
          shard_key: manifest[1]!.shardKey,
          status: "succeeded" as const,
          payload_json: completed(1),
        },
      ],
    });
    expect(coverAndBody.deck?.slides.map((slide) => slide.slideId)).toEqual(
      manifest.map((slide) => slide.slideId),
    );
    expect(coverAndBody.pendingSlideIds).toEqual([]);

    const prefix = projectAiDeckPreview({
      ...base,
      imageRows: [
        {
          shard_key: manifest[1]!.shardKey,
          status: "succeeded" as const,
          payload_json: completed(1),
        },
        {
          shard_key: manifest[0]!.shardKey,
          status: "succeeded" as const,
          payload_json: completed(0),
        },
      ],
    });
    expect(prefix.deck?.slides.map((slide) => slide.slideId)).toEqual(
      manifest.map((slide) => slide.slideId),
    );
    expect(prefix.pendingSlideIds).toEqual([]);
  });

  it("returns only safe Story outline fields before layout", () => {
    const preview = projectAiDeckPreview({
      job: {
        job_id: "job-1",
        project_id: "project-1",
        status: "running",
        progress: 40,
        error: null,
        updated_at: "2026-07-17T00:00:00.000Z",
      },
      planningRows: [
        {
          stage: "content-planning",
          payload_json: {
            rawInput: { prompt: "secret", sourceRecords: ["secret"] },
            contentPlan: {
              slidePlans: [
                {
                  order: 1,
                  title: "첫 장",
                  message: "핵심 메시지",
                  speakerNotes: "비공개 발표자 대본",
                  sourceRefs: ["source-secret"],
                },
              ],
            },
          },
        },
      ],
      imageRows: [],
      qualityRow: null,
      deckRow: null,
    });

    expect(preview).toMatchObject({
      status: "composing",
      outline: [{ order: 1, title: "첫 장", message: "핵심 메시지" }],
      deck: null,
    });
    expect(JSON.stringify(preview)).not.toContain("secret");
    expect(JSON.stringify(preview)).not.toContain("발표자 대본");
  });

  it("keeps a safe failure status without exposing provider errors", () => {
    const preview = projectAiDeckPreview({
      job: {
        job_id: "job-1",
        project_id: "project-1",
        status: "failed",
        progress: 70,
        error: {
          code: "AI_DECK_IMAGE_FAILED",
          message: "provider response must stay private",
          retryable: true,
        },
        updated_at: "2026-07-17T00:00:00.000Z",
      },
      planningRows: [],
      imageRows: [],
      qualityRow: null,
      deckRow: null,
    });

    expect(preview.error).toEqual({
      code: "AI_DECK_IMAGE_FAILED",
      message: "슬라이드를 생성하지 못했습니다.",
      retryable: true,
    });
  });
});
