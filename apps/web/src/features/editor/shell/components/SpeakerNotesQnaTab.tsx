import type { Deck, Slide } from "@orbit/shared";

import { SlideQuestionGuidePanel } from "../../practice/SlideQuestionGuidePanel";

export function SpeakerNotesQnaTab(props: {
  deck: Deck;
  flushPendingSaves: () => Promise<void>;
  projectId: string;
  slide: Slide | null;
}) {
  return (
    <div
      aria-labelledby="speaker-notes-qna-tab"
      className="speaker-notes-feature-panel speaker-notes-qna-panel"
      id="speaker-notes-qna-panel"
      role="tabpanel"
    >
      <SlideQuestionGuidePanel
        deck={props.deck}
        flushPendingSaves={props.flushPendingSaves}
        projectId={props.projectId}
        slide={props.slide}
      />
    </div>
  );
}
