import type {
  SlidePracticeStyleResult,
  SlidePracticeVoiceMetrics,
  VoiceBaselineMetrics,
} from "@orbit/shared";

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
  const flatPitch = pitchSpan !== null && pitchSpan < Math.max(35, (baselinePitchSpan ?? 50) * 0.65);
  const variedPitch = pitchSpan !== null && pitchSpan > Math.max(100, (baselinePitchSpan ?? 70) * 1.35);
  const fast = pace !== null && (pace > 5.2 || paceDelta > 1.1);
  const quiet = metrics.loudnessDb !== null && metrics.loudnessDb < -38;
  const regular = metrics.rhythmRegularity !== null && metrics.rhythmRegularity > 0.82;

  if (quiet && flatPitch) {
    return style("lullaby", 0.82, ["목소리가 작아요", "억양 변화가 적어요"], "자장가처럼 차분해요. 핵심 문장에서 음량과 억양을 조금 더 키워보세요.");
  }
  if (fast && metrics.pauseRatio < 0.12) {
    return style("turbo", 0.86, ["말이 빨라요", "쉼이 짧아요"], "터보처럼 빠르게 달리고 있어요. 문장 사이에 한 박자 쉬어보세요.");
  }
  if (variedPitch && metrics.loudnessDb !== null && metrics.loudnessDb > -24) {
    return style("announcer", 0.78, ["억양 변화가 커요", "목소리가 선명해요"], "아나운서처럼 또렷해요. 중요한 단어만 강조하면 더 자연스러워집니다.");
  }
  if (regular && flatPitch) {
    return style("cloud", 0.72, ["리듬이 일정해요", "강조가 적어요"], "구름처럼 매끈하게 이어져요. 핵심 문장 앞뒤에 쉼을 넣어보세요.");
  }
  return style("neutral", 0.7, ["속도와 억양이 안정적이에요"], "현재 전달 방식이 안정적이에요. 핵심 단어를 한두 개만 더 강조해보세요.");
}

function style(
  mode: SlidePracticeStyleResult["mode"],
  confidence: number,
  evidenceLabels: string[],
  message: string,
): SlidePracticeStyleResult {
  return { mode, confidence, evidenceLabels, message };
}
