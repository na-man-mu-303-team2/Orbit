import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { p0AnimationDeck } from "./__fixtures__/animationDeck";
import {
  applyPresenterRemoteMessage,
  getPresenterRemoteKeywordRows,
  splitPresenterRemoteNotes,
  PresenterRemoteWindow,
} from "./PresenterRemoteWindow";
import { createPresenterSlideshowState } from "./presenterStateStore";
import { createPresenterStateMessage } from "./presentationChannel";

vi.mock("./SlideshowRenderer", () => ({
  SlideshowRenderer: (props: { slideId: string }) => (
    <div data-slide-id={props.slideId}>Slide preview</div>
  ),
}));

const identity = {
  deckId: p0AnimationDeck.deckId,
  sessionId: "session-presenter-1",
};

describe("PresenterRemoteWindow", () => {
  it("renders presenter-only notes and remote controls", () => {
    const html = renderToStaticMarkup(
      <PresenterRemoteWindow
        deck={p0AnimationDeck}
        identity={identity}
        initialState={createPresenterSlideshowState(p0AnimationDeck)}
      />,
    );

    expect(html).toContain("발표자 제어");
    expect(html).toContain("대본");
    expect(html).toContain("현재 슬라이드");
    expect(html).toContain("다음 슬라이드");
    expect(html).toContain("핵심 키워드");
    expect(html).toContain("현재 큐");
    expect(html).toContain("첫 문장입니다");
    expect(html).toContain("이전");
    expect(html).toContain("다음");
    expect(html).toContain("팝업 가림");
    expect(html).toContain("발표 종료");
    expect(html).not.toContain("Partial transcript");
    expect(html).not.toContain("rawAudio");
  });

  it("splits presenter notes into cue rows", () => {
    expect(
      splitPresenterRemoteNotes("첫 문장입니다. 마지막 문장입니다."),
    ).toEqual(["첫 문장입니다", "마지막 문장입니다"]);
  });

  it("derives keyword cue status from the current slide step", () => {
    const slide = {
      ...p0AnimationDeck.slides[0]!,
      keywords: [
        {
          keywordId: "keyword_one",
          text: "첫 키워드",
          synonyms: [],
          abbreviations: [],
          required: true,
        },
        {
          keywordId: "keyword_two",
          text: "두 번째 키워드",
          synonyms: [],
          abbreviations: [],
          required: true,
        },
      ],
    };

    expect(getPresenterRemoteKeywordRows(slide, 1)).toEqual([
      {
        keywordId: "keyword_one",
        status: "done",
        text: "첫 키워드",
      },
      {
        keywordId: "keyword_two",
        status: "active",
        text: "두 번째 키워드",
      },
    ]);
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
          stepIndex: 0,
        },
        triggerAnimationIds: [],
      }),
    );

    expect(next).toMatchObject({
      slideId: "slide_p0_2",
      slideIndex: 1,
      stepIndex: 0,
    });
  });
});
