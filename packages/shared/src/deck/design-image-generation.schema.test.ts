import { describe, expect, it } from "vitest";

import {
  createDesignImageGenerationRequestSchema,
  designImageGenerationResultSchema,
} from "./design-image-generation.schema";

describe("design image generation contract", () => {
  it("accepts a bounded generation request", () => {
    expect(
      createDesignImageGenerationRequestSchema.parse({
        prompt: "궤도를 도는 위성의 사실적인 일러스트",
        deckId: "deck_demo",
        slideId: "slide_1",
        baseVersion: 3,
        selectedImageReference: {
          elementId: "el_reference_image",
          fileId: "file_reference",
          projectId: "project_demo",
          src: "/api/v1/projects/project_demo/assets/file_reference/content",
          alt: "참고 이미지",
        },
      }),
    ).toMatchObject({
      baseVersion: 3,
      selectedImageReference: { fileId: "file_reference" },
    });
  });

  it("rejects invalid result dimensions", () => {
    expect(
      designImageGenerationResultSchema.safeParse({
        fileId: "file_1",
        projectId: "project_1",
        purpose: "design-asset",
        url: "/asset.png",
        mimeType: "image/png",
        width: 0,
        height: 1024,
        prompt: "prompt",
        aspectRatio: "landscape",
      }).success,
    ).toBe(false);
  });
});
