import { koreanFillerPolicyV1, type SlidePracticeFillerDetail } from "@orbit/shared";

export type FillerAnalysis = {
  totalCount: number;
  details: SlidePracticeFillerDetail[];
};

export function analyzeKoreanFillers(transcript: string): FillerAnalysis {
  let remaining = normalize(transcript);
  const counts = new Map<string, number>();
  const phrases = [...koreanFillerPolicyV1.phrases].sort((left, right) => right.length - left.length);

  for (const phrase of phrases) {
    const canonical = phrase.replace(/\s+/g, "");
    const expression = new RegExp(escapeRegExp(phrase).replace(/\\ /g, "\\s+"), "gu");
    const matches = remaining.match(expression) ?? [];
    if (matches.length > 0) {
      counts.set(canonical, (counts.get(canonical) ?? 0) + matches.length);
      remaining = remaining.replace(expression, " ");
    }
  }

  const allowedTokens = new Set(koreanFillerPolicyV1.tokens);
  for (const token of remaining.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    const canonical = canonicalFillerToken(token);
    if (allowedTokens.has(canonical)) {
      counts.set(canonical, (counts.get(canonical) ?? 0) + 1);
    }
  }

  const details = Array.from(counts, ([word, count]) => ({ word, count }))
    .sort((left, right) => right.count - left.count || left.word.localeCompare(right.word));
  return {
    totalCount: details.reduce((total, detail) => total + detail.count, 0),
    details,
  };
}

export function countSpokenSyllables(transcript: string) {
  const koreanSyllables = transcript.match(/[가-힣]/g)?.length ?? 0;
  const otherWords = transcript
    .replace(/[가-힣]/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean).length;
  return koreanSyllables + otherWords;
}

function canonicalFillerToken(value: string) {
  const normalized = value.toLocaleLowerCase("ko-KR");
  if (/^으?음+$/u.test(normalized)) return "음";
  if (/^어+$/u.test(normalized)) return "어";
  if (/^아+$/u.test(normalized)) return "아";
  return normalized;
}

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
