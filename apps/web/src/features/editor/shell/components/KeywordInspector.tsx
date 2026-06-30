import type { Keyword } from "@orbit/shared";

import { IdBadge } from "./EditorIdBadge";

interface KeywordMatch {
  end: number;
  keyword: Keyword;
  start: number;
  value: string;
}

export function KeywordHighlightedNotes(props: {
  keywords: Keyword[];
  notes: string;
  selectedKeywordId: string | null;
  showIds: boolean;
  onSelectKeyword: (keywordId: string) => void;
}) {
  const { keywords, notes, selectedKeywordId, showIds, onSelectKeyword } = props;

  if (!notes) {
    return <p className="script-copy">발표 메모가 아직 없습니다.</p>;
  }

  const matches = findKeywordMatches(notes, keywords);

  if (matches.length === 0) {
    return <p className="script-copy">{notes}</p>;
  }

  const parts: Array<string | KeywordMatch> = [];
  let cursor = 0;

  matches.forEach((match) => {
    if (cursor < match.start) {
      parts.push(notes.slice(cursor, match.start));
    }
    parts.push(match);
    cursor = match.end;
  });

  if (cursor < notes.length) {
    parts.push(notes.slice(cursor));
  }

  return (
    <p className="script-copy">
      {parts.map((part, index) => {
        if (typeof part === "string") {
          return part;
        }

        const isSelected = part.keyword.keywordId === selectedKeywordId;

        return (
          <button
            className={`keyword-mark ${isSelected ? "selected" : ""}`}
            key={`${part.keyword.keywordId}-${part.start}-${index}`}
            type="button"
            onClick={() => onSelectKeyword(part.keyword.keywordId)}
          >
            <strong>{part.value}</strong>
            {showIds ? <IdBadge id={part.keyword.keywordId} /> : null}
          </button>
        );
      })}
    </p>
  );
}

export function KeywordList(props: {
  keywords: Keyword[];
  selectedKeywordId: string | null;
  showIds: boolean;
  onSelectKeyword: (keywordId: string) => void;
}) {
  const { keywords, selectedKeywordId, showIds, onSelectKeyword } = props;

  return (
    <div className="keyword-strip">
      {keywords.length > 0 ? (
        keywords.map((keyword) => (
          <button
            className={`keyword-chip ${
              keyword.keywordId === selectedKeywordId ? "selected" : ""
            }`}
            key={keyword.keywordId}
            type="button"
            onClick={() => onSelectKeyword(keyword.keywordId)}
          >
            <span>{keyword.text}</span>
            {showIds ? <IdBadge id={keyword.keywordId} /> : null}
          </button>
        ))
      ) : (
        <span className="keyword-empty">등록된 키워드 없음</span>
      )}
    </div>
  );
}

export function KeywordDetail(props: { keyword: Keyword; showIds: boolean }) {
  const { keyword, showIds } = props;

  return (
    <section className="keyword-detail-card">
      <div className="keyword-detail-header">
        <strong>{keyword.text}</strong>
        {showIds ? <IdBadge id={keyword.keywordId} /> : null}
      </div>
      <KeywordAliases label="유의어" values={keyword.synonyms} />
      <KeywordAliases label="약어" values={keyword.abbreviations} />
    </section>
  );
}

export function KeywordSummary(props: { keyword: Keyword; showIds: boolean }) {
  const { keyword, showIds } = props;

  return (
    <div className="stack-item">
      {showIds ? <IdBadge id={keyword.keywordId} /> : null}
      <strong>{keyword.text}</strong>
      <small>
        synonyms {keyword.synonyms.join(", ") || "none"} · abbreviations{" "}
        {keyword.abbreviations.join(", ") || "none"}
      </small>
    </div>
  );
}

function KeywordAliases(props: { label: string; values: string[] }) {
  return (
    <div className="keyword-alias-row">
      <span>{props.label}</span>
      <div>
        {props.values.length > 0 ? (
          props.values.map((value) => (
            <small className="keyword-alias" key={value}>
              {value}
            </small>
          ))
        ) : (
          <small className="keyword-alias muted">없음</small>
        )}
      </div>
    </div>
  );
}

function findKeywordMatches(notes: string, keywords: Keyword[]) {
  const candidates = keywords
    .flatMap((keyword) =>
      [keyword.text, ...keyword.synonyms, ...keyword.abbreviations]
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => ({ keyword, value }))
    )
    .sort((left, right) => right.value.length - left.value.length);
  const normalizedNotes = notes.toLocaleLowerCase();
  const matches: KeywordMatch[] = [];

  candidates.forEach(({ keyword, value }) => {
    const normalizedValue = value.toLocaleLowerCase();
    let start = normalizedNotes.indexOf(normalizedValue);

    while (start !== -1) {
      const end = start + value.length;
      const overlaps = matches.some(
        (match) => start < match.end && end > match.start
      );

      if (!overlaps) {
        matches.push({
          end,
          keyword,
          start,
          value: notes.slice(start, end)
        });
      }

      start = normalizedNotes.indexOf(normalizedValue, end);
    }
  });

  return matches.sort((left, right) => left.start - right.start);
}
