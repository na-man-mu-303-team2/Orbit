import type {
  AudienceFeatureSettings,
  SessionInteraction,
  UpdateAudienceFeatureSettingsRequest,
} from "@orbit/shared";

import "./audienceFeatureControls.css";

export type AudienceFeatureKey = keyof UpdateAudienceFeatureSettingsRequest;

type AudienceFeatureControlItem = {
  key: AudienceFeatureKey;
  label: string;
  detail: string;
};

export const audienceFeatureControlItems: AudienceFeatureControlItem[] = [
  {
    key: "qnaEnabled",
    label: "Q&A",
    detail: "청중 질문 수집",
  },
  {
    key: "aiQnaEnabled",
    label: "AI Q&A",
    detail: "선택한 참고자료 기반 답변",
  },
  {
    key: "pollsEnabled",
    label: "Poll",
    detail: "준비한 투표 노출",
  },
  {
    key: "quizzesEnabled",
    label: "Quiz",
    detail: "준비한 퀴즈 노출",
  },
  {
    key: "reactionsEnabled",
    label: "Reactions",
    detail: "실시간 반응 수집",
  },
  {
    key: "surveyEnabled",
    label: "Survey",
    detail: "종료 설문 노출",
  },
];

export function AudienceFeatureSettingsControls(props: {
  busyKey?: AudienceFeatureKey | null;
  disabled?: boolean;
  features: AudienceFeatureSettings | null;
  onToggle: (key: AudienceFeatureKey, enabled: boolean) => void;
}) {
  const { busyKey, disabled = false, features, onToggle } = props;

  return (
    <div className="audience-feature-toggle-grid">
      {audienceFeatureControlItems.map((item) => {
        const checked = Boolean(features?.[item.key]);
        const itemDisabled = disabled || !features || busyKey === item.key;

        return (
          <label className="audience-feature-toggle" key={item.key}>
            <input
              aria-label={`${item.label} ${checked ? "끄기" : "켜기"}`}
              checked={checked}
              disabled={itemDisabled}
              type="checkbox"
              onChange={(event) => onToggle(item.key, event.target.checked)}
            />
            <span className="audience-feature-switch" aria-hidden="true" />
            <span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function AudienceSessionSetupSummary(props: {
  interactions?: SessionInteraction[] | null;
  selectedReferenceCount?: number | null;
  surveyLocked?: boolean;
  surveyTitle?: string;
}) {
  const {
    interactions = null,
    selectedReferenceCount = null,
    surveyLocked = false,
    surveyTitle = "",
  } = props;
  const orderedInteractions = [...(interactions ?? [])].sort(
    (left, right) => left.order - right.order,
  );

  return (
    <div className="audience-session-setup-summary">
      <section aria-label="선택된 세션 상호작용">
        <strong>선택된 상호작용</strong>
        {interactions === null ? (
          <p>상호작용 확인 중</p>
        ) : orderedInteractions.length > 0 ? (
          <ul>
            {orderedInteractions.map((interaction) => (
              <li key={interaction.interactionId}>
                {interaction.title} · {interaction.kind === "poll" ? "Poll" : "Quiz"}
              </li>
            ))}
          </ul>
        ) : (
          <p>선택된 상호작용 없음</p>
        )}
      </section>
      <section aria-label="Poll과 Quiz 표시 순서">
        <strong>표시 순서</strong>
        <div className="audience-session-order-row" role="list">
          {orderedInteractions.length > 0 ? (
            orderedInteractions.map((interaction, index) => (
              <button
                key={interaction.interactionId}
                type="button"
                disabled
                aria-label={`${interaction.title} 표시 순서 ${index + 1}`}
              >
                {index + 1}
              </button>
            ))
          ) : (
            <button type="button" disabled>
              없음
            </button>
          )}
        </div>
      </section>
      <section aria-label="설문 초안 상태">
        <strong>Survey</strong>
        <p>
          {surveyTitle
            ? `${surveyTitle} · ${surveyLocked ? "잠김" : "초안"}`
            : "저장된 설문 없음"}
        </p>
      </section>
      <section aria-label="AI Q&A 참고자료 선택">
        <strong>AI Q&A 참고자료</strong>
        <p>
          {selectedReferenceCount === null
            ? "참고자료 확인 중"
            : selectedReferenceCount > 0
              ? `${selectedReferenceCount}개 선택됨`
              : "선택된 참고자료 없음"}
        </p>
      </section>
    </div>
  );
}

export function normalizeAudienceFeaturePatch(
  key: AudienceFeatureKey,
  enabled: boolean,
): UpdateAudienceFeatureSettingsRequest {
  if (key === "aiQnaEnabled" && enabled) {
    return { aiQnaEnabled: true, qnaEnabled: true };
  }

  if (key === "qnaEnabled" && !enabled) {
    return { aiQnaEnabled: false, qnaEnabled: false };
  }

  return { [key]: enabled } as UpdateAudienceFeatureSettingsRequest;
}

export function applyAudienceFeaturePatch(
  current: AudienceFeatureSettings,
  patch: UpdateAudienceFeatureSettingsRequest,
): AudienceFeatureSettings {
  const next = {
    ...current,
    ...patch,
  };

  if (patch.aiQnaEnabled === true) {
    next.qnaEnabled = true;
  }

  if (patch.qnaEnabled === false) {
    next.aiQnaEnabled = false;
  }

  return next;
}
