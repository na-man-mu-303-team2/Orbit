import {
  rehearsalRunComparisonSchema,
  type RehearsalComparisonIssue,
  type RehearsalReport,
  type RehearsalRunComparison,
  type RehearsalSemanticCueOutcome
} from "@orbit/shared";

const TIMING_OVERRUN_RATIO = 1.2;
const DELIVERY_FILLER_THRESHOLD = 2;

type BuildComparisonInput = {
  currentReport: RehearsalReport;
  currentRunId: string;
  previousReport: RehearsalReport | null;
  previousRunId: string | null;
};

type ComparisonBuckets = Pick<
  RehearsalRunComparison,
  "improved" | "repeated" | "newIssues" | "incomparable"
>;

export function buildRehearsalRunComparison({
  currentReport,
  currentRunId,
  previousReport,
  previousRunId
}: BuildComparisonInput): RehearsalRunComparison {
  const buckets: ComparisonBuckets = {
    improved: [],
    repeated: [],
    newIssues: [],
    incomparable: []
  };

  compareSemanticOutcomes(
    currentReport.semanticCueOutcomes,
    previousReport?.semanticCueOutcomes ?? [],
    buckets
  );
  compareTimings(
    currentReport.slideTimings,
    previousReport?.slideTimings ?? [],
    buckets
  );
  compareDelivery(
    currentReport.slideInsights,
    previousReport?.slideInsights ?? [],
    buckets
  );

  const briefing = [
    ...buckets.repeated.filter(
      (issue) => issue.category === "semantic-cue" && issue.severity === "high"
    ),
    ...buckets.newIssues.filter(
      (issue) => issue.category === "semantic-cue" && issue.severity === "high"
    ),
    ...buckets.repeated.filter((issue) => issue.category === "timing"),
    ...buckets.repeated.filter((issue) => issue.category === "delivery")
  ].slice(0, 3);

  return rehearsalRunComparisonSchema.parse({
    currentRunId,
    previousRunId,
    ...buckets,
    briefing
  });
}

function compareSemanticOutcomes(
  currentOutcomes: readonly RehearsalSemanticCueOutcome[],
  previousOutcomes: readonly RehearsalSemanticCueOutcome[],
  buckets: ComparisonBuckets
) {
  const previousByCueId = groupOutcomesByCueId(previousOutcomes);
  const currentCueIds = new Set(currentOutcomes.map((outcome) => outcome.cueId));

  for (const current of currentOutcomes) {
    const previousVersions = previousByCueId.get(current.cueId) ?? [];
    const previous = previousVersions.find(
      (candidate) => candidate.cueRevision === current.cueRevision
    );

    if (!previous && previousVersions.length > 0) {
      buckets.incomparable.push(
        semanticIssue(
          current,
          "Cue 내용이 달라진 회차는 이전 결과와 직접 비교하지 않았습니다."
        )
      );
      continue;
    }

    if (!isMeasuredSemanticOutcome(current) || (previous && !isMeasuredSemanticOutcome(previous))) {
      buckets.incomparable.push(
        semanticIssue(
          current,
          "어느 한 회차라도 측정하지 못했거나 검토에서 제외된 Cue는 비교하지 않았습니다."
        )
      );
      continue;
    }

    if (isSemanticIssue(current)) {
      if (
        previous &&
        isSemanticIssue(previous) &&
        current.importance === "core"
      ) {
        buckets.repeated.push(
          semanticIssue(
            current,
            "두 회차 연속 핵심 의미를 충분히 전달하지 못했습니다."
          )
        );
      } else {
        buckets.newIssues.push(
          semanticIssue(
            current,
            "이번 회차에서 새롭게 보완이 필요한 의미입니다."
          )
        );
      }
      continue;
    }

    if (previous && isSemanticIssue(previous) && current.status === "covered") {
      buckets.improved.push(
        semanticIssue(
          current,
          "이전 회차에서 부족했던 의미를 이번 회차에서 전달했습니다."
        )
      );
    }
  }

  for (const previous of previousOutcomes) {
    if (currentCueIds.has(previous.cueId) || previous.status === "covered") {
      continue;
    }
    buckets.incomparable.push(
      semanticIssue(
        previous,
        "현재 회차에 같은 Cue가 없어 이전 결과와 직접 비교하지 않았습니다."
      )
    );
  }
}

function compareTimings(
  currentTimings: RehearsalReport["slideTimings"],
  previousTimings: RehearsalReport["slideTimings"],
  buckets: ComparisonBuckets
) {
  const previousBySlideId = new Map(
    previousTimings.map((timing) => [timing.slideId, timing])
  );

  for (const current of currentTimings) {
    const previous = previousBySlideId.get(current.slideId);
    const currentOverrun = isTimingOverrun(current);
    const previousOverrun = previous ? isTimingOverrun(previous) : false;

    if (currentOverrun && previousOverrun) {
      buckets.repeated.push({
        category: "timing",
        slideId: current.slideId,
        label: "슬라이드 시간 초과",
        severity: "medium",
        reason: `두 회차 연속 목표 시간을 초과했습니다. 이번 회차는 목표보다 ${Math.round(
          current.actualSeconds - current.targetSeconds
        )}초 길었습니다.`
      });
    } else if (currentOverrun) {
      buckets.newIssues.push({
        category: "timing",
        slideId: current.slideId,
        label: "슬라이드 시간 초과",
        severity: "medium",
        reason: `이번 회차에서 목표보다 ${Math.round(
          current.actualSeconds - current.targetSeconds
        )}초 길었습니다.`
      });
    } else if (previousOverrun) {
      buckets.improved.push({
        category: "timing",
        slideId: current.slideId,
        label: "슬라이드 시간 개선",
        severity: "low",
        reason: "이전 회차의 시간 초과를 이번 회차에서 해소했습니다."
      });
    }
  }
}

function compareDelivery(
  currentInsights: RehearsalReport["slideInsights"],
  previousInsights: RehearsalReport["slideInsights"],
  buckets: ComparisonBuckets
) {
  const previousBySlideId = new Map(
    previousInsights.map((insight) => [insight.slideId, insight])
  );

  for (const current of currentInsights) {
    const previous = previousBySlideId.get(current.slideId);
    const currentProblem = isDeliveryIssue(current);
    const previousProblem = previous ? isDeliveryIssue(previous) : false;

    if (currentProblem && previousProblem) {
      buckets.repeated.push({
        category: "delivery",
        slideId: current.slideId,
        label: "슬라이드 전달 흐름 반복",
        severity: "medium",
        reason: deliveryReason(current, "두 회차 연속 전달 흐름을 다듬을 필요가 있습니다.")
      });
    } else if (currentProblem) {
      buckets.newIssues.push({
        category: "delivery",
        slideId: current.slideId,
        label: "슬라이드 전달 흐름",
        severity: "medium",
        reason: deliveryReason(current, "이번 회차에서 전달 흐름을 다듬을 필요가 있습니다.")
      });
    } else if (previousProblem) {
      buckets.improved.push({
        category: "delivery",
        slideId: current.slideId,
        label: "슬라이드 전달 흐름 개선",
        severity: "low",
        reason: "이전 회차의 습관어와 긴 멈춤 문제를 이번 회차에서 해소했습니다."
      });
    }
  }
}

function groupOutcomesByCueId(
  outcomes: readonly RehearsalSemanticCueOutcome[]
) {
  const grouped = new Map<string, RehearsalSemanticCueOutcome[]>();
  for (const outcome of outcomes) {
    const values = grouped.get(outcome.cueId) ?? [];
    values.push(outcome);
    grouped.set(outcome.cueId, values);
  }
  return grouped;
}

function isMeasuredSemanticOutcome(outcome: RehearsalSemanticCueOutcome) {
  return outcome.status !== "unmeasured" && outcome.status !== "excluded";
}

function isSemanticIssue(outcome: RehearsalSemanticCueOutcome) {
  return outcome.status === "missed" || outcome.status === "partial";
}

function semanticIssue(
  outcome: RehearsalSemanticCueOutcome,
  reason: string
): RehearsalComparisonIssue {
  return {
    category: "semantic-cue",
    slideId: outcome.slideId,
    cueId: outcome.cueId,
    cueRevision: outcome.cueRevision,
    label: outcome.reportLabelSnapshot,
    severity: importanceSeverity(outcome.importance),
    reason
  };
}

function importanceSeverity(
  importance: RehearsalSemanticCueOutcome["importance"]
): RehearsalComparisonIssue["severity"] {
  switch (importance) {
    case "core":
      return "high";
    case "supporting":
      return "medium";
    case "optional":
      return "low";
  }
}

function isTimingOverrun(
  timing: RehearsalReport["slideTimings"][number]
) {
  return (
    timing.targetSeconds > 0 &&
    timing.actualSeconds > timing.targetSeconds * TIMING_OVERRUN_RATIO
  );
}

function isDeliveryIssue(
  insight: RehearsalReport["slideInsights"][number]
) {
  return (
    insight.fillerWordCount >= DELIVERY_FILLER_THRESHOLD ||
    insight.pauseCount >= 1
  );
}

function deliveryReason(
  insight: RehearsalReport["slideInsights"][number],
  prefix: string
) {
  return `${prefix} 습관어 ${insight.fillerWordCount}회, 긴 멈춤 ${insight.pauseCount}회가 기록됐습니다.`;
}
