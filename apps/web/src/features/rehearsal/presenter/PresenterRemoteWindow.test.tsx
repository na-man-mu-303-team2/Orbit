import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { p0AnimationDeck } from "./__fixtures__/animationDeck";
import {
  applyPresenterRemoteMessage,
  PresenterRemoteWindow
} from "./PresenterRemoteWindow";
import { createPresenterSlideshowState } from "./presenterStateStore";
import { createPresenterStateMessage } from "./presentationChannel";

const identity = {
  deckId: p0AnimationDeck.deckId,
  sessionId: "session-presenter-1"
};

describe("PresenterRemoteWindow", () => {
  it("renders presenter-only notes and remote controls", () => {
    const html = renderToStaticMarkup(
      <PresenterRemoteWindow
        deck={p0AnimationDeck}
        identity={identity}
        initialState={createPresenterSlideshowState(p0AnimationDeck)}
      />
    );

    expect(html).toContain("발표자 제어");
    expect(html).toContain("Speaker notes");
    expect(html).toContain("첫 문장입니다");
    expect(html).toContain("이전");
    expect(html).toContain("다음");
    expect(html).not.toContain("Partial transcript");
    expect(html).not.toContain("rawAudio");
  });

  it("applies presenter state messages without replacing presenter-only deck data", () => {
    const initialState = createPresenterSlideshowState(p0AnimationDeck);
    const next = applyPresenterRemoteMessage(
      initialState,
      createPresenterStateMessage({
        identity,
        sentAt: 20,
        state: {
          ...initialState,
          slideId: "slide_p0_2",
          slideIndex: 1,
          stepIndex: 0
        },
        triggerAnimationIds: []
      })
    );

    expect(next).toMatchObject({
      slideId: "slide_p0_2",
      slideIndex: 1,
      stepIndex: 0
    });
  });
});
