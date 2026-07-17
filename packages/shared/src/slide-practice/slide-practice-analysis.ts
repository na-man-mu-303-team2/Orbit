import { koreanFillerPolicyV1 } from "./filler-policy";
import type {
  SlidePracticeFillerDetail,
  SlidePracticeStyleResult,
  SlidePracticeVoiceMetrics,
  VoiceBaselineMetrics,
} from "./slide-practice.schema";

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

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
