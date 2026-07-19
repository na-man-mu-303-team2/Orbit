import type {
  ActivityDefinition,
  ActivityQuestion,
  ActivityQuestionType,
  ActivitySlide
} from "@orbit/shared";
import {
  OrbitButton,
  OrbitDialog,
  OrbitField,
  OrbitInput,
  OrbitSelect,
  OrbitStatus,
  OrbitTextarea
} from "../../../components/ui";
import { useState } from "react";

import { ActivitySlidePreview, type ActivityPreviewRole } from "./ActivitySlidePreview";
import { ActivityEditorModerationPanel } from "./ActivityEditorModerationPanel";
import { ActivityEditorOperationsPanel } from "./ActivityEditorOperationsPanel";
import { useActivityEditorRuntime } from "./useActivityEditorRuntime";

const templateLabels = {
  "pre-question": "사전 질문",
  poll: "실시간 투표",
  satisfaction: "만족도 조사"
} as const;

const questionTypeLabels: Record<ActivityQuestionType, string> = {
  rating: "5점 척도",
  "single-choice": "단일 선택",
  "multiple-choice": "복수 선택",
  "free-text": "주관식"
};

export function ActivitySlideInspector(props: {
  deckId?: string;
  onOpenAudienceLink?: () => void;
  onChange: (activity: ActivityDefinition) => void;
  projectId?: string;
  slide: ActivitySlide;
}) {
  const [previewRole, setPreviewRole] = useState<ActivityPreviewRole>("audience");
  const [supersedeDialogOpen, setSupersedeDialogOpen] = useState(false);
  const activity = props.slide.activity;
  const editorRuntime = useActivityEditorRuntime({
    activityId: activity.activityId,
    deckId: props.deckId,
    projectId: props.projectId
  });

  function updateActivity(patch: Partial<ActivityDefinition>) {
    props.onChange({ ...activity, ...patch });
  }

  function updateQuestion(questionId: string, next: ActivityQuestion) {
    updateActivity({
      questions: activity.questions.map((question) =>
        question.questionId === questionId ? next : question
      )
    });
  }

  return (
    <div className="activity-slide-inspector">
      <div className="activity-inspector-heading">
        <div>
          <span className="redesign-eyebrow">ACTIVITY</span>
          <h3>{templateLabels[activity.template]}</h3>
          <p>청중에게 보일 문항을 설정하고 슬라이드에서 바로 확인합니다.</p>
        </div>
      </div>

      <fieldset
        className="activity-semantic-fields"
        data-semantic-locked={editorRuntime.locked ? "true" : "false"}
        disabled={editorRuntime.locked}
      >
      <section className="activity-inspector-section">
        <div className="activity-inspector-section-heading">
          <strong>장표 내용</strong>
          <span>제목과 안내 문구는 슬라이드 왼쪽 영역에 표시됩니다.</span>
        </div>
        <OrbitField id="activity-slide-title" label="제목">
          <OrbitInput
            maxLength={120}
            value={activity.title}
            onChange={(event) => updateActivity({ title: event.currentTarget.value })}
          />
        </OrbitField>
        <OrbitField id="activity-slide-description" label="설명">
          <OrbitTextarea
            maxLength={500}
            rows={3}
            value={activity.description}
            onChange={(event) => updateActivity({ description: event.currentTarget.value })}
          />
        </OrbitField>
      </section>

      <section className="activity-inspector-section">
        <div className="activity-inspector-section-heading">
          <strong>문항 설정</strong>
          <span>입력한 질문은 슬라이드의 응답 카드에 바로 표시됩니다.</span>
        </div>
        <div className="activity-inspector-questions">
        {activity.questions.map((question, index) => (
          <section className="activity-question-editor" key={question.questionId}>
            <div className="activity-question-editor-heading">
              <div className="activity-question-editor-title">
                <strong>문항 {index + 1}</strong>
                <OrbitStatus>{questionTypeLabels[question.type]}</OrbitStatus>
              </div>
              <div>
                <button
                  aria-label={`문항 ${index + 1} 위로 이동`}
                  disabled={index === 0}
                  type="button"
                  onClick={() => updateActivity({ questions: moveQuestion(activity.questions, index, -1) })}
                >↑</button>
                <button
                  aria-label={`문항 ${index + 1} 아래로 이동`}
                  disabled={index === activity.questions.length - 1}
                  type="button"
                  onClick={() => updateActivity({ questions: moveQuestion(activity.questions, index, 1) })}
                >↓</button>
                {activity.template !== "poll" ? (
                  <button
                    aria-label={`문항 ${index + 1} 삭제`}
                    disabled={activity.questions.length === 1}
                    type="button"
                    onClick={() => updateActivity({
                      questions: activity.questions.filter((candidate) => candidate.questionId !== question.questionId)
                    })}
                  >삭제</button>
                ) : null}
              </div>
            </div>
            {activity.template === "satisfaction" ? (
              <OrbitField id={`activity-question-${question.questionId}-type`} label="문항 유형">
                <OrbitSelect
                  value={question.type}
                  onChange={(event) => updateQuestion(
                    question.questionId,
                    convertQuestionType(activity, question, event.currentTarget.value as ActivityQuestionType)
                  )}
                >
                  {Object.entries(questionTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </OrbitSelect>
              </OrbitField>
            ) : null}
            <OrbitField
              hint="입력 내용은 왼쪽 슬라이드의 질문 카드에 즉시 반영됩니다."
              id={`activity-question-${question.questionId}-prompt`}
              label="질문"
            >
              <OrbitTextarea
                maxLength={500}
                rows={2}
                value={question.prompt}
                onChange={(event) => updateQuestion(question.questionId, {
                  ...question,
                  prompt: event.currentTarget.value
                })}
              />
            </OrbitField>
            <div className="activity-question-toggles">
              <label className="activity-inspector-check">
                <input
                  checked={question.required}
                  type="checkbox"
                  onChange={(event) => updateQuestion(question.questionId, {
                    ...question,
                    required: event.currentTarget.checked
                  })}
                />
                필수 문항
              </label>
            </div>
            {question.type === "rating" ? (
              <div className="activity-rating-label-editor">
                <OrbitField id={`activity-question-${question.questionId}-left-label`} label="왼쪽 label">
                  <OrbitInput maxLength={40} value={question.leftLabel} onChange={(event) => updateQuestion(question.questionId, { ...question, leftLabel: event.currentTarget.value })} />
                </OrbitField>
                <OrbitField id={`activity-question-${question.questionId}-right-label`} label="오른쪽 label">
                  <OrbitInput maxLength={40} value={question.rightLabel} onChange={(event) => updateQuestion(question.questionId, { ...question, rightLabel: event.currentTarget.value })} />
                </OrbitField>
              </div>
            ) : null}
            {question.type === "single-choice" || question.type === "multiple-choice" ? (
              <div className="activity-option-editor">
                {question.options.map((option, optionIndex) => (
                  <label key={option.optionId}>
                    선택지 {optionIndex + 1}
                    <span>
                      <OrbitInput
                        id={`activity-option-${option.optionId}`}
                        maxLength={100}
                        value={option.label}
                        onChange={(event) => updateQuestion(question.questionId, {
                          ...question,
                          options: question.options.map((candidate) => candidate.optionId === option.optionId
                            ? { ...candidate, label: event.currentTarget.value }
                            : candidate)
                        })}
                      />
                      <button
                        aria-label={`선택지 ${optionIndex + 1} 삭제`}
                        disabled={question.options.length <= 2}
                        type="button"
                        onClick={() => updateQuestion(
                          question.questionId,
                          removeQuestionOption(question, option.optionId)
                        )}
                      >삭제</button>
                    </span>
                  </label>
                ))}
                <button
                  disabled={question.options.length >= 8}
                  type="button"
                  onClick={() => updateQuestion(question.questionId, {
                    ...question,
                    options: [...question.options, createOption(activity, question)]
                  })}
                >선택지 추가</button>
              </div>
            ) : null}
          </section>
        ))}
        {activity.template !== "poll" ? (
          <button
            disabled={activity.questions.length >= 5}
            type="button"
            onClick={() => updateActivity({
              questions: [...activity.questions, createQuestion(activity, "free-text")]
            })}
          >문항 추가 ({activity.questions.length}/5)</button>
        ) : null}
        </div>

        <label className="activity-inspector-check activity-display-name-check">
          <input
            checked={activity.allowDisplayName}
            type="checkbox"
            onChange={(event) => updateActivity({ allowDisplayName: event.currentTarget.checked })}
          />
          응답자 이름 입력 허용
        </label>
      </section>
      </fieldset>

      {editorRuntime.locked && editorRuntime.runtime ? (
        <section className="activity-definition-lock" role="status">
          <strong>첫 응답 이후 문항 설정이 잠겼습니다.</strong>
          <p>
            실행 v{editorRuntime.runtime.run.version}의 응답 {editorRuntime.runtime.run.responseCount}개를
            보존합니다. 문항 의미를 바꾸려면 새 실행 버전을 만드세요.
          </p>
          <OrbitButton
            disabled={editorRuntime.pending}
            onClick={() => setSupersedeDialogOpen(true)}
            type="button"
            variant="secondary"
          >
            새 실행 버전 만들기
          </OrbitButton>
        </section>
      ) : null}
      {editorRuntime.error ? (
        <p className="activity-editor-runtime-error" role="alert">
          {editorRuntime.error}
        </p>
      ) : null}
      <ActivityEditorOperationsPanel
        onOpenAudienceLink={props.onOpenAudienceLink}
        onUpdateStatus={(status) => void editorRuntime.updateStatus(status)}
        pending={editorRuntime.pending}
        projectId={props.projectId}
        runtime={editorRuntime.runtime}
        slide={props.slide}
      />

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
      {props.deckId && props.projectId ? (
        <ActivityEditorModerationPanel
          deckId={props.deckId}
          projectId={props.projectId}
          slide={props.slide}
        />
      ) : null}
      <OrbitDialog
        closeDisabled={editorRuntime.pending}
        description="기존 응답은 이전 버전에 그대로 보존되고 새 버전은 준비 상태로 시작합니다."
        footer={(
          <>
            <OrbitButton
              disabled={editorRuntime.pending}
              onClick={() => setSupersedeDialogOpen(false)}
              type="button"
              variant="secondary"
            >
              취소
            </OrbitButton>
            <OrbitButton
              disabled={editorRuntime.pending}
              onClick={() => {
                void editorRuntime.supersede().then((created) => {
                  if (created) setSupersedeDialogOpen(false);
                });
              }}
              type="button"
            >
              {editorRuntime.pending ? "만드는 중" : "새 버전 만들기"}
            </OrbitButton>
          </>
        )}
        onClose={() => setSupersedeDialogOpen(false)}
        open={supersedeDialogOpen}
        title="새 실행 버전을 만들까요?"
      >
        <p>현재 문항 설정을 복사한 새 run을 만들고 편집 잠금을 해제합니다.</p>
      </OrbitDialog>
    </div>
  );
}

export function moveQuestion(
  questions: ActivityQuestion[],
  index: number,
  direction: -1 | 1
): ActivityQuestion[] {
  const target = index + direction;
  if (target < 0 || target >= questions.length) return questions;
  const next = [...questions];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function convertQuestionType(
  activity: ActivityDefinition,
  question: ActivityQuestion,
  type: ActivityQuestionType
): ActivityQuestion {
  const base = { questionId: question.questionId, prompt: question.prompt, required: question.required };
  if (type === "rating") return { ...base, type, leftLabel: "전혀 아니요", rightLabel: "매우 그래요" };
  if (type === "free-text") return { ...base, type };
  const options = question.type === "single-choice" || question.type === "multiple-choice"
    ? question.options
    : [createOption(activity, question), createOption(activity, question, 1)];
  if (type === "multiple-choice") return { ...base, type, options, maxSelections: options.length };
  return { ...base, type, options };
}

export function removeQuestionOption(
  question: ActivityQuestion,
  optionId: string
): ActivityQuestion {
  if (question.type !== "single-choice" && question.type !== "multiple-choice") {
    return question;
  }
  const options = question.options.filter((option) => option.optionId !== optionId);
  if (question.type === "multiple-choice" && question.maxSelections !== undefined) {
    return {
      ...question,
      options,
      maxSelections: Math.min(question.maxSelections, options.length)
    };
  }
  return { ...question, options };
}

function createQuestion(activity: ActivityDefinition, type: ActivityQuestionType): ActivityQuestion {
  const used = new Set(activity.questions.map((question) => question.questionId));
  const questionId = nextLocalId("question_", activity.activityId, used);
  return convertQuestionType(activity, { questionId, type: "free-text", prompt: "새 문항", required: false }, type);
}

function createOption(
  activity: ActivityDefinition,
  question: Pick<ActivityQuestion, "questionId">,
  offset = 0
) {
  const used = new Set(activity.questions.flatMap((candidate) =>
    candidate.type === "single-choice" || candidate.type === "multiple-choice"
      ? candidate.options.map((option) => option.optionId)
      : []
  ));
  for (let index = 0; index < offset; index += 1) {
    used.add(nextLocalId("option_", question.questionId, used));
  }
  return {
    optionId: nextLocalId("option_", question.questionId, used),
    label: `선택 ${used.size + 1}`
  };
}

function nextLocalId(prefix: string, seed: string, used: Set<string>) {
  const normalized = seed.replace(/[^A-Za-z0-9_-]/g, "_");
  let index = 1;
  while (used.has(`${prefix}${normalized}_${index}`)) index += 1;
  return `${prefix}${normalized}_${index}`;
}
