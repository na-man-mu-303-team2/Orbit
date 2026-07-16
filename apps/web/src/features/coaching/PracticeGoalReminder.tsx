import { useQuery } from "@tanstack/react-query";
import { Target, X } from "lucide-react";
import { useEffect, useState } from "react";

import { fetchPracticePlan } from "./practicePlanApi";
import {
  markPracticeGoalReminderSeen,
  selectPracticeGoalReminder,
  type PracticeGoalReminderState,
} from "./practiceGoalReminderModel";

export function PracticeGoalReminder(props: {
  projectId: string;
  sourceFullRunId?: string;
  slideId?: string;
}) {
  const plan = useQuery({
    queryKey: ["practice-plan", props.projectId, props.sourceFullRunId],
    queryFn: () => fetchPracticePlan(props.projectId, props.sourceFullRunId!),
    enabled: Boolean(props.sourceFullRunId),
    retry: false,
  });
  const [state, setState] = useState<PracticeGoalReminderState>({ seenKeys: [] });
  const reminder = selectPracticeGoalReminder(plan.data, props.slideId, state);
  const [activeReminder, setActiveReminder] = useState<typeof reminder>(null);

  useEffect(() => {
    setActiveReminder(null);
  }, [props.slideId]);

  useEffect(() => {
    if (!reminder) return;
    setActiveReminder(reminder);
    setState((current) => markPracticeGoalReminderSeen(current, reminder.key));
  }, [reminder?.key]);

  if (!activeReminder) return null;
  return (
    <aside className="practice-goal-reminder" role="status">
      <Target aria-hidden="true" size={18} />
      <span><strong>이번 슬라이드 목표</strong>{activeReminder.message}</span>
      <button aria-label="연습 목표 알림 닫기" onClick={() => setActiveReminder(null)} type="button">
        <X aria-hidden="true" size={16} />
      </button>
    </aside>
  );
}
