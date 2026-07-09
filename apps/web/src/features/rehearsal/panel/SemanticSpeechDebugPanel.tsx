import type { SemanticUtteranceDebugState } from "../speech/semanticSpeechDebug";

export const semanticSpeechDebugPanelStorageKey =
  "orbit.semanticSpeech.debugPanel";

export function SemanticSpeechDebugPanel(props: {
  semanticMatchingEnabled: boolean;
  state: SemanticUtteranceDebugState;
}) {
  const transcript = props.state.transcript.trim();

  return (
    <aside
      className="semantic-speech-debug-panel"
      aria-label="Semantic STT debug panel"
    >
      <header>
        <strong>Semantic STT</strong>
        <span>{props.state.status}</span>
      </header>

      <section>
        <span>방금 인식</span>
        <p>{transcript || "아직 final STT 문장이 없습니다."}</p>
      </section>

      {props.state.error && (
        <p className="semantic-speech-debug-error">{props.state.error}</p>
      )}

      <ol>
        {props.state.topMatches.map((match) => {
          const isApplied =
            props.semanticMatchingEnabled &&
            match.rank === 1 &&
            !match.covered &&
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
