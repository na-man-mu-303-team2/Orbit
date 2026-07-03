import {
  createSlidePlaybackState,
  createSlideRuntimeAdapter,
  type SlidePlaybackState,
  type SlideRuntimeSnapshot,
  type SlideRuntimeTrigger
} from "@orbit/editor-core";
import type { Slide } from "@orbit/shared";

export type SlideshowRuntimeSnapshot = SlideRuntimeSnapshot;

export type SlideshowAdvanceResult = {
  playbackState: SlidePlaybackState;
  slideIndex: number;
};

export type PresenterSlideshowRuntime = {
  advanceOnClick: (args: {
    currentSlideIndex: number;
    playbackState: SlidePlaybackState;
    slideCount: number;
  }) => SlideshowAdvanceResult;
  createPlaybackState: () => SlidePlaybackState;
  createSnapshot: (playbackState: SlidePlaybackState) => SlideshowRuntimeSnapshot;
  executeTrigger: (
    playbackState: SlidePlaybackState,
    trigger: SlideRuntimeTrigger
  ) => ReturnType<ReturnType<typeof createSlideRuntimeAdapter>["executeTrigger"]>;
};

export function createPresenterSlideshowRuntime(
  slide: Slide
): PresenterSlideshowRuntime {
  const runtimeAdapter = createSlideRuntimeAdapter(slide);

  return {
    advanceOnClick: (args) => {
      const nextRuntime = runtimeAdapter.advanceOnClick(args.playbackState);

      if (nextRuntime) {
        return {
          playbackState: nextRuntime.state,
          slideIndex: args.currentSlideIndex
        };
      }

      if (args.currentSlideIndex < Math.max(0, args.slideCount - 1)) {
        const playbackState = createSlidePlaybackState();

        return {
          playbackState,
          slideIndex: args.currentSlideIndex + 1
        };
      }

      return {
        playbackState: args.playbackState,
        slideIndex: args.currentSlideIndex
      };
    },
    createPlaybackState: createSlidePlaybackState,
    createSnapshot: (playbackState) => runtimeAdapter.getSnapshot(playbackState),
    executeTrigger: (playbackState, trigger) =>
      runtimeAdapter.executeTrigger(playbackState, trigger)
  };
}
