import type {
  MotionPlanMetadata,
  MotionPlanPurpose,
  Slide,
} from "@orbit/shared";

const PATTERN_LABELS: Record<MotionPlanMetadata["plan"]["pattern"], string> = {
  "hero-then-support": "핵심 후 근거",
  "stepwise-process": "단계별 전개",
  "paired-comparison": "쌍 비교",
  "evidence-then-insight": "근거 후 인사이트",
  "cluster-reveal": "묶음 공개",
  "summary-recap": "요약 회고",
};

const PACING_LABELS: Record<MotionPlanMetadata["plan"]["pacing"], string> = {
  deliberate: "차분한 속도",
  balanced: "균형 잡힌 속도",
  brisk: "빠른 속도",
};

const PURPOSE_LABELS: Record<MotionPlanPurpose, string> = {
  orient: "주제 소개",
  reveal: "정보 공개",
  connect: "관계 연결",
  contrast: "차이 비교",
  emphasize: "핵심 강조",
  conclude: "마무리",
};

export function MotionPlanExplanation(props: {
  motionPlan: MotionPlanMetadata;
  slide: Slide;
}) {
  const model = buildMotionPlanExplanation(props.motionPlan, props.slide);
  return (
    <section
      aria-label="AI 모션 분석 근거"
      className="motion-plan-explanation"
    >
      <header>
        <span className="motion-plan-ai-badge">AI 분석</span>
        <strong>
          {model.patternLabel} · {model.pacingLabel}
        </strong>
      </header>
      <p>{model.summary}</p>
      <ol>
        {model.beats.map((beat) => (
          <li key={beat.beatId}>
            <span>
              {beat.triggerLabel} · {beat.purposeLabel}
            </span>
            <small>{beat.targetSummary}</small>
          </li>
        ))}
      </ol>
      <small className="motion-plan-provenance">
        {props.motionPlan.attemptCount === 2
          ? "2회 시도 후 AI 의미 계획을 안전한 효과로 변환했습니다."
          : "AI 의미 계획을 안전한 효과로 변환했습니다."}
      </small>
    </section>
  );
}

export function buildMotionPlanExplanation(
  motionPlan: MotionPlanMetadata,
  slide: Slide,
) {
  let clickIndex = 0;
  const beats = motionPlan.plan.beats.map((beat) => {
    if (beat.trigger === "click") clickIndex += 1;
    return {
      beatId: beat.beatId,
      triggerLabel:
        beat.trigger === "entry" ? "자동 진입" : `클릭 ${clickIndex}`,
      purposeLabel: PURPOSE_LABELS[beat.purpose],
      targetSummary: summarizeTargets(
        beat.targets.map((target) => target.elementId),
        slide,
      ),
    };
  });
  const entryTargetCount = motionPlan.plan.beats
    .filter((beat) => beat.trigger === "entry")
    .reduce((count, beat) => count + beat.targets.length, 0);
  const clickBeatCount = motionPlan.plan.beats.filter(
    (beat) => beat.trigger === "click",
  ).length;
  return {
    patternLabel: PATTERN_LABELS[motionPlan.plan.pattern],
    pacingLabel: PACING_LABELS[motionPlan.plan.pacing],
    summary: `AI가 ${PATTERN_LABELS[motionPlan.plan.pattern]} 흐름으로 분석해 자동 진입 대상 ${entryTargetCount}개와 클릭 ${clickBeatCount}단계를 구성했습니다.`,
    beats,
  };
}

function summarizeTargets(elementIds: string[], slide: Slide): string {
  const counts = new Map<string, number>();
  for (const elementId of elementIds) {
    const element = slide.elements.find(
      (candidate) => candidate.elementId === elementId,
    );
    const label = elementLabel(element?.role, element?.type);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts]
    .map(([label, count]) => `${label} ${count}개`)
    .join(" · ");
}

function elementLabel(role?: string, type?: string): string {
  if (role === "title") return "제목";
  if (role === "subtitle") return "부제";
  if (role === "focal") return "핵심 메시지";
  if (type === "image") return "이미지";
  if (type === "chart") return "차트";
  if (type === "table") return "표";
  if (role === "body") return "본문";
  if (role === "label") return "레이블";
  if (role === "supporting") return "보조 내용";
  if (role === "data") return "데이터";
  if (role === "media") return "미디어";
  if (type === "text") return "텍스트";
  return "요소";
}
