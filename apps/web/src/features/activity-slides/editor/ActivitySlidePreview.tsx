import type { ActivitySlide, Deck } from "@orbit/shared";
import { IconQrcode } from "@tabler/icons-react";

import { createActivityThemeStyle } from "../rendering/activityThemeStyle";
import "./activity-slide-editor.css";

export type ActivityPreviewRole = "audience" | "presenter";
export type ActivityAudiencePreviewMode = "editor" | "actual";

export function ActivitySlidePreview(props: {
  role: ActivityPreviewRole;
  slide: ActivitySlide;
  theme?: Deck["theme"];
  audiencePreviewMode?: ActivityAudiencePreviewMode;
}) {
  const activity = props.slide.activity;
  const audienceMode = props.audiencePreviewMode ?? "editor";
  const questionDensity = activity.questions.length >= 5
    ? "dense"
    : activity.questions.length >= 3
      ? "compact"
      : "comfortable";

  return props.role === "audience" && audienceMode === "actual" ? (
    <section
      aria-label="실제 청중 화면 미리보기"
      className={`activity-slide-preview-actual-audience activity-slide-preview activity-slide-preview-${questionDensity}`}
      data-activity-system-layer="locked"
      data-activity-template={activity.template}
      style={createActivityThemeStyle(props.theme, props.slide.style)}
    >
      <div className="activity-slide-preview-copy">
        <h2>{activity.title}</h2>
        {activity.description ? <p>{activity.description}</p> : null}
      </div>
      <div className="activity-audience-preview-session">
        <div className="activity-audience-preview-qr">
          <IconQrcode aria-hidden="true" size={54} stroke={1.5} />
        </div>
        <div>
          <strong>발표자가 참여 화면을 준비하고 있습니다.</strong>
          <span>참여 화면이 열리면 QR 코드가 표시됩니다.</span>
        </div>
      </div>
    </section>
  ) : (
    <section
      aria-label={`${props.role === "audience" ? "청중" : "발표자"} 참여 장표 미리보기`}
      className={`activity-slide-preview activity-slide-preview-${props.role} activity-slide-preview-${questionDensity}`}
      data-activity-system-layer="locked"
      data-activity-template={activity.template}
      style={createActivityThemeStyle(props.theme, props.slide.style)}
    >
      <div className="activity-slide-preview-copy">
        <h2>{activity.title}</h2>
        {activity.description ? <p>{activity.description}</p> : null}
      </div>
      <div className="activity-slide-preview-questions">
        {activity.questions.map((question, index) => (
          <article key={question.questionId}>
            <span>{index + 1}</span>
            <div>
              <strong>{question.prompt}</strong>
              {question.type === "rating" ? (
                <div aria-hidden="true" className="activity-rating-preview-shell">
                  <div className="activity-rating-preview">
                    {[1, 2, 3, 4, 5].map((value) => <i key={value}>{value}</i>)}
                  </div>
                  <div className="activity-rating-preview-labels">
                    <span>{question.leftLabel}</span>
                    <span>{question.rightLabel}</span>
                  </div>
                </div>
              ) : question.type === "free-text" ? (
                <div aria-hidden="true" className="activity-text-preview">
                  <span>답변을 입력해 주세요</span>
                </div>
              ) : (
                <div aria-hidden="true" className="activity-choice-preview">
                  {question.options.map((option) => (
                    <i key={option.optionId}>{option.label}</i>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
      {props.role === "presenter" ? (
        <div className="activity-presenter-preview-status">
          <strong>응답 0</strong>
          <span>대기 중</span>
        </div>
      ) : (
        <button disabled type="button">응답 제출</button>
      )}
    </section>
  );
}
