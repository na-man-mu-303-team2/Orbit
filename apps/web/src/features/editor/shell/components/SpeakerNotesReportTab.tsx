import type { Deck, Slide } from "@orbit/shared";

import { SlidePracticeHistoryPanel } from "../../practice/SlidePracticeHistoryPanel";

export function SpeakerNotesReportTab(props: {
  deck: Deck;
  projectId: string;
  refreshToken: number;
  slide: Slide | null;
}) {
  return (
    <div
      aria-labelledby="speaker-notes-report-tab"
      className="speaker-notes-feature-panel speaker-notes-report-panel"
      id="speaker-notes-report-panel"
      role="tabpanel"
    >
      <SlidePracticeHistoryPanel
        deck={props.deck}
        projectId={props.projectId}
        refreshToken={props.refreshToken}
        slide={props.slide}
      />
    </div>
  );
}
