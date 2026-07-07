type EditorExitConfirmModalProps = {
  isSaving: boolean;
  onDiscard: () => void;
  onSaveAndExit: () => void;
};

export function EditorExitConfirmModal(props: EditorExitConfirmModalProps) {
  const { isSaving, onDiscard, onSaveAndExit } = props;

  return (
    <div className="editor-exit-modal-backdrop" role="presentation">
      <section
        aria-label="저장 확인"
        aria-modal="true"
        className="editor-exit-modal"
        role="dialog"
      >
        <div className="editor-exit-modal-copy">
          <strong>저장되지 않은 변경 사항이 있습니다</strong>
          <p>현재 화면의 변경 사항이 아직 서버에 저장되지 않았습니다.</p>
        </div>
        <div className="editor-exit-modal-actions">
          <button
            className="editor-exit-secondary-button"
            disabled={isSaving}
            type="button"
            onClick={onDiscard}
          >
            그냥 나가기
          </button>
          <button
            className="editor-exit-primary-button"
            disabled={isSaving}
            type="button"
            onClick={onSaveAndExit}
          >
            {isSaving ? "저장 중..." : "저장하고 나가기"}
          </button>
        </div>
      </section>
    </div>
  );
}
