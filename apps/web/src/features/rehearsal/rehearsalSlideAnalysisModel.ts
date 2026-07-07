import type { Deck, RehearsalReport } from "@orbit/shared";
import { resolveEditorAssetUrl } from "../editor/shared/editorAssetUrl";

type RecurringIssue = {
  missedCount: number;
  timeOverCount: number;
};

export type RehearsalSlideAnalysisCardModel = {
  averageSeconds: number | null;
  diffSeconds: number | null;
  feedbackItems: string[];
  missedKeywords: string[];
  signalTags: string[];
  slideId: string;
  slideLabel: string;
  thumbnailUrl: string;
  actualSeconds: number;
};

function getSlide(deck: Deck, slideId: string) {
  return deck.slides.find((slide) => slide.slideId === slideId);
}

function getSlideLabel(deck: Deck, slideId: string) {
  const slide = getSlide(deck, slideId);
  if (!slide) {
    return slideId;
  }

  const title = slide.title.trim();
  return title ? `슬라이드 ${slide.order} · ${title}` : `슬라이드 ${slide.order}`;
}

function buildSlideAverageMap(prevReports: RehearsalReport[]) {
  const raw = new Map<string, number[]>();

  for (const previousReport of prevReports) {
    for (const timing of previousReport.slideTimings) {
      const durations = raw.get(timing.slideId) ?? [];
      durations.push(timing.actualSeconds);
      raw.set(timing.slideId, durations);
    }
  }

  const averages = new Map<string, number>();
  for (const [slideId, durations] of raw) {
    averages.set(
      slideId,
      durations.reduce((total, duration) => total + duration, 0) / durations.length,
    );
  }

  return averages;
}

function buildRecurringIssueMap(prevReports: RehearsalReport[]) {
  const issues = new Map<string, RecurringIssue>();

  for (const previousReport of prevReports) {
    const missedSlides = new Set<string>();

    for (const timing of previousReport.slideTimings) {
      if (timing.actualSeconds <= timing.targetSeconds * 1.2) {
        continue;
      }

      const current = issues.get(timing.slideId) ?? {
        timeOverCount: 0,
        missedCount: 0,
      };
      current.timeOverCount += 1;
      issues.set(timing.slideId, current);
    }

    for (const missedKeyword of previousReport.missedKeywords) {
      if (missedSlides.has(missedKeyword.slideId)) {
        continue;
      }

      missedSlides.add(missedKeyword.slideId);
      const current = issues.get(missedKeyword.slideId) ?? {
        timeOverCount: 0,
        missedCount: 0,
      };
      current.missedCount += 1;
      issues.set(missedKeyword.slideId, current);
    }
  }

  return issues;
}

function buildFeedbackItems({
  averageSeconds,
  diffSeconds,
  missedKeywords,
  recurring,
  slideInsight,
}: {
  averageSeconds: number | null;
  diffSeconds: number | null;
  missedKeywords: string[];
  recurring: RecurringIssue | undefined;
  slideInsight: RehearsalReport["slideInsights"][number] | undefined;
}) {
  const feedback: string[] = [];

  if (missedKeywords.length > 0) {
    feedback.push(
      `${missedKeywords.join(", ")} 내용을 이 장표에서 먼저 설명하도록 핵심 문장을 고정해 보세요.`,
    );
  }

  if (slideInsight && slideInsight.fillerWordCount >= 2) {
    feedback.push(
      `이 구간에서 습관어가 ${slideInsight.fillerWordCount}회 나왔습니다. 장표 전환 직후 첫 문장을 짧게 정리해서 다시 연습하는 편이 좋습니다.`,
    );
  }

  if (slideInsight && slideInsight.pauseCount >= 1) {
    feedback.push(
      `설명이 끊긴 긴 멈춤이 ${slideInsight.pauseCount}회 있었습니다. 다음 문장 연결어를 미리 준비해 두는 편이 좋습니다.`,
    );
  }

  if (diffSeconds != null && averageSeconds != null && diffSeconds > 15) {
    feedback.push(
      `평균보다 ${Math.round(Math.abs(diffSeconds))}초 더 길었습니다. 예시를 줄이거나 결론 문장을 먼저 말해서 시간을 압축해 보세요.`,
    );
  }

  if (recurring && recurring.timeOverCount >= 2) {
    feedback.push(
      `최근 ${recurring.timeOverCount}회 시간 초과가 반복된 장표입니다. 이 장표의 설명 순서를 더 짧게 정리할 필요가 있습니다.`,
    );
  }

  if (recurring && recurring.missedCount >= 2) {
    feedback.push(
      `최근 ${recurring.missedCount}회 핵심 메시지 누락이 반복됐습니다. 이 장표에서 반드시 말할 문장을 한 줄로 고정해 두세요.`,
    );
  }

  return feedback;
}

function buildSignalTags({
  recurring,
  slideInsight,
}: {
  recurring: RecurringIssue | undefined;
  slideInsight: RehearsalReport["slideInsights"][number] | undefined;
}) {
  const signalTags: string[] = [];

  if (slideInsight && slideInsight.fillerWordCount > 0) {
    signalTags.push(`습관어 ${slideInsight.fillerWordCount}회`);
  }

  if (slideInsight && slideInsight.pauseCount > 0) {
    signalTags.push(`긴 멈춤 ${slideInsight.pauseCount}회`);
  }

  if (recurring && recurring.timeOverCount >= 2) {
    signalTags.push(`시간 초과 ${recurring.timeOverCount}회`);
  }

  if (recurring && recurring.missedCount >= 2) {
    signalTags.push(`메시지 누락 ${recurring.missedCount}회`);
  }

  return signalTags;
}

export function buildRehearsalSlideAnalysisCards(
  deck: Deck | null,
  prevReports: RehearsalReport[],
  report: RehearsalReport,
): RehearsalSlideAnalysisCardModel[] {
  if (!deck || report.slideTimings.length === 0) {
    return [];
  }

  const slideAverageMap = buildSlideAverageMap(prevReports);
  const recurringIssueMap = buildRecurringIssueMap(prevReports);
  const slideInsightMap = new Map(
    report.slideInsights.map((insight) => [insight.slideId, insight]),
  );

  return report.slideTimings
    .map((timing) => {
      const slide = getSlide(deck, timing.slideId);
      const missedKeywords = report.missedKeywords
        .filter((keyword) => keyword.slideId === timing.slideId)
        .map((keyword) => keyword.text);
      const slideInsight = slideInsightMap.get(timing.slideId);
      const recurring = recurringIssueMap.get(timing.slideId);
      const averageSeconds = slideAverageMap.get(timing.slideId) ?? null;
      const diffSeconds =
        averageSeconds != null ? timing.actualSeconds - averageSeconds : null;
      const signalTags = buildSignalTags({ recurring, slideInsight });
      const feedbackItems = buildFeedbackItems({
        averageSeconds,
        diffSeconds,
        missedKeywords,
        recurring,
        slideInsight,
      });

      return {
        averageSeconds,
        diffSeconds,
        feedbackItems,
        missedKeywords,
        signalTags,
        slideId: timing.slideId,
        slideLabel: getSlideLabel(deck, timing.slideId),
        thumbnailUrl: slide?.thumbnailUrl
          ? resolveEditorAssetUrl(slide.thumbnailUrl)
          : "",
        actualSeconds: timing.actualSeconds,
      };
    })
    .filter(
      (card) =>
        card.feedbackItems.length > 0 ||
        card.missedKeywords.length > 0 ||
        card.signalTags.length > 0,
    );
}
