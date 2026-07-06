import type { Keyword } from "@orbit/shared";

import { IdBadge } from "./EditorIdBadge";

export interface KeywordUsageSummary {
  advancesSlide: boolean;
  animationIds: string[];
}

interface SpeakerNotesWordPart {
  keyword: Keyword | null;
  kind: "word";
  occurrenceCount: number;
  occurrenceIndex: number;
  value: string;
}

interface SpeakerNotesTextPart {
  kind: "text";
  value: string;
}

type SpeakerNotesPart = SpeakerNotesWordPart | SpeakerNotesTextPart;

interface KeywordMatch {
  keyword: Keyword;
  value: string;
}

type AnchoredKeyword = Keyword & {
  noteOccurrence?: number;
};

export function KeywordHighlightedNotes(props: {
  keywords: Keyword[];
  notes: string;
  selectedKeywordId: string | null;
  showIds: boolean;
  onSelectKeyword: (keywordId: string) => void;
  onSelectKeywordText: (selection: {
    occurrenceCount: number;
    occurrenceIndex: number;
    value: string;
  }) => void;
}) {
  const {
    keywords,
    notes,
    selectedKeywordId,
    showIds,
    onSelectKeyword,
    onSelectKeywordText
  } = props;

  if (!notes) {
    return <p className="script-copy">발표 메모가 아직 없습니다.</p>;
  }

  const parts = tokenizeSpeakerNotes(notes, keywords);

  return (
    <p className="script-copy">
      {parts.map((part, index) => {
        if (part.kind === "text") {
          return part.value;
        }

        const keyword = part.keyword;
        const isSelected = keyword?.keywordId === selectedKeywordId;

        return (
          <button
            className={`${keyword ? "keyword-mark" : "keyword-note-token"} ${
              isSelected ? "selected" : ""
            }`}
            key={`${part.value}-${index}`}
            type="button"
            onClick={() =>
              keyword
                ? onSelectKeyword(keyword.keywordId)
                : onSelectKeywordText({
                    occurrenceCount: part.occurrenceCount,
                    occurrenceIndex: part.occurrenceIndex,
                    value: part.value
                  })
            }
          >
            <strong>{part.value}</strong>
            {showIds && keyword ? <IdBadge id={keyword.keywordId} /> : null}
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
  usageByKeywordId?: Record<string, KeywordUsageSummary>;
  onSelectKeyword: (keywordId: string) => void;
}) {
  const { keywords, selectedKeywordId, showIds, usageByKeywordId, onSelectKeyword } = props;

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
            {keyword.required ? (
              <small className="keyword-chip-badge">필수</small>
            ) : null}
            {(usageByKeywordId?.[keyword.keywordId]?.animationIds.length ?? 0) > 0 ? (
              <small className="keyword-chip-badge">
                애니메이션 {usageByKeywordId?.[keyword.keywordId]?.animationIds.length}
              </small>
            ) : null}
            {usageByKeywordId?.[keyword.keywordId]?.advancesSlide ? (
              <small className="keyword-chip-badge">다음 슬라이드</small>
            ) : null}
            {showIds ? <IdBadge id={keyword.keywordId} /> : null}
          </button>
        ))
      ) : (
        <span className="keyword-empty">등록된 키워드 없음</span>
      )}
    </div>
  );
}

export function KeywordDetail(props: {
  keyword: Keyword;
  showIds: boolean;
  usage?: KeywordUsageSummary | null;
  onClearSelection?: () => void;
  onDeleteKeyword?: () => void;
  onToggleAdvanceSlide?: () => void;
  onToggleRequired?: () => void;
}) {
  const {
    keyword,
    onClearSelection,
    onDeleteKeyword,
    onToggleAdvanceSlide,
    onToggleRequired,
    showIds,
    usage
  } = props;

  return (
    <section className="keyword-detail-card">
      <div className="keyword-detail-header">
        <div>
          <strong>{keyword.text}</strong>
          {showIds ? <IdBadge id={keyword.keywordId} /> : null}
        </div>
        <div className="keyword-detail-actions">
          <button
            className="keyword-detail-action"
            type="button"
            onClick={onClearSelection}
          >
            선택 해제
          </button>
          <button
            className="keyword-detail-action danger"
            type="button"
            onClick={onDeleteKeyword}
          >
            키워드 삭제
          </button>
        </div>
      </div>
      <div className="keyword-badge-row">
        {keyword.required ? <small className="keyword-badge">필수</small> : null}
        {(usage?.animationIds.length ?? 0) > 0 ? (
          <small className="keyword-badge">
            애니메이션 {usage?.animationIds.length}
          </small>
        ) : null}
        {usage?.advancesSlide ? (
          <small className="keyword-badge">다음 슬라이드</small>
        ) : null}
      </div>
      <div className="keyword-control-row">
        <button
          className={`keyword-control-button ${keyword.required ? "active" : ""}`}
          type="button"
          onClick={onToggleRequired}
        >
          필수 발화
        </button>
        <button
          className={`keyword-control-button ${usage?.advancesSlide ? "active" : ""}`}
          type="button"
          onClick={onToggleAdvanceSlide}
        >
          다음 슬라이드
        </button>
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

function tokenizeSpeakerNotes(notes: string, keywords: Keyword[]): SpeakerNotesPart[] {
  const parts: SpeakerNotesPart[] = [];
  const tokenPattern = /([0-9A-Za-z가-힣]+)/g;
  const occurrenceTotals = new Map<string, number>();
  const occurrenceByTerm = new Map<string, number>();
  let cursor = 0;

  for (const match of notes.matchAll(tokenPattern)) {
    const normalizedValue = normalizeTerm(match[0]);
    occurrenceTotals.set(
      normalizedValue,
      (occurrenceTotals.get(normalizedValue) ?? 0) + 1
    );
  }

  for (const match of notes.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    const value = match[0];
    const normalizedValue = normalizeTerm(value);
    const occurrenceCount = occurrenceTotals.get(normalizedValue) ?? 1;
    const occurrenceIndex = occurrenceByTerm.get(normalizedValue) ?? 0;

    if (cursor < index) {
      parts.push({
        kind: "text",
        value: notes.slice(cursor, index)
      });
    }

    parts.push({
      kind: "word",
      occurrenceCount,
      value,
      occurrenceIndex,
      keyword:
        findKeywordMatch(keywords, value, occurrenceIndex, occurrenceCount)?.keyword ??
        null
    });
    occurrenceByTerm.set(normalizedValue, occurrenceIndex + 1);
    cursor = index + value.length;
  }

  if (cursor < notes.length) {
    parts.push({
      kind: "text",
      value: notes.slice(cursor)
    });
  }

  return parts;
}

function findKeywordMatch(
  keywords: Keyword[],
  rawValue: string,
  occurrenceIndex: number,
  occurrenceCount: number
): KeywordMatch | null {
  const anchoredKeywords = keywords as AnchoredKeyword[];
  const normalizedValue = normalizeTerm(rawValue);

  if (!normalizedValue) {
    return null;
  }

  const anchoredPrimaryMatches = anchoredKeywords.filter(
    (keyword) =>
      keyword.noteOccurrence !== undefined &&
      normalizeTerm(keyword.text) === normalizedValue
  );

  const anchoredMatch = anchoredPrimaryMatches.find(
    (keyword) => keyword.noteOccurrence === occurrenceIndex
  );

  if (anchoredMatch) {
    return {
      keyword: anchoredMatch,
      value: anchoredMatch.text
    };
  }

  const hasPrimaryTextMatch = anchoredKeywords.some(
    (keyword) => normalizeTerm(keyword.text) === normalizedValue
  );

  if (anchoredPrimaryMatches.length > 0 || (occurrenceCount > 1 && hasPrimaryTextMatch)) {
    return null;
  }

  for (const keyword of anchoredKeywords) {
    if (keyword.noteOccurrence !== undefined) {
      continue;
    }

    const matched = [keyword.text, ...keyword.synonyms, ...keyword.abbreviations].find(
      (value) => normalizeTerm(value) === normalizedValue
    );

    if (matched) {
      return {
        keyword,
        value: matched
      };
    }
  }

  return null;
}

function normalizeTerm(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR");
}
