import type { RehearsalReport } from "@orbit/shared";
import { buildFiveSecondLongSilenceCountBySlide } from "./rehearsalSlideAnalysisModel";

export type TestMetricTone = "danger" | "muted" | "success" | "warning";

export type TestViewMetric = {
  description: string;
  meta: string;
  status: string;
  tone: TestMetricTone;
  value: string;
};

export type RehearsalReportTestSlideMetrics = {
  filler: TestViewMetric;
  keyMessage: TestViewMetric;
  longSilence: TestViewMetric;
  nextPractice: string;
  speakingRate: TestViewMetric;
};

const SPEAKING_RATE_REASON: Record<
  RehearsalReport["slideInsights"][number]["speakingRate"]["reasonCode"] & string,
  string
> = {
  UNSUPPORTED_LANGUAGE: "발화 언어를 확인할 수 없음",
  SEGMENT_TIMESTAMPS_UNAVAILABLE: "발화 구간 시간 정보 없음",
  INSUFFICIENT_SLIDE_SPEECH: "분석할 발화가 부족함",
  BASELINE_UNAVAILABLE: "비교할 기준 속도 없음",
  LEGACY_REPORT: "이전 형식의 리포트",
};

export function buildRehearsalReportTestSlideMetrics(
  report: RehearsalReport,
  slideId: string | null,
): RehearsalReportTestSlideMetrics {
  if (!slideId) {
    const unavailable = unavailableMetric("선택된 슬라이드가 없습니다.");
    return {
      filler: unavailable,
      keyMessage: unavailable,
      longSilence: unavailable,
      nextPractice: defaultNextPractice(report),
      speakingRate: unavailable,
    };
  }

  const insight = report.slideInsights.find((item) => item.slideId === slideId);
  const longSilenceCounts = buildFiveSecondLongSilenceCountBySlide(report);

  return {
    filler: buildFillerMetric(insight?.fillerWordCount),
    keyMessage: buildKeyMessageMetric(report, slideId),
    longSilence: buildLongSilenceMetric(longSilenceCounts?.get(slideId) ?? null),
    nextPractice: buildNextPractice(report, slideId),
    speakingRate: buildSpeakingRateMetric(insight?.speakingRate),
  };
}

function buildSpeakingRateMetric(
  rate: RehearsalReport["slideInsights"][number]["speakingRate"] | undefined,
): TestViewMetric {
  if (!rate || rate.measurementState === "unmeasured") {
    const reason = rate?.reasonCode
      ? SPEAKING_RATE_REASON[rate.reasonCode]
      : "슬라이드별 속도 분석 결과 없음";
    return unavailableMetric(reason);
  }

  const deltaPercent = Math.round((rate.relativeRateRatio - 1) * 100);
  const absoluteDelta = Math.abs(deltaPercent);
  const meta =
    deltaPercent === 0
      ? "개인 기준 속도와 동일"
      : `개인 기준 대비 ${deltaPercent > 0 ? "+" : "-"}${absoluteDelta}%`;

  if (rate.paceCategory === "faster") {
    return {
      description: `개인 기준보다 약 ${absoluteDelta}% 빠르게 말했습니다.`,
      meta,
      status: "빠름",
      tone: "danger",
      value: "평소보다 빠름",
    };
  }
  if (rate.paceCategory === "slower") {
    return {
      description: `개인 기준보다 약 ${absoluteDelta}% 느리게 말했습니다.`,
      meta,
      status: "느림",
      tone: "warning",
      value: "평소보다 느림",
    };
  }
  return {
    description: "개인 기준과 비슷한 속도로 안정적으로 말했습니다.",
    meta,
    status: "적정",
    tone: "success",
    value: "평소와 비슷함",
  };
}

function buildFillerMetric(count: number | null | undefined): TestViewMetric {
  if (count == null) return unavailableMetric("슬라이드별 습관어 분석 결과 없음");
  const isHigh = count >= 2;
  return {
    description:
      count === 0
        ? "이 슬라이드에서 습관어가 감지되지 않았습니다."
        : `이 슬라이드에서 습관어가 ${count}회 감지되었습니다.`,
    meta: "권장 0~1회",
    status: isHigh ? "많음" : "적정",
    tone: isHigh ? "danger" : "success",
    value: `${count}회`,
  };
}

function buildLongSilenceMetric(count: number | null): TestViewMetric {
  if (count == null) return unavailableMetric("5초 이상 침묵 분석 결과 없음");
  const occurred = count > 0;
  return {
    description:
      count === 0
        ? "5초 이상 발화가 없었던 구간이 없습니다."
        : `5초 이상 발화가 없었던 구간이 ${count}회 발생했습니다.`,
    meta: "권장 0회",
    status: occurred ? "발생" : "없음",
    tone: occurred ? "warning" : "success",
    value: `${count}회`,
  };
}

function buildKeyMessageMetric(
  report: RehearsalReport,
  slideId: string,
): TestViewMetric {
  const outcomes = report.semanticCueOutcomes.filter(
    (outcome) =>
      outcome.slideId === slideId &&
      outcome.importance === "core" &&
      outcome.status !== "excluded" &&
      outcome.status !== "unmeasured",
  );
  if (outcomes.length === 0) {
    return unavailableMetric("측정된 핵심 메시지 Cue 없음");
  }

  const coveredCount = outcomes.filter((outcome) => outcome.status === "covered").length;
  const partialCount = outcomes.filter((outcome) => outcome.status === "partial").length;
  const missedCount = outcomes.filter((outcome) => outcome.status === "missed").length;
  const tone: TestMetricTone =
    missedCount > 0 ? "danger" : partialCount > 0 ? "warning" : "success";

  return {
    description: `핵심 메시지 ${outcomes.length}개 중 ${coveredCount}개를 명확히 전달했습니다.`,
    meta:
      partialCount > 0 || missedCount > 0
        ? `일부 전달 ${partialCount}개 · 미전달 ${missedCount}개`
        : "모든 핵심 메시지 전달",
    status: tone === "success" ? "충족" : tone === "warning" ? "일부 전달" : "미흡",
    tone,
    value: `${coveredCount} / ${outcomes.length}개`,
  };
}

function buildNextPractice(report: RehearsalReport, slideId: string) {
  const slideFeedback = report.semanticCueOutcomes.find(
    (outcome) =>
      outcome.slideId === slideId &&
      (outcome.status === "missed" || outcome.status === "partial") &&
      outcome.feedback,
  )?.feedback;

  return slideFeedback || defaultNextPractice(report);
}

function defaultNextPractice(report: RehearsalReport) {
  return (
    report.coaching?.nextPracticeFocus.trim() ||
    "측정된 개선 항목을 중심으로 같은 슬라이드를 한 번 더 연습해 보세요."
  );
}

function unavailableMetric(description: string): TestViewMetric {
  return {
    description,
    meta: "데이터 없음",
    status: "확인 불가",
    tone: "muted",
    value: "측정 불가",
  };
}
