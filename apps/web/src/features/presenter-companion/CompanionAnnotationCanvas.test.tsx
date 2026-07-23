import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CompanionAnnotationCanvas } from "./CompanionAnnotationCanvas";

const output = {
  sessionId: "session_1",
  authorityEpochId: "epoch_1",
  outputRevision: 1,
  surfaceRevision: 0,
  surfaceId: "surface_1",
  outputMode: "slide" as const,
  slideId: "slide_1",
  slideIndex: 0,
  animationStep: 0,
};

describe("CompanionAnnotationCanvas", () => {
  it("renders touch canvas and disables tools while read-only", () => {
    const html = renderToStaticMarkup(
      <CompanionAnnotationCanvas
        annotation={null}
        canWrite
        connected={false}
        lastAcknowledgement={null}
        output={output}
        sendCommand={vi.fn()}
        sendLaser={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="iPad 주석 입력"');
    expect(html).toContain('aria-label="iPad 주석 도구"');
    expect(html).toContain("disabled");
    expect(html).not.toContain("speakerNotes");
    expect(html).not.toContain("transcript");
  });

  it("removes drawing and toolbar surfaces in black mode", () => {
    const html = renderToStaticMarkup(
      <CompanionAnnotationCanvas
        annotation={null}
        canWrite
        connected
        lastAcknowledgement={null}
        output={{
          sessionId: "session_1",
          authorityEpochId: "epoch_1",
          outputRevision: 2,
          outputMode: "black",
          slideId: "slide_1",
          slideIndex: 0,
          animationStep: 0,
        }}
        sendCommand={vi.fn()}
        sendLaser={vi.fn()}
      />,
    );

    expect(html).toBe("");
  });

  it("limits screen-share pointer input to the source contain rect", () => {
    const html = renderToStaticMarkup(
      <CompanionAnnotationCanvas
        annotation={null}
        canWrite
        connected
        lastAcknowledgement={null}
        output={{
          ...output,
          outputMode: "screen-share",
          shareEpochId: "share_1",
        }}
        sendCommand={vi.fn()}
        sendLaser={vi.fn()}
        surfaceRect={{ height: 900, width: 1200, x: 200, y: 0 }}
      />,
    );

    expect(html).toContain('data-content-rect="contain"');
    expect(html).toContain("left:200px");
    expect(html).toContain("width:1200px");
    expect(html).toContain("height:900px");
  });
});
