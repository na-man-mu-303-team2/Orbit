import type { PracticePlanResponse } from "@orbit/shared";
import { ArrowRight, CheckCircle2, Clock3, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { OrbitStatus } from "../../design-system";
import { fetchPracticePlan } from "./practicePlanApi";
import { practiceGoalCategoryLabel, practiceHistoryLabel } from "./practicePlanViewModel";

export function PracticeGoalSummary(props: { projectId: string; sourceFullRunId: string }) {
  const [plan, setPlan] = useState<PracticePlanResponse | null>(null);
  useEffect(() => {
    let active = true;
    void fetchPracticePlan(props.projectId, props.sourceFullRunId)
      .then((value) => { if (active) setPlan(value); })
      .catch(() => { if (active) setPlan(null); });
    return () => { active = false; };
  }, [props.projectId, props.sourceFullRunId]);
  if (!plan || plan.status !== "ready") return null;

  return (
    <section className="practice-report-summary" aria-labelledby="practice-report-summary-title">
      <header>
        <div>
          <p className="orbit-ds-eyebrow">Top 3 practice goals</p>
          <h2 id="practice-report-summary-title">다음 연습에서 먼저 바꿀 것</h2>
        </div>
        <a href={`/rehearsal/${encodeURIComponent(props.projectId)}/plan/${encodeURIComponent(props.sourceFullRunId)}`}>
          연습 계획 열기 <ArrowRight aria-hidden="true" size={17} />
        </a>
      </header>
      <ol>
        {plan.goals.map((goal) => (
          <li key={goal.goalId}>
            <span>0{goal.priority}</span>
            <div>
              <small>{practiceGoalCategoryLabel(goal.category)}</small>
              <strong>{goal.problemLabel}</strong>
              <p>{goal.nextAction}</p>
            </div>
            <OrbitStatus tone={goal.history.label === "persistent" ? "warning" : "neutral"}>
              {goal.category === "semantic" ? <MessageCircle aria-hidden="true" size={13} /> : goal.category === "timing" ? <Clock3 aria-hidden="true" size={13} /> : <CheckCircle2 aria-hidden="true" size={13} />}
              {practiceHistoryLabel(goal.history.label)}
            </OrbitStatus>
          </li>
        ))}
      </ol>
    </section>
  );
}
