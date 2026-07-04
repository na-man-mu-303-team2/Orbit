import type {
  AudienceFeatureSettings,
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

export function AudienceSessionSetupSummary() {
  return (
    <div className="audience-session-setup-summary">
      <section aria-label="선택된 세션 상호작용">
        <strong>선택된 상호작용</strong>
        <p>Poll/Quiz library 연결 대기</p>
      </section>
      <section aria-label="Poll과 Quiz 표시 순서">
        <strong>표시 순서</strong>
        <div className="audience-session-order-row" role="list">
          <button type="button" disabled>
            Poll
          </button>
          <button type="button" disabled>
            Quiz
          </button>
        </div>
      </section>
      <section aria-label="설문 초안 상태">
        <strong>Survey</strong>
        <p>초안 없음</p>
      </section>
      <section aria-label="AI Q&A 참고자료 선택">
        <strong>AI Q&A 참고자료</strong>
        <p>선택된 참고자료 없음</p>
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
