import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AudienceAnnotationOverlay } from "./AudienceAnnotationOverlay";
import { p0AnimationDeck } from "./__fixtures__/animationDeck";

const snapshot = {
  sessionId: "session_1",
  authorityEpochId: "epoch_1",
  surfaceId: "surface_1",
  surfaceRevision: 2,
  strokes: [
    {
      strokeId: "stroke_1",
      tool: "pen" as const,
      color: "ink-blue" as const,
      width: 0.01,
      points: [
        { x: 0.1, y: 0.2, pressure: 0.5, t: 0 },
        { x: 0.3, y: 0.4, pressure: 0.5, t: 1 },
      ],
    },
  ],
};

describe("AudienceAnnotationOverlay", () => {
  it("renders an accepted normalized stroke at the audience scale", () => {
    const html = renderToStaticMarkup(
      <AudienceAnnotationOverlay
        canvas={p0AnimationDeck.canvas}
        mode="slide"
        scale={0.5}
        snapshot={snapshot}
      />,
    );

    expect(html).toContain('aria-label="청중 주석"');
    expect(html).toContain('data-surface-revision="2"');
    expect(html).toContain('d="M 0.1 0.2 L 0.3 0.4"');
    expect(html).toContain('width="960"');
    expect(html).toContain('height="540"');
  });

  it("removes all annotation markup in black mode and with an empty snapshot", () => {
    expect(
      renderToStaticMarkup(
        <AudienceAnnotationOverlay
          canvas={p0AnimationDeck.canvas}
          mode="black"
          scale={1}
          snapshot={snapshot}
        />,
      ),
    ).toBe("");
    expect(
      renderToStaticMarkup(
        <AudienceAnnotationOverlay
          canvas={p0AnimationDeck.canvas}
          mode="slide"
          scale={1}
          snapshot={{ ...snapshot, strokes: [] }}
        />,
      ),
    ).toBe("");
  });
});
