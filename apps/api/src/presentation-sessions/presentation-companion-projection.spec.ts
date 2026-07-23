import { createDemoDeck } from "@orbit/editor-core";
import { deckSchema } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import {
  createPresentationCompanionProjection,
  parseProjectAssetUrl,
} from "./presentation-companion-projection";

const privateMarker = "PRIVATE_PRESENTER_MARKER_7f31";

describe("presentation companion projection", () => {
  it("serializes only audience fields and rewrites referenced render assets", () => {
    const source = createDemoDeck();
    const firstSlide = source.slides[0];
    const deck = deckSchema.parse({
      ...source,
      title: privateMarker,
      metadata: {
        ...source.metadata,
        createdFrom: {
          topic: privateMarker,
          references: [{ fileId: "file_private_source" }],
        },
      },
      slides: [
        {
          ...firstSlide,
          thumbnailUrl:
            `/api/v1/projects/${source.projectId}/assets/file_thumbnail/content`,
          speakerNotes: privateMarker,
          aiNotes: { emphasisPoints: [privateMarker] },
          style: {
            ...firstSlide.style,
            backgroundImage: {
              src:
                `/api/v1/projects/${source.projectId}/assets/file_background/content`,
              alt: "배경",
              fit: "cover",
              opacity: 1,
            },
          },
          elements: [
            ...firstSlide.elements,
            {
              elementId: "el_companion_image",
              type: "image",
              x: 10,
              y: 10,
              width: 100,
              height: 100,
              props: {
                src:
                  `/api/v1/projects/${source.projectId}/assets/file_image/content`,
              },
            },
            {
              elementId: "el_companion_svg",
              type: "svg",
              x: 120,
              y: 10,
              width: 100,
              height: 100,
              props: {
                src:
                  `https://orbit.test/api/v1/projects/${source.projectId}/assets/file_svg/content`,
              },
            },
            {
              elementId: "el_companion_external",
              type: "image",
              x: 230,
              y: 10,
              width: 100,
              height: 100,
              props: { src: "https://cdn.example.test/public-image.png" },
            },
            {
              elementId: "el_companion_unsafe",
              type: "image",
              x: 340,
              y: 10,
              width: 100,
              height: 100,
              props: { src: "data:image/png;base64,PRIVATE_IMAGE" },
            },
          ],
          animations: [
            ...firstSlide.animations,
            {
              animationId: "anim_companion_unsafe",
              elementId: "el_companion_unsafe",
              type: "appear",
              order: 999,
            },
          ],
        },
        ...source.slides.slice(1),
      ],
    });

    const projection = createPresentationCompanionProjection({
      deck,
      sessionId: "session_companion_1",
    });
    const serialized = JSON.stringify(projection.deck);

    expect(serialized).not.toContain(privateMarker);
    expect(serialized).not.toMatch(
      /speakerNotes|keywords|semanticCues|actions|aiNotes|metadata/,
    );
    expect(serialized).not.toContain("data:image");
    expect(serialized).toContain(
      "/api/v1/presentation-companion/session_companion_1/assets/file_image/content",
    );
    expect(serialized).toContain(
      "https://cdn.example.test/public-image.png",
    );
    expect(projection.referencedAssetIds).toEqual(
      new Set([
        "file_thumbnail",
        "file_background",
        "file_image",
        "file_svg",
      ]),
    );
    expect(
      projection.deck.slides[0]?.elements.some(
        (element) => element.elementId === "el_companion_unsafe",
      ),
    ).toBe(false);
    expect(
      projection.deck.slides[0]?.animations.some(
        (animation) => animation.animationId === "anim_companion_unsafe",
      ),
    ).toBe(false);
  });

  it("drops cross-project internal URLs and non-HTTPS schemes", () => {
    const source = createDemoDeck();
    const deck = deckSchema.parse({
      ...source,
      slides: source.slides.map((slide, index) =>
        index === 0
          ? {
              ...slide,
              thumbnailUrl:
                "/api/v1/projects/project_foreign/assets/file_foreign/content",
              style: {
                ...slide.style,
                backgroundImage: {
                  src: "blob:https://orbit.test/private",
                },
              },
            }
          : slide,
      ),
    });

    const { deck: projected, referencedAssetIds } =
      createPresentationCompanionProjection({
        deck,
        sessionId: "session_companion_1",
      });

    expect(projected.slides[0]).not.toHaveProperty("thumbnailUrl");
    expect(projected.slides[0]?.style).not.toHaveProperty("backgroundImage");
    expect(referencedAssetIds.size).toBe(0);
  });

  it("extracts only exact protected project asset paths", () => {
    expect(
      parseProjectAssetUrl(
        "/api/v1/projects/project_1/assets/file_1/content",
      ),
    ).toEqual({ projectId: "project_1", fileId: "file_1" });
    expect(
      parseProjectAssetUrl(
        "/api/v1/projects/project_1/assets/file_1/content/extra",
      ),
    ).toBeNull();
    expect(parseProjectAssetUrl("https://cdn.example.test/image.png")).toBeNull();
  });
});
