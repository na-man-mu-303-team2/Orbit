import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { SemanticUtteranceDebugState } from "../speech/semanticSpeechDebug";

export const semanticSpeechDebugPanelStorageKey =
  "orbit.semanticSpeech.debugPanel";
const semanticSpeechDebugPanelPositionStorageKey =
  "orbit.semanticSpeech.debugPanel.position";

export type ContextCoverageDebugRow = {
  itemId: string;
  label: string;
  matched: boolean;
  method: string;
  semanticSimilarity: number;
  lexicalOverlap: number;
  strength: number;
};

type DebugPanelPosition = {
  x: number;
  y: number;
};

export function SemanticSpeechDebugPanel(props: {
  contextCoverageDebugRows?: readonly ContextCoverageDebugRow[];
  semanticMatchingEnabled: boolean;
  state: SemanticUtteranceDebugState;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [position, setPosition] = useState<DebugPanelPosition | null>(
    readStoredDebugPanelPosition,
  );
  const [isDragging, setIsDragging] = useState(false);
  const transcript = props.state.transcript.trim();
  const decision = props.state.decision;
  const acceptedSentenceId = decision?.acceptedMatch?.sentenceId ?? null;
  const acceptedRank = decision?.acceptedMatch?.rank ?? null;
  const outcomeLabel =
    decision?.outcome ?? (decision ? "rejected" : "pending");
  const decisionDisposition = decision
    ? decision.accepted
      ? "accepted"
      : "rejected"
    : "no-decision";
  const panelStyle: CSSProperties | undefined = position
    ? {
        bottom: "auto",
        left: position.x,
        right: "auto",
        top: position.y,
      }
    : undefined;

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const drag = dragRef.current;
      const panel = panelRef.current;
      if (!drag || !panel) {
        return;
      }

      event.preventDefault();
      const rect = panel.getBoundingClientRect();
      const nextPosition = clampDebugPanelPosition({
        x: event.clientX - drag.offsetX,
        y: event.clientY - drag.offsetY,
        width: rect.width,
        height: rect.height,
      });
      setPosition(nextPosition);
    }

    function handlePointerUp() {
      if (!dragRef.current) {
        return;
      }

      dragRef.current = null;
      setIsDragging(false);
      setPosition((current) => {
        storeDebugPanelPosition(current);
        return current;
      });
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  function handleDragStart(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || isInteractiveDragTarget(event.target)) {
      return;
    }

    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    const rect = panel.getBoundingClientRect();
    dragRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    setPosition({ x: rect.left, y: rect.top });
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function resetPosition() {
    setPosition(null);
    storeDebugPanelPosition(null);
  }

  return (
    <aside
      ref={panelRef}
      className={[
        "semantic-speech-debug-panel",
        isDragging ? "semantic-speech-debug-panel-dragging" : "",
      ].filter(Boolean).join(" ")}
      style={panelStyle}
      aria-label="Semantic STT debug panel"
    >
      <header
        className="semantic-speech-debug-panel-handle"
        onPointerDown={handleDragStart}
        title="드래그해서 위치 이동"
      >
        <strong>Semantic STT</strong>
        <div>
          <span>{props.state.status}</span>
          {position ? (
            <button type="button" onClick={resetPosition}>
              위치 초기화
            </button>
          ) : null}
        </div>
      </header>

      <section>
        <span>방금 인식</span>
        <p>{transcript || "아직 final STT 문장이 없습니다."}</p>
      </section>

      {props.state.error && (
        <p className="semantic-speech-debug-error">{props.state.error}</p>
      )}

      <section>
        <span>Decision</span>
        <p>
          {outcomeLabel} · {decisionDisposition} ·{" "}
          {decision?.reason ?? "no-decision"}
          {decision ? (
            <>
              {" "}
              · threshold {decision.scoreThreshold.toFixed(3)} · margin{" "}
              {decision.ambiguousMargin.toFixed(3)}
            </>
          ) : null}
        </p>
      </section>

      <ol>
        {props.state.topMatches.map((match) => {
          const isApplied =
            props.semanticMatchingEnabled &&
            acceptedSentenceId === match.sentenceId &&
            acceptedRank === match.rank &&
            decision?.accepted === true &&
            props.state.status === "ready";
          return (
            <li key={`${match.rank}-${match.sentenceId}`}>
              <div>
                <strong>
                  #{match.rank} · {match.similarity.toFixed(3)} · 문장{" "}
                  {match.sentenceIndex + 1}
                </strong>
                <span>{isApplied ? "적용" : "참고"}</span>
              </div>
              <p>{match.text}</p>
              {match.covered && <small>covered</small>}
            </li>
          );
        })}
      </ol>

      {props.contextCoverageDebugRows?.length ? (
        <section className="semantic-speech-debug-context">
          <span>Context item</span>
          <ol>
            {props.contextCoverageDebugRows.slice(0, 6).map((row) => (
              <li key={row.itemId}>
                <div>
                  <strong>{row.label}</strong>
                  <span>{row.matched ? "통과" : "대기"}</span>
                </div>
                <p>
                  {row.method} · sem {row.semanticSimilarity.toFixed(3)} · lex{" "}
                  {row.lexicalOverlap.toFixed(2)} · str{" "}
                  {row.strength.toFixed(3)}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </aside>
  );
}

export function shouldShowSemanticSpeechDebugPanel(options: {
  isDevelopment: boolean;
  storage?: Pick<Storage, "getItem"> | null;
}) {
  if (options.isDevelopment) {
    return true;
  }

  try {
    return options.storage?.getItem(semanticSpeechDebugPanelStorageKey) === "1";
  } catch {
    return false;
  }
}

function readStoredDebugPanelPosition(): DebugPanelPosition | null {
  try {
    const raw = window.localStorage.getItem(
      semanticSpeechDebugPanelPositionStorageKey,
    );
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<DebugPanelPosition>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") {
      return null;
    }
    return clampDebugPanelPosition({
      x: parsed.x,
      y: parsed.y,
      width: 360,
      height: 240,
    });
  } catch {
    return null;
  }
}

function storeDebugPanelPosition(position: DebugPanelPosition | null) {
  try {
    if (!position) {
      window.localStorage.removeItem(semanticSpeechDebugPanelPositionStorageKey);
      return;
    }
    window.localStorage.setItem(
      semanticSpeechDebugPanelPositionStorageKey,
      JSON.stringify(position),
    );
  } catch {
    // Position persistence is best-effort only.
  }
}

function clampDebugPanelPosition(options: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const margin = 8;
  const viewportWidth = window.innerWidth || options.width;
  const viewportHeight = window.innerHeight || options.height;
  return {
    x: Math.min(
      Math.max(options.x, margin),
      Math.max(margin, viewportWidth - options.width - margin),
    ),
    y: Math.min(
      Math.max(options.y, margin),
      Math.max(margin, viewportHeight - options.height - margin),
    ),
  };
}

function isInteractiveDragTarget(target: EventTarget) {
  return target instanceof Element && Boolean(target.closest("button, a, input, textarea, select"));
}
