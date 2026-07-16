import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { p0AnimationDeck } from "./__fixtures__/animationDeck";
import {
  AudienceOutputRenderer,
  attachAudienceVideoStream,
} from "./AudienceOutputRenderer";
import { createPresenterSlideshowState } from "./presenterStateStore";

vi.mock("./SlideshowRenderer", () => ({
  SlideshowRenderer: () => <div>Slideshow Renderer</div>,
}));

describe("AudienceOutputRenderer", () => {
  it("keeps the existing slide renderer for slide output", () => {
    const html = renderToStaticMarkup(
      <AudienceOutputRenderer
        deck={p0AnimationDeck}
        scale={0.5}
        state={createPresenterSlideshowState(p0AnimationDeck)}
        triggerAnimationIds={[]}
      />,
    );

    expect(html).toContain("Slideshow Renderer");
    expect(html).not.toContain("첫 문장입니다");
  });

  it("renders only a black surface and small logo in black mode", () => {
    const html = renderToStaticMarkup(
      <AudienceOutputRenderer
        deck={p0AnimationDeck}
        scale={1}
        state={{
          ...createPresenterSlideshowState(p0AnimationDeck),
          audienceOutputMode: "black",
        }}
        triggerAnimationIds={[]}
      />,
    );

    expect(html).toContain("audience-output-black");
    expect(html).toContain('alt="ORBIT"');
    expect(html).not.toContain("Slideshow Renderer");
    expect(html).not.toContain("첫 문장입니다");
  });

  it("shows a stable connecting surface until the stream arrives", () => {
    const html = renderToStaticMarkup(
      <AudienceOutputRenderer
        deck={p0AnimationDeck}
        scale={1}
        state={{
          ...createPresenterSlideshowState(p0AnimationDeck),
          audienceOutputMode: "screen-share",
        }}
        triggerAnimationIds={[]}
      />,
    );

    expect(html).toContain("공유 화면을 연결하는 중입니다");
    expect(html).not.toContain("Slideshow Renderer");
    expect(html).not.toContain("첫 문장입니다");
  });

  it("renders a muted inline video without capture metadata", () => {
    const html = renderToStaticMarkup(
      <AudienceOutputRenderer
        deck={p0AnimationDeck}
        scale={1}
        state={{
          ...createPresenterSlideshowState(p0AnimationDeck),
          audienceOutputMode: "screen-share",
        }}
        stream={{} as MediaStream}
        triggerAnimationIds={[]}
      />,
    );

    expect(html).toContain("<video");
    expect(html).toContain("muted");
    expect(html).toContain("playsInline");
    expect(html).not.toContain("speakerNotes");
    expect(html).not.toContain("transcript");
    expect(html).not.toContain("rawAudio");
  });

  it("clears srcObject during video cleanup", () => {
    const stream = {} as MediaStream;
    const video = {
      muted: false,
      play: vi.fn().mockResolvedValue(undefined),
      srcObject: null as MediaProvider | null,
    };

    const cleanup = attachAudienceVideoStream(video, stream);
    expect(video.srcObject).toBe(stream);
    expect(video.muted).toBe(true);
    cleanup();
    expect(video.srcObject).toBeNull();
  });
});
