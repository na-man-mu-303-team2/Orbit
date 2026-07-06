import type { Keyword, Slide } from "@orbit/shared";

export type KeywordOccurrence = {
  occurrenceId: string;
  slideId: string;
  keywordId: string;
  text: string;
  start: number;
  end: number;
  occurrenceIndex: number;
  contextBefore: string;
  contextAfter: string;
};

type KeywordOccurrenceCandidate = {
  keyword: Keyword;
  keywordOrder: number;
  text: string;
  start: number;
  end: number;
};

export function deriveKeywordOccurrences(
  slide: Pick<Slide, "slideId" | "speakerNotes" | "keywords">
): KeywordOccurrence[] {
  const candidates = collectKeywordOccurrenceCandidates(slide);
  const selected = selectNonOverlappingCandidates(candidates);
  const occurrenceIndexesByKeywordId = new Map<string, number>();

  return selected.map((candidate) => {
    const occurrenceIndex =
      occurrenceIndexesByKeywordId.get(candidate.keyword.keywordId) ?? 0;
    occurrenceIndexesByKeywordId.set(
      candidate.keyword.keywordId,
      occurrenceIndex + 1
    );

    return {
      occurrenceId: createKeywordOccurrenceId(
        slide.slideId,
        candidate.keyword.keywordId,
        candidate.start,
        candidate.end
      ),
      slideId: slide.slideId,
      keywordId: candidate.keyword.keywordId,
      text: candidate.text,
      start: candidate.start,
      end: candidate.end,
      occurrenceIndex,
      contextBefore: slide.speakerNotes.slice(
        Math.max(0, candidate.start - 20),
        candidate.start
      ),
      contextAfter: slide.speakerNotes.slice(
        candidate.end,
        Math.min(slide.speakerNotes.length, candidate.end + 20)
      )
    };
  });
}

function collectKeywordOccurrenceCandidates(
  slide: Pick<Slide, "speakerNotes" | "keywords">
): KeywordOccurrenceCandidate[] {
  return slide.keywords.flatMap((keyword, keywordOrder) =>
    getKeywordTerms(keyword).flatMap((term) =>
      findTermMatches(slide.speakerNotes, term).map((match) => ({
        keyword,
        keywordOrder,
        text: match.text,
        start: match.start,
        end: match.end
      }))
    )
  );
}

function selectNonOverlappingCandidates(
  candidates: KeywordOccurrenceCandidate[]
): KeywordOccurrenceCandidate[] {
  const selected: KeywordOccurrenceCandidate[] = [];

  for (const candidate of [...candidates].sort(compareCandidates)) {
    if (
      selected.some(
        (selectedCandidate) =>
          candidate.start < selectedCandidate.end &&
          candidate.end > selectedCandidate.start
      )
    ) {
      continue;
    }

    selected.push(candidate);
  }

  return selected.sort((left, right) => left.start - right.start);
}

function compareCandidates(
  left: KeywordOccurrenceCandidate,
  right: KeywordOccurrenceCandidate
): number {
  return (
    left.start - right.start ||
    getCandidateLength(right) - getCandidateLength(left) ||
    left.keywordOrder - right.keywordOrder ||
    left.end - right.end
  );
}

function getCandidateLength(candidate: KeywordOccurrenceCandidate): number {
  return candidate.end - candidate.start;
}

function getKeywordTerms(keyword: Keyword): string[] {
  return [keyword.text, ...keyword.synonyms, ...keyword.abbreviations];
}

function findTermMatches(
  notes: string,
  term: string
): Array<{ text: string; start: number; end: number }> {
  const matches: Array<{ text: string; start: number; end: number }> = [];
  const normalizedTerm = term.toLocaleLowerCase();
  const normalizedNotes = notes.toLocaleLowerCase();
  let searchFrom = 0;

  while (searchFrom < normalizedNotes.length) {
    const start = normalizedNotes.indexOf(normalizedTerm, searchFrom);

    if (start === -1) {
      break;
    }

    const end = start + term.length;
    matches.push({
      text: notes.slice(start, end),
      start,
      end
    });
    searchFrom = end;
  }

  return matches;
}

function createKeywordOccurrenceId(
  slideId: string,
  keywordId: string,
  start: number,
  end: number
): string {
  return `kwo_${slideId}_${keywordId}_${start}_${end}`;
}
