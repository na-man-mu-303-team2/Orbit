import type {
  AudienceFeatureSettings,
  ProjectInteractionLibraryItem,
  SessionInteraction,
  UpdateAudienceFeatureSettingsRequest,
  UploadedFile,
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

export function PreparedInteractionLibrarySelector(props: {
  disabled?: boolean;
  library: ProjectInteractionLibraryItem[] | null;
  onChange: (libraryInteractionIds: string[]) => void;
  selectedLibraryInteractionIds: string[];
}) {
  const {
    disabled = false,
    library,
    onChange,
    selectedLibraryInteractionIds,
  } = props;
  const byId = new Map(
    (library ?? []).map((interaction) => [
      interaction.libraryInteractionId,
      interaction,
    ]),
  );
  const selectedInteractions = selectedLibraryInteractionIds
    .map((libraryInteractionId) => byId.get(libraryInteractionId))
    .filter((interaction): interaction is ProjectInteractionLibraryItem =>
      Boolean(interaction),
    );

  function toggleSelection(libraryInteractionId: string, checked: boolean) {
    if (checked) {
      onChange([...selectedLibraryInteractionIds, libraryInteractionId]);
      return;
    }

    onChange(
      selectedLibraryInteractionIds.filter(
        (selectedId) => selectedId !== libraryInteractionId,
      ),
    );
  }

  function moveSelection(libraryInteractionId: string, direction: -1 | 1) {
    const currentIndex = selectedLibraryInteractionIds.indexOf(
      libraryInteractionId,
    );
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0) {
      return;
    }
    if (nextIndex >= selectedLibraryInteractionIds.length) {
      return;
    }

    const nextIds = [...selectedLibraryInteractionIds];
    const [selectedId] = nextIds.splice(currentIndex, 1);
    nextIds.splice(nextIndex, 0, selectedId);
    onChange(nextIds);
  }

  return (
    <section
      className="audience-prepared-selector"
      aria-label="Prepared Poll/Quiz"
    >
      <strong>Prepared Poll/Quiz</strong>
      {library === null ? <p>상호작용 library 확인 중</p> : null}
      {library?.length === 0 ? <p>저장된 상호작용 없음</p> : null}
      {library && library.length > 0 ? (
        <ul className="audience-prepared-library-list">
          {library.map((interaction) => {
            const selectedIndex = selectedLibraryInteractionIds.indexOf(
              interaction.libraryInteractionId,
            );
            const selected = selectedIndex >= 0;

            return (
              <li key={interaction.libraryInteractionId}>
                <label>
                  <input
                    aria-label={`${interaction.title} 선택`}
                    checked={selected}
                    disabled={disabled}
                    type="checkbox"
                    onChange={(event) =>
                      toggleSelection(
                        interaction.libraryInteractionId,
                        event.target.checked,
                      )
                    }
                  />
                  <span>
                    {interaction.title} ·{" "}
                    {interaction.kind === "poll" ? "Poll" : "Quiz"}
                    {selected ? ` · ${selectedIndex + 1}번` : ""}
                  </span>
                </label>
                {selected ? (
                  <span className="audience-prepared-order-actions">
                    <button
                      aria-label={`${interaction.title} 순서 올리기`}
                      disabled={disabled || selectedIndex === 0}
                      type="button"
                      onClick={() =>
                        moveSelection(interaction.libraryInteractionId, -1)
                      }
                    >
                      위
                    </button>
                    <button
                      aria-label={`${interaction.title} 순서 내리기`}
                      disabled={
                        disabled ||
                        selectedIndex === selectedLibraryInteractionIds.length - 1
                      }
                      type="button"
                      onClick={() =>
                        moveSelection(interaction.libraryInteractionId, 1)
                      }
                    >
                      아래
                    </button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {selectedInteractions.length > 0 ? (
        <ol className="audience-prepared-selected-order">
          {selectedInteractions.map((interaction) => (
            <li key={interaction.libraryInteractionId}>{interaction.title}</li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

export function AiReferenceSelectionControls(props: {
  assets: UploadedFile[] | null;
  disabled?: boolean;
  onChange: (referenceIds: string[]) => void;
  selectedReferenceIds: string[];
}) {
  const { assets, disabled = false, onChange, selectedReferenceIds } = props;
  const references =
    assets?.filter((asset) => asset.purpose === "reference-material") ?? null;

  function toggleReference(fileId: string, checked: boolean) {
    if (checked) {
      onChange([...selectedReferenceIds, fileId]);
      return;
    }

    onChange(selectedReferenceIds.filter((selectedId) => selectedId !== fileId));
  }

  return (
    <section className="audience-ai-reference-selector" aria-label="AI Q&A 참고자료">
      <strong>AI Q&A 참고자료</strong>
      {references === null ? <p>참고자료 확인 중</p> : null}
      {references?.length === 0 ? <p>선택 가능한 참고자료 없음</p> : null}
      {references && references.length > 0 ? (
        <ul>
          {references.map((asset) => {
            const selected = selectedReferenceIds.includes(asset.fileId);
            return (
              <li key={asset.fileId}>
                <label>
                  <input
                    aria-label={`${asset.originalName} ${
                      selected ? "선택 해제" : "선택"
                    }`}
                    checked={selected}
                    disabled={disabled}
                    type="checkbox"
                    onChange={(event) =>
                      toggleReference(asset.fileId, event.target.checked)
                    }
                  />
                  <span>{asset.originalName}</span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
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
