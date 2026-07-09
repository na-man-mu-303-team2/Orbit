import type { SemanticCueDebugEvent } from "../speech/semanticCueDebugEvents";

export const semanticCueDebugPanelQueryKey = "semanticCueDebug";

export function SemanticCueDebugPanel(props: {
  events: readonly SemanticCueDebugEvent[];
  onCopyJson?: (json: string) => void;
  onExportJson?: (json: string) => void;
}) {
  const latest = props.events.at(-1) ?? null;
  const json = serializeSemanticCueDebugEvents(props.events);

  return (
    <aside
      className="semantic-speech-debug-panel semantic-cue-debug-panel"
      aria-label="Semantic cue NLI debug panel"
    >
      <header>
        <strong>Semantic Cue NLI</strong>
        <span>{props.events.length} events</span>
      </header>

      <div className="semantic-cue-debug-actions">
        <button type="button" onClick={() => props.onCopyJson?.(json)}>
          Copy JSON
        </button>
        <button type="button" onClick={() => props.onExportJson?.(json)}>
          Export JSON
        </button>
      </div>

      {latest ? (
        <>
          <section>
            <span>Decision</span>
            <p>
              {latest.decision.label} · score{" "}
              {latest.decision.finalScore.toFixed(3)} ·{" "}
              {latest.decision.reasonCodes.join(", ")}
            </p>
          </section>

          <section>
            <span>NLI</span>
            <p>
              {latest.nli
                ? `${latest.nli.provider} · ${latest.nli.latencyMs}ms · ${latest.nli.hypotheses.length} hypotheses`
                : "not run"}
            </p>
          </section>

          <ol>
            {latest.candidates.map((candidate) => (
              <li key={candidate.cueId}>
                <div>
                  <strong>{candidate.cueId}</strong>
                  <span>{candidate.selectedForNli ? "NLI" : "skip"}</span>
                </div>
                <p>{candidate.meaning}</p>
                <small>
                  lexical {formatOptionalScore(candidate.lexicalScore)} · concept{" "}
                  {formatOptionalScore(candidate.conceptCoverage)}
                  {candidate.nliSkippedReason
                    ? ` · ${candidate.nliSkippedReason}`
                    : ""}
                </small>
              </li>
            ))}
          </ol>

          <section>
            <span>Action gate</span>
            <p>
              {latest.actionGate?.allowed ? "allowed" : "blocked"} ·{" "}
              {latest.actionGate?.blockedReasons.join(", ") || "none"}
            </p>
          </section>
        </>
      ) : (
        <section>
          <span>Decision</span>
          <p>아직 semantic cue NLI 이벤트가 없습니다.</p>
        </section>
      )}
    </aside>
  );
}

export function shouldShowSemanticCueDebugPanel(options: {
  flagEnabled: boolean;
  locationSearch?: string;
}) {
  if (options.flagEnabled) {
    return true;
  }

  const search = options.locationSearch ?? "";
  if (!search) {
    return false;
  }

  return new URLSearchParams(search).get(semanticCueDebugPanelQueryKey) === "1";
}

export function serializeSemanticCueDebugEvents(
  events: readonly SemanticCueDebugEvent[]
) {
  return JSON.stringify({ events }, null, 2);
}

function formatOptionalScore(score: number | undefined) {
  return typeof score === "number" ? score.toFixed(3) : "n/a";
}
