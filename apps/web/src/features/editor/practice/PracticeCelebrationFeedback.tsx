import type { SlidePracticeReportRecord } from "@orbit/shared";

import greatStampUrl from "../../../assets/orbit-great-stamp.webp";
import thumbsUpMascotBlinkUrl from "../../../assets/orbit-mascot-thumbs-up-blink.webp";
import thumbsUpMascotUrl from "../../../assets/orbit-mascot-thumbs-up.webp";
import { practiceCelebrationOutcome } from "./practiceCelebration";

export function PracticeCelebrationFeedback(props: {
  animate: boolean;
  report: SlidePracticeReportRecord;
}) {
  const outcome = practiceCelebrationOutcome(props.report);
  if (!outcome.noFiller) return null;
  return (
    <aside
      aria-label="습관어 사용 없음"
      className={`editor-practice-celebration${props.animate ? " is-new" : ""}`}
      data-great={outcome.great || undefined}
    >
      <span className="editor-practice-celebration-kicker">오늘의 좋은 변화</span>
      <strong aria-live="polite">오늘은 ‘음…’ 같은 습관어가 없었어요</strong>
      <div aria-hidden="true" className="editor-practice-celebration-assets">
        <div className="editor-practice-celebration-mascot-flight">
          <span className="editor-practice-celebration-mascot-stage">
            <img
              alt=""
              className="editor-practice-celebration-mascot is-open"
              src={thumbsUpMascotUrl}
            />
            <img
              alt=""
              className="editor-practice-celebration-mascot is-blinking"
              src={thumbsUpMascotBlinkUrl}
            />
          </span>
        </div>
        {outcome.great ? (
          <img alt="" className="editor-practice-celebration-stamp" src={greatStampUrl} />
        ) : null}
      </div>
      {outcome.great ? <span className="editor-practice-great-copy">참 잘했어요 · GREAT</span> : null}
    </aside>
  );
}
