import type { ReactNode } from "react";

export type KeywordHighlightKeyword = {
  abbreviations: readonly string[];
  keywordId: string;
  synonyms: readonly string[];
  text: string;
};

export type KeywordHighlightOccurrence = {
  occurrenceId: string;
  keywordId: string;
  start: number;
  end: number;
};

interface KeywordMatch {
  end: number;
  keyword: KeywordHighlightKeyword;
  start: number;
  value: string;
}

export function KeywordHighlightedText(props: {
  keywords: readonly KeywordHighlightKeyword[];
  text: string;
  highlightedOccurrences?: readonly KeywordHighlightOccurrence[];
  selectedKeywordId?: string | null;
  showIds?: boolean;
  textOffset?: number;
  renderIdBadge?: (keywordId: string) => ReactNode;
  onSelectKeyword?: (keywordId: string) => void;
}) {
  const {
    highlightedOccurrences,
    keywords,
    text,
    selectedKeywordId = null,
    showIds = false,
    textOffset = 0,
    renderIdBadge,
    onSelectKeyword
  } = props;
  const matches = findKeywordMatches(text, keywords);

  if (matches.length === 0) {
    return <>{text}</>;
  }

  const parts: Array<string | KeywordMatch> = [];
  let cursor = 0;

  matches.forEach((match) => {
    if (cursor < match.start) {
      parts.push(text.slice(cursor, match.start));
    }
    parts.push(match);
    cursor = match.end;
  });

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return (
    <>
      {parts.map((part, index) => {
        if (typeof part === "string") {
          return part;
        }

        const occurrence = highlightedOccurrences?.find(
          (candidate) =>
            candidate.keywordId === part.keyword.keywordId &&
            candidate.start === textOffset + part.start &&
            candidate.end === textOffset + part.end
        );
        const shouldHighlight = highlightedOccurrences ? Boolean(occurrence) : true;
        const isSelected =
          shouldHighlight && part.keyword.keywordId === selectedKeywordId;
        const className = `${shouldHighlight ? "keyword-mark" : "keyword-note-token"} ${
          isSelected ? "selected" : ""
        }`;
        const idBadge =
          showIds && renderIdBadge ? renderIdBadge(part.keyword.keywordId) : null;

        if (onSelectKeyword) {
          return (
            <button
              className={className}
              data-keyword-id={part.keyword.keywordId}
              data-occurrence-id={occurrence?.occurrenceId}
              key={`${part.keyword.keywordId}-${part.start}-${index}`}
              type="button"
              onClick={() => onSelectKeyword(part.keyword.keywordId)}
            >
              <strong>{part.value}</strong>
              {idBadge}
            </button>
          );
        }

        return (
          <span
            className={className}
            data-keyword-id={part.keyword.keywordId}
            data-occurrence-id={occurrence?.occurrenceId}
            key={`${part.keyword.keywordId}-${part.start}-${index}`}
          >
            <strong>{part.value}</strong>
            {idBadge}
          </span>
        );
      })}
    </>
  );
}

function findKeywordMatches(
  text: string,
  keywords: readonly KeywordHighlightKeyword[]
) {
  const candidates = keywords
    .flatMap((keyword) =>
      [keyword.text, ...keyword.synonyms, ...keyword.abbreviations]
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => ({ keyword, value }))
    )
    .sort((left, right) => right.value.length - left.value.length);
  const normalizedText = text.toLocaleLowerCase();
  const matches: KeywordMatch[] = [];

  candidates.forEach(({ keyword, value }) => {
    const normalizedValue = value.toLocaleLowerCase();
    let start = normalizedText.indexOf(normalizedValue);

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
          value: text.slice(start, end)
        });
      }

      start = normalizedText.indexOf(normalizedValue, end);
    }
  });

  return matches.sort((left, right) => left.start - right.start);
}
