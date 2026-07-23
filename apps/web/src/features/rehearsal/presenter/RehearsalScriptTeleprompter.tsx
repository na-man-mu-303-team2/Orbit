import {
  useEffect,
  useRef,
  type ReactNode,
  type WheelEvent as ReactWheelEvent
} from "react";

import type { RehearsalScriptPrompterRowStatus } from "../panel/rehearsalScriptPrompter";

export type RehearsalScriptTeleprompterRow = {
  id: string;
  isFocusTarget: boolean;
  status: RehearsalScriptPrompterRowStatus;
  text: string;
};

export type RehearsalTeleprompterWheelDirection = "next" | "previous";

const wheelNavigationThresholdPx = 24;
const wheelGestureResetMs = 180;

export function getRehearsalTeleprompterScrollBehavior(
  previousFocusSentenceId: string | null | undefined,
  nextFocusSentenceId: string | null
): ScrollBehavior | null {
  if (!nextFocusSentenceId || previousFocusSentenceId === nextFocusSentenceId) {
    return null;
  }

  return previousFocusSentenceId === undefined ? "auto" : "smooth";
}

export function getRehearsalTeleprompterWheelDirection(
  accumulatedDeltaY: number
): RehearsalTeleprompterWheelDirection | null {
  if (Math.abs(accumulatedDeltaY) < wheelNavigationThresholdPx) return null;
  return accumulatedDeltaY > 0 ? "next" : "previous";
}

export function normalizeRehearsalTeleprompterWheelDelta(
  deltaY: number,
  deltaMode: number
) {
  if (deltaMode === 1) return deltaY * 16;
  if (deltaMode === 2) return deltaY * 120;
  return deltaY;
}

export function RehearsalScriptTeleprompter(props: {
  children?: ReactNode;
  focusScopeId: string;
  onWheelNavigate?: (
    direction: RehearsalTeleprompterWheelDirection
  ) => void;
  progressPercent: number;
  rows: readonly RehearsalScriptTeleprompterRow[];
}) {
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const focusRowRef = useRef<HTMLParagraphElement | null>(null);
  const previousFocusSentenceIdRef = useRef<string | null | undefined>(
    undefined
  );
  const wheelGestureRef = useRef({ deltaY: 0, navigated: false });
  const wheelResetTimerRef = useRef<number | null>(null);
  const focusSentenceId = props.rows.find((row) => row.isFocusTarget)?.id ?? null;
  const focusKey = focusSentenceId
    ? `${props.focusScopeId}:${focusSentenceId}`
    : null;

  useEffect(() => {
    const scrollBehavior = getRehearsalTeleprompterScrollBehavior(
      previousFocusSentenceIdRef.current,
      focusKey
    );
    previousFocusSentenceIdRef.current = focusKey;
    if (!scrollBehavior) return;

    const viewport = scrollViewportRef.current;
    const focusRow = focusRowRef.current;
    if (!viewport || !focusRow) return;

    const viewportBounds = viewport.getBoundingClientRect();
    const focusRowBounds = focusRow.getBoundingClientRect();
    viewport.scrollTo({
      behavior: scrollBehavior,
      top: Math.max(
        0,
        viewport.scrollTop +
          focusRowBounds.top -
          viewportBounds.top -
          (viewportBounds.height - focusRowBounds.height) / 2
      )
    });
  }, [focusKey]);

  useEffect(() => {
    wheelGestureRef.current = { deltaY: 0, navigated: false };
    return () => {
      if (wheelResetTimerRef.current !== null) {
        window.clearTimeout(wheelResetTimerRef.current);
      }
    };
  }, [props.focusScopeId]);

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!props.onWheelNavigate) return;
    event.preventDefault();

    if (wheelResetTimerRef.current !== null) {
      window.clearTimeout(wheelResetTimerRef.current);
    }
    wheelResetTimerRef.current = window.setTimeout(() => {
      wheelGestureRef.current = { deltaY: 0, navigated: false };
      wheelResetTimerRef.current = null;
    }, wheelGestureResetMs);

    if (wheelGestureRef.current.navigated) return;
    wheelGestureRef.current.deltaY += normalizeRehearsalTeleprompterWheelDelta(
      event.deltaY,
      event.deltaMode
    );
    const direction = getRehearsalTeleprompterWheelDirection(
      wheelGestureRef.current.deltaY
    );
    if (!direction) return;

    wheelGestureRef.current = { deltaY: 0, navigated: true };
    props.onWheelNavigate(direction);
  }

  return (
    <section
      aria-label="발표 대본 프롬프터"
      className="rehearsal-teleprompter-band"
    >
      <div
        className="rehearsal-teleprompter-lyrics"
        data-auto-scroll="true"
        data-wheel-navigation={props.onWheelNavigate ? "sentence" : undefined}
        onWheel={handleWheel}
        ref={scrollViewportRef}
        tabIndex={0}
      >
        {props.rows.map((row) => (
          <p
            aria-current={row.isFocusTarget ? "true" : undefined}
            aria-live={row.isFocusTarget ? "polite" : undefined}
            className={`rehearsal-teleprompter-line rehearsal-teleprompter-line-${row.status} ${
              row.isFocusTarget ? "rehearsal-teleprompter-current" : ""
            }`.trim()}
            key={row.id}
            ref={row.isFocusTarget ? focusRowRef : undefined}
          >
            {row.text}
          </p>
        ))}
      </div>
      <output
        aria-label="원문 기준 실시간 진행률"
        className="rehearsal-teleprompter-progress"
      >
        원문 진행 {props.progressPercent}%
      </output>
      {props.children}
    </section>
  );
}
