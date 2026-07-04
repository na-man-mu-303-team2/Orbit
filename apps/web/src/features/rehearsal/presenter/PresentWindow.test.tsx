import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { ReactNode } from "react";
import { forwardRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { p0AnimationDeck } from "./__fixtures__/animationDeck";
import {
  applyPresentWindowMessage,
  getSlideWindowScale,
  PresentWindow,
  PresentWindowContent,
  requestPresentWindowFullscreen
} from "./PresentWindow";
import { createPresenterSlideshowState } from "./presenterStateStore";
import {
  createPresenterSnapshotMessage,
  createPresenterStateMessage
} from "./presentationChannel";

vi.mock("react-konva", () => {
  function attrs(props: Record<string, unknown>) {
    return {
      "data-element-id":
        typeof props["data-element-id"] === "string"
          ? props["data-element-id"]
          : undefined,
      "data-testid":
        typeof props["data-testid"] === "string" ? props["data-testid"] : undefined
    };
  }

  type MockKonvaProps = { children?: ReactNode; [key: string]: any };

  const Group = forwardRef<HTMLDivElement, MockKonvaProps>(
    ({ children, ...props }, ref) => (
      <div ref={ref} {...attrs(props)}>
        {children}
      </div>
    )
  );
  const Stage = forwardRef<HTMLDivElement, MockKonvaProps>(
    ({ children, ...props }, ref) => (
      <div ref={ref} {...attrs(props)}>
        {children}
      </div>
    )
  );
  const Text = ({ text }: { text?: string }) => <span>{text}</span>;

  return {
    Arrow: () => <span data-konva-arrow="true" />,
    Circle: () => <span data-konva-circle="true" />,
    Group,
    Image: () => <span data-konva-image="true" />,
    Layer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Line: () => <span data-konva-line="true" />,
    Rect: (props: Record<string, unknown>) => <span {...attrs(props)} />,
    RegularPolygon: () => <span data-konva-polygon="true" />,
    Shape: () => <span data-konva-shape="true" />,
    Star: () => <span data-konva-star="true" />,
    Stage,
    Text
  };
});

const identity = {
  deckId: p0AnimationDeck.deckId,
  sessionId: "session-presenter-1"
};
const presentWindowSourcePath = fileURLToPath(
  new URL("./PresentWindow.tsx", import.meta.url)
);

describe("PresentWindow", () => {
  it("shows a Korean error state when opened without a presenter session", () => {
    const html = renderToStaticMarkup(<PresentWindow deckId={p0AnimationDeck.deckId} />);

    expect(html).toContain("발표자 화면에서 슬라이드 창을 열어주세요");
    expect(html).not.toContain("첫 문장입니다");
    expect(html).not.toContain("Partial transcript");
    expectNoAutoAdvancePresenterStatus(html);
  });

  it("renders a received sanitized snapshot without presenter-only content", () => {
    const snapshotMessage = createPresenterSnapshotMessage({
      deck: p0AnimationDeck,
      identity,
      sentAt: 10,
      state: {
        ...createPresenterSlideshowState(p0AnimationDeck),
        stepIndex: 1
      },
      triggerAnimationIds: ["anim_image_zoom_in"]
    });
    const html = renderToStaticMarkup(
      <PresentWindowContent
        identity={identity}
        snapshot={{
          deck: snapshotMessage.deck,
          state: snapshotMessage.state,
          triggerAnimationIds: snapshotMessage.triggerAnimationIds
        }}
      />
    );

    expect(html).toContain("data-deck-id=\"deck_p0_animation\"");
    expect(html).toContain("data-session-id=\"session-presenter-1\"");
    expect(html).toContain("data-step-index=\"1\"");
    expect(html).toContain("Slideshow Renderer");
    expect(html).toContain("전체화면");
    expect(html).not.toContain("첫 문장입니다");
    expect(html).not.toContain("두 번째 슬라이드입니다");
    expect(html).not.toContain("Partial transcript");
    expectNoAutoAdvancePresenterStatus(html);
  });

  it("does not import presenter-only auto advance status UI", () => {
    const source = fs.readFileSync(presentWindowSourcePath, "utf8");

    expect(source).not.toContain("AutoAdvanceStatus");
    expect(source).not.toContain("auto-advance-status");
  });

  it("applies full snapshots before state-only updates", () => {
    const initialState = createPresenterSlideshowState(p0AnimationDeck);
    const snapshotMessage = createPresenterSnapshotMessage({
      deck: p0AnimationDeck,
      identity,
      sentAt: 10,
      state: initialState,
      triggerAnimationIds: []
    });
    const stateMessage = createPresenterStateMessage({
      identity,
      sentAt: 20,
      state: {
        ...initialState,
        slideId: "slide_p0_2",
        slideIndex: 1,
        stepIndex: 0
      },
      triggerAnimationIds: ["anim_image_zoom_in"]
    });

    const snapshot = applyPresentWindowMessage(null, snapshotMessage);
    const updated = applyPresentWindowMessage(snapshot, stateMessage);

    expect(snapshot?.deck.deckId).toBe("deck_p0_animation");
    expect(updated?.state).toMatchObject({
      slideId: "slide_p0_2",
      slideIndex: 1,
      stepIndex: 0
    });
    expect(updated?.triggerAnimationIds).toEqual(["anim_image_zoom_in"]);
  });

  it("ignores state-only updates before a full snapshot", () => {
    const message = createPresenterStateMessage({
      identity,
      sentAt: 20,
      state: createPresenterSlideshowState(p0AnimationDeck),
      triggerAnimationIds: []
    });

    expect(applyPresentWindowMessage(null, message)).toBeNull();
  });

  it("calculates the largest viewport scale that preserves the deck aspect", () => {
    expect(getSlideWindowScale(p0AnimationDeck, { height: 540, width: 960 })).toBe(0.5);
    expect(getSlideWindowScale(p0AnimationDeck, { height: 1080, width: 960 })).toBe(0.5);
  });

  it("renders slide-window scale from the current viewport", () => {
    const snapshotMessage = createPresenterSnapshotMessage({
      deck: p0AnimationDeck,
      identity,
      sentAt: 10,
      state: createPresenterSlideshowState(p0AnimationDeck),
      triggerAnimationIds: []
    });
    const html = renderToStaticMarkup(
      <PresentWindowContent
        identity={identity}
        snapshot={{
          deck: snapshotMessage.deck,
          state: snapshotMessage.state,
          triggerAnimationIds: []
        }}
        viewport={{ height: 540, width: 960 }}
      />
    );

    expect(html).toContain("data-scale=\"0.5\"");
  });

  it("hides the fullscreen CTA once the slide window is fullscreen", () => {
    const snapshotMessage = createPresenterSnapshotMessage({
      deck: p0AnimationDeck,
      identity,
      sentAt: 10,
      state: createPresenterSlideshowState(p0AnimationDeck),
      triggerAnimationIds: []
    });
    const html = renderToStaticMarkup(
      <PresentWindowContent
        identity={identity}
        isFullscreen={true}
        snapshot={{
          deck: snapshotMessage.deck,
          state: snapshotMessage.state,
          triggerAnimationIds: []
        }}
      />
    );

    expect(html).not.toContain("전체화면");
    expect(html).not.toContain("present-window-fullscreen");
  });

  it("keeps the fullscreen CTA visible before fullscreen is active", () => {
    const snapshotMessage = createPresenterSnapshotMessage({
      deck: p0AnimationDeck,
      identity,
      sentAt: 10,
      state: createPresenterSlideshowState(p0AnimationDeck),
      triggerAnimationIds: []
    });
    const html = renderToStaticMarkup(
      <PresentWindowContent
        identity={identity}
        isFullscreen={false}
        snapshot={{
          deck: snapshotMessage.deck,
          state: snapshotMessage.state,
          triggerAnimationIds: []
        }}
      />
    );

    expect(html).toContain("전체화면");
  });

  it("handles blocked fullscreen requests without leaking a rejected promise", async () => {
    const requestFullscreen = vi.fn().mockRejectedValue(new Error("blocked"));

    await expect(
      requestPresentWindowFullscreen({
        requestFullscreen
      } as unknown as HTMLElement)
    ).resolves.toBe(false);
    expect(requestFullscreen).toHaveBeenCalled();
  });
});

function expectNoAutoAdvancePresenterStatus(html: string) {
  expect(html).not.toContain("자동 전환까지");
  expect(html).not.toContain("빌드 2개 남음");
  expect(html).not.toContain("발표 종료 준비됨");
  expect(html).not.toContain("수동으로 넘겨주세요");
  expect(html).not.toContain("auto-advance-status");
}
