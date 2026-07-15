type EditorSaveControlProps = {
  emptyStateLabel?: string;
  disabled?: boolean;
  isSaving: boolean;
  lastSavedAtLabel: string | null;
  onSave: () => void;
  recoveryHint?: string | null;
  statusLabel: string;
};

export function EditorSaveControl(props: EditorSaveControlProps) {
  const {
    disabled = false,
    emptyStateLabel = "저장 기록 없음",
    isSaving,
    lastSavedAtLabel,
    onSave,
    recoveryHint = null,
    statusLabel
  } = props;

  return (
    <div className="editor-save-control">
      <button
        className="editor-save-button"
        disabled={disabled || isSaving}
        type="button"
        onClick={onSave}
      >
        {isSaving ? "저장 중..." : "저장"}
      </button>
      <div
        aria-live={recoveryHint ? "assertive" : "polite"}
        className="editor-save-meta"
        role={recoveryHint ? "alert" : "status"}
      >
        <span className="editor-save-status">{statusLabel}</span>
        {recoveryHint ? <span className="editor-save-status">{recoveryHint}</span> : null}
        <span className="editor-save-time">
          {lastSavedAtLabel ? `마지막 저장 ${lastSavedAtLabel}` : emptyStateLabel}
        </span>
      </div>
    </div>
  );
}
