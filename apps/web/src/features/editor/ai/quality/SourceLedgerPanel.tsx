import type { Slide } from "@orbit/shared";
import { ExternalLink } from "lucide-react";

export function SourceLedgerPanel(props: { slide: Slide | null }) {
  const sources = deduplicateSourceLedger(props.slide?.aiNotes?.sourceLedger ?? []);

  return (
    <section className="suggestion-card source-ledger-card" data-testid="source-ledger-panel">
      <strong>현재 슬라이드 출처</strong>
      <div className="source-ledger-list">
        {sources.length > 0 ? (
          sources.map((source) => (
            <div className="source-ledger-item" key={sourceKey(source)}>
              <div className="source-ledger-heading">
                <span className={`source-authority source-authority-${source.authority ?? "unknown"}`}>
                  {sourceAuthorityLabel(source.authority)}
                </span>
                <strong>{source.title ?? source.source}</strong>
              </div>
              <small>{source.claim}</small>
              {source.url ? (
                <a href={source.url} rel="noreferrer" target="_blank">
                  <ExternalLink aria-hidden="true" size={13} />
                  원문 열기
                </a>
              ) : null}
            </div>
          ))
        ) : (
          <div className="source-ledger-empty">이 슬라이드에 기록된 출처가 없습니다.</div>
        )}
      </div>
    </section>
  );
}

type SourceLedgerItem = NonNullable<Slide["aiNotes"]>["sourceLedger"] extends
  | Array<infer T>
  | undefined
  ? T
  : never;

function deduplicateSourceLedger(sources: SourceLedgerItem[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = sourceKey(source);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceKey(source: SourceLedgerItem) {
  return source.sourceId ?? source.url ?? source.source;
}

function sourceAuthorityLabel(authority: SourceLedgerItem["authority"]) {
  if (authority === "official") return "공식";
  if (authority === "independent") return "독립";
  return "출처";
}
