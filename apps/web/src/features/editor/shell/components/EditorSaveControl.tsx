type EditorSaveControlProps = {
  emptyStateLabel?: string;
  disabled?: boolean;
  isSaving: boolean;
  lastSavedAtLabel: string | null;
  onSave: () => void;
  errorMessage?: string | null;
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
    errorMessage = null,
    recoveryHint = null,
    statusLabel
  } = props;

  return (
    <div className="editor-save-control">
      <button
        aria-busy={isSaving}
        className="editor-save-button"
        disabled={disabled || isSaving}
        type="button"
        onClick={onSave}
      >
        {isSaving ? "저장 중..." : recoveryHint ? "다시 저장" : "저장"}
      </button>
      <div
        aria-live={recoveryHint ? "assertive" : "polite"}
        className="editor-save-meta"
        role={recoveryHint ? "alert" : "status"}
      >
        <span className="editor-save-status">{statusLabel}</span>
        {errorMessage ? <span className="editor-save-error-detail">{errorMessage}</span> : null}
        {recoveryHint ? <span className="editor-save-status">{recoveryHint}</span> : null}
        <span className="editor-save-time" aria-label="마지막 저장 시각">
          {lastSavedAtLabel ? `마지막 저장 ${lastSavedAtLabel}` : emptyStateLabel}
        </span>
      </div>
    </div>
  );
}
