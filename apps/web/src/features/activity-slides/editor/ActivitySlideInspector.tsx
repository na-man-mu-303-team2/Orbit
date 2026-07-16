import type { ActivityDefinition, ActivitySlide } from "@orbit/shared";
import { useState } from "react";

import { ActivitySlidePreview, type ActivityPreviewRole } from "./ActivitySlidePreview";

export function ActivitySlideInspector(props: {
  onChange: (activity: ActivityDefinition) => void;
  slide: ActivitySlide;
}) {
  const [previewRole, setPreviewRole] = useState<ActivityPreviewRole>("audience");
  const activity = props.slide.activity;

  function updateActivity(patch: Partial<ActivityDefinition>) {
    props.onChange({ ...activity, ...patch });
  }

  return (
    <div className="activity-slide-inspector">
      <div className="activity-inspector-heading">
        <span className="orbit-ds-eyebrow">ACTIVITY</span>
        <h3>만족도 조사</h3>
        <p>청중에게 보일 문항과 발표자 화면을 함께 확인합니다.</p>
      </div>

      <label>
        제목
        <input
          maxLength={120}
          value={activity.title}
          onChange={(event) => updateActivity({ title: event.currentTarget.value })}
        />
      </label>
      <label>
        설명
        <textarea
          maxLength={500}
          rows={3}
          value={activity.description}
          onChange={(event) => updateActivity({ description: event.currentTarget.value })}
        />
      </label>

      <div className="activity-inspector-questions">
        {activity.questions.map((question, index) => (
          <label key={question.questionId}>
            문항 {index + 1} · {question.type === "rating" ? "5점 척도" : "주관식"}
            <textarea
              maxLength={500}
              rows={2}
              value={question.prompt}
              onChange={(event) => updateActivity({
                questions: activity.questions.map((candidate) =>
                  candidate.questionId === question.questionId
                    ? { ...candidate, prompt: event.currentTarget.value }
                    : candidate
                )
              })}
            />
          </label>
        ))}
      </div>

      <label className="activity-inspector-check">
        <input
          checked={activity.allowDisplayName}
          type="checkbox"
          onChange={(event) => updateActivity({ allowDisplayName: event.currentTarget.checked })}
        />
        선택 이름 허용
      </label>

      <div aria-label="참여 장표 미리보기 역할" className="activity-preview-tabs" role="tablist">
        {(["audience", "presenter"] as const).map((role) => (
          <button
            aria-selected={previewRole === role}
            className={previewRole === role ? "active" : ""}
            key={role}
            role="tab"
            type="button"
            onClick={() => setPreviewRole(role)}
          >
            {role === "audience" ? "청중 화면" : "발표자 화면"}
          </button>
        ))}
      </div>
      <ActivitySlidePreview role={previewRole} slide={props.slide} />

      <div aria-label="잠긴 시스템 레이어" className="activity-system-layer-lock">
        <strong>시스템 레이어 · 잠김</strong>
        <span>응답 UI는 문항 설정에서 자동 생성되며 개별 요소로 편집할 수 없습니다.</span>
      </div>
    </div>
  );
}
