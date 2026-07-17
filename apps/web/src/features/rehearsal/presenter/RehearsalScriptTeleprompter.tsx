import { useEffect, useRef, type ReactNode } from "react";

import type { RehearsalScriptPrompterRowStatus } from "../panel/rehearsalScriptPrompter";

export type RehearsalScriptTeleprompterRow = {
  id: string;
  isFocusTarget: boolean;
  status: RehearsalScriptPrompterRowStatus;
  text: string;
};

export function getRehearsalTeleprompterScrollBehavior(
  previousFocusSentenceId: string | null | undefined,
  nextFocusSentenceId: string | null
): ScrollBehavior | null {
  if (!nextFocusSentenceId || previousFocusSentenceId === nextFocusSentenceId) {
    return null;
  }

  return previousFocusSentenceId === undefined ? "auto" : "smooth";
}

export function RehearsalScriptTeleprompter(props: {
  children?: ReactNode;
  focusScopeId: string;
  progressPercent: number;
  rows: readonly RehearsalScriptTeleprompterRow[];
}) {
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const focusRowRef = useRef<HTMLParagraphElement | null>(null);
  const previousFocusSentenceIdRef = useRef<string | null | undefined>(
    undefined
  );
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

  return (
    <section
      aria-label="발표 대본 프롬프터"
      className="rehearsal-teleprompter-band"
    >
      <div
        className="rehearsal-teleprompter-lyrics"
        data-auto-scroll="true"
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
