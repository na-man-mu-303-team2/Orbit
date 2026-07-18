import { koreanFillerPolicyV1 } from "./filler-policy";
import type {
  SlidePracticeCoachingIssueCode,
  SlidePracticeFillerDetail,
  SlidePracticeLoudnessSample,
  SlidePracticePauseSegment,
  SlidePracticeReport,
  SlidePracticeScriptMetricEvidence,
  SlidePracticeStyleResult,
  SlidePracticeTranscriptSegment,
  SlidePracticeVoiceMetrics,
  VoiceBaselineMetrics,
} from "./slide-practice.schema";

export type FillerAnalysis = {
  totalCount: number;
  details: SlidePracticeFillerDetail[];
};

export type SlidePracticeCoachingEvidenceCandidate = SlidePracticeScriptMetricEvidence & {
  evidenceId: string;
};

export function buildSlidePracticeCoachingEvidence(input: {
  speakerNotes: string;
  transcriptSegments: readonly SlidePracticeTranscriptSegment[];
  pauseSegments: readonly SlidePracticePauseSegment[];
  loudnessSamples: readonly SlidePracticeLoudnessSample[];
  voice: SlidePracticeVoiceMetrics;
  issueCodes: readonly SlidePracticeCoachingIssueCode[];
}): SlidePracticeCoachingEvidenceCandidate[] {
  const sentences = splitScriptSentences(input.speakerNotes).slice(0, 40);
  if (sentences.length === 0 || input.issueCodes.length === 0) return [];

  const allowedIssues = new Set(input.issueCodes);
  const candidates: SlidePracticeCoachingEvidenceCandidate[] = [];
  let sentenceCursor = 0;

  for (const segment of input.transcriptSegments) {
    const match = findBestSentenceMatch(segment.text, sentences, sentenceCursor);
    if (!match) continue;
    sentenceCursor = match.index;
    const durationSeconds = (segment.endMs - segment.startMs) / 1_000;
    const pace = durationSeconds > 0
      ? countSpokenSyllables(segment.text) / durationSeconds
      : null;
    const loudness = overlappingLoudness(
      input.loudnessSamples,
      segment.startMs,
      segment.endMs,
    );
    const pauseBeforeMs = adjacentPauseDuration(input.pauseSegments, segment.startMs, "before");
    const pauseAfterMs = adjacentPauseDuration(input.pauseSegments, segment.endMs, "after");
    const fillers = analyzeKoreanFillers(segment.text);
    const issueCodes = localEvidenceIssues({
      allowedIssues,
      fillers,
      loudness,
      pace,
      pauseBeforeMs,
      pauseAfterMs,
    });
    if (issueCodes.length === 0) continue;

    candidates.push({
      evidenceId: `evidence-${candidates.length + 1}`,
      originalText: match.text.slice(0, 1_000),
      alignment: "matched",
      startMs: segment.startMs,
      endMs: segment.endMs,
      issueCodes,
      metrics: {
        syllablesPerSecond: roundedMetric(pace),
        loudnessDb: roundedMetric(loudness),
        pauseBeforeMs,
        pauseAfterMs,
        pitchSpanHz: input.voice.pitchSpanHz,
        fillerTotalCount: fillers.totalCount,
        fillerWords: fillers.details.slice(0, 5).map((detail) => detail.word),
        loudnessVariationDb: input.voice.loudnessMadDb,
        rhythmRegularity: input.voice.rhythmRegularity,
      },
    });
    if (candidates.length >= 8) break;
  }

  if (candidates.length > 0) return candidates;
  const fallbackText = sentences[0]?.slice(0, 1_000);
  if (!fallbackText) return [];
  return [{
    evidenceId: "evidence-1",
    originalText: fallbackText,
    alignment: "practice-target",
    startMs: null,
    endMs: null,
    issueCodes: [...input.issueCodes],
    metrics: {
      syllablesPerSecond: input.voice.syllablesPerSecond,
      loudnessDb: input.voice.loudnessDb,
      pauseBeforeMs: null,
      pauseAfterMs: null,
      pitchSpanHz: input.voice.pitchSpanHz,
      fillerTotalCount: 0,
      fillerWords: [],
      loudnessVariationDb: input.voice.loudnessMadDb,
      rhythmRegularity: input.voice.rhythmRegularity,
    },
  }];
}

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

export function findSlidePracticeCoachingIssues(
  report: Pick<SlidePracticeReport, "fillers" | "voice">,
): SlidePracticeCoachingIssueCode[] {
  const issues: SlidePracticeCoachingIssueCode[] = [];
  if (report.fillers.totalCount > 0) issues.push("filler-use");

  const pace = report.voice.syllablesPerSecond;
  if (pace !== null && pace < 3.5) issues.push("pace-slow");
  if (pace !== null && pace > 4.8) issues.push("pace-fast");

  if (report.voice.pauseRatio < 0.12) issues.push("pause-low");
  if (report.voice.pauseRatio > 0.55) issues.push("pause-high");

  const pitchSpan = report.voice.pitchSpanHz;
  if (pitchSpan !== null && pitchSpan < 45) issues.push("pitch-flat");
  if (pitchSpan !== null && pitchSpan > 160) issues.push("pitch-wide");

  const loudness = report.voice.loudnessDb;
  if (loudness !== null && loudness < -45) issues.push("loudness-low");
  if (loudness !== null && loudness > -30) issues.push("loudness-high");
  return issues;
}

export function classifyVoiceStyle(
  metrics: SlidePracticeVoiceMetrics,
  baseline: VoiceBaselineMetrics | null,
): SlidePracticeStyleResult {
  const pace = metrics.syllablesPerSecond;
  const paceDelta = pace !== null && baseline?.syllablesPerSecond !== null && baseline?.syllablesPerSecond !== undefined
    ? pace - baseline.syllablesPerSecond
    : 0;
  const pitchSpan = metrics.pitchSpanHz;
  const baselinePitchSpan = baseline?.pitchSpanHz ?? null;
  const flatPitch = pitchSpan !== null && pitchSpan < Math.max(45, (baselinePitchSpan ?? 50) * 0.8);
  const slow = pace !== null && (pace < 3.5 || paceDelta <= -0.8 + 1e-9);
  const fast = pace !== null && (pace > 4.8 || paceDelta > 0.8);

  if (flatPitch && slow) {
    return style(
      "lullaby",
      0.82,
      ["억양 변화가 적어요", "말하는 구간의 속도가 느려요"],
      "오늘 목소리는 잠수 모드예요. 수면 위로 한 걸음",
    );
  }
  if (fast && metrics.pauseRatio < 0.7) {
    return style("turbo", 0.86, ["말하는 구간의 속도가 빨라요", "전체 연습의 쉼 비율이 70% 미만이에요"], "오늘 목소리에 기분 좋은 가속이 붙었어요");
  }
  return style(
    "neutral",
    0,
    ["자장가형·터보형 조건이 뚜렷하지 않아요"],
    "자장가형 또는 터보형 조건이 뚜렷하지 않아 유형 판단을 보류했습니다.",
  );
}

export function createUnmeasuredVoiceStyleResult(): SlidePracticeStyleResult {
  return style(
    "neutral",
    0,
    ["연습 분량이 부족해요"],
    "연습 분량이 부족해 목소리 유형을 판단하지 않았습니다.",
  );
}

function style(
  mode: SlidePracticeStyleResult["mode"],
  confidence: number,
  evidenceLabels: string[],
  message: string,
): SlidePracticeStyleResult {
  return { mode, confidence, evidenceLabels, message };
}

function canonicalFillerToken(value: string) {
  const normalized = value.toLocaleLowerCase("ko-KR");
  if (/^으?음+$/u.test(normalized)) return "음";
  if (/^어+$/u.test(normalized)) return "어";
  if (/^아+$/u.test(normalized)) return "아";
  return normalized;
}

function splitScriptSentences(value: string) {
  return (value.match(/[^.!?。！？…\n]+(?:[.!?。！？…]+|$)/gu) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function findBestSentenceMatch(
  transcript: string,
  sentences: readonly string[],
  cursor: number,
) {
  let best: { index: number; score: number; text: string } | null = null;
  const start = Math.max(0, cursor - 1);
  const end = Math.min(sentences.length, cursor + 5);
  for (let index = start; index < end; index += 1) {
    const text = sentences[index];
    if (!text) continue;
    const score = characterBigramDice(transcript, text);
    if (!best || score > best.score) best = { index, score, text };
  }
  return best && best.score >= 0.3 ? best : null;
}

function characterBigramDice(left: string, right: string) {
  const leftBigrams = bigrams(normalizeForAlignment(left));
  const rightBigrams = bigrams(normalizeForAlignment(right));
  if (leftBigrams.length === 0 || rightBigrams.length === 0) return 0;
  const remaining = new Map<string, number>();
  for (const value of rightBigrams) remaining.set(value, (remaining.get(value) ?? 0) + 1);
  let overlap = 0;
  for (const value of leftBigrams) {
    const count = remaining.get(value) ?? 0;
    if (count < 1) continue;
    overlap += 1;
    remaining.set(value, count - 1);
  }
  return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
}

function normalizeForAlignment(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]/gu, "");
}

function bigrams(value: string) {
  if (value.length < 2) return value ? [value] : [];
  return Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2));
}

function overlappingLoudness(
  samples: readonly SlidePracticeLoudnessSample[],
  startMs: number,
  endMs: number,
) {
  let weightedTotal = 0;
  let totalOverlap = 0;
  for (const sample of samples) {
    const overlap = Math.max(0, Math.min(endMs, sample.endMs) - Math.max(startMs, sample.startMs));
    if (overlap === 0) continue;
    weightedTotal += sample.loudnessDb * overlap;
    totalOverlap += overlap;
  }
  return totalOverlap > 0 ? weightedTotal / totalOverlap : null;
}

function adjacentPauseDuration(
  pauses: readonly SlidePracticePauseSegment[],
  boundaryMs: number,
  direction: "before" | "after",
) {
  const pause = pauses.find((candidate) => (
    direction === "before"
      ? Math.abs(candidate.endMs - boundaryMs) <= 100
      : Math.abs(candidate.startMs - boundaryMs) <= 100
  ));
  return pause?.durationMs ?? null;
}

function localEvidenceIssues(input: {
  allowedIssues: ReadonlySet<SlidePracticeCoachingIssueCode>;
  fillers: FillerAnalysis;
  loudness: number | null;
  pace: number | null;
  pauseBeforeMs: number | null;
  pauseAfterMs: number | null;
}) {
  const issues: SlidePracticeCoachingIssueCode[] = [];
  if (input.allowedIssues.has("filler-use") && input.fillers.totalCount > 0) issues.push("filler-use");
  if (input.allowedIssues.has("pace-slow") && input.pace !== null && input.pace < 3.5) issues.push("pace-slow");
  if (input.allowedIssues.has("pace-fast") && input.pace !== null && input.pace > 4.8) issues.push("pace-fast");
  const adjacentPauseMs = Math.max(input.pauseBeforeMs ?? 0, input.pauseAfterMs ?? 0);
  if (input.allowedIssues.has("pause-low") && adjacentPauseMs < 250) issues.push("pause-low");
  if (input.allowedIssues.has("pause-high") && adjacentPauseMs >= 1_000) issues.push("pause-high");
  if (input.allowedIssues.has("loudness-low") && input.loudness !== null && input.loudness < -45) issues.push("loudness-low");
  if (input.allowedIssues.has("loudness-high") && input.loudness !== null && input.loudness > -30) issues.push("loudness-high");
  if (input.allowedIssues.has("pitch-flat")) issues.push("pitch-flat");
  if (input.allowedIssues.has("pitch-wide")) issues.push("pitch-wide");
  return issues;
}

function roundedMetric(value: number | null) {
  return value === null ? null : Math.round(value * 100) / 100;
}

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
