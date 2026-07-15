import { OrbitButton, OrbitDialog } from "../../../../design-system";

type EditorExitConfirmModalProps = {
  isSaving: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSaveAndExit: () => void;
};

export function EditorExitConfirmModal(props: EditorExitConfirmModalProps) {
  const { isSaving, onCancel, onDiscard, onSaveAndExit } = props;

  return (
    <OrbitDialog
      description="현재 화면의 변경 사항이 아직 서버에 저장되지 않았습니다."
      closeDisabled={isSaving}
      footer={
        <>
          <OrbitButton disabled={isSaving} onClick={onDiscard} variant="secondary">
            그냥 나가기
          </OrbitButton>
          <OrbitButton disabled={isSaving} onClick={onSaveAndExit}>
            {isSaving ? "저장 중..." : "저장하고 나가기"}
          </OrbitButton>
        </>
      }
      onClose={onCancel}
      open
      title="저장되지 않은 변경 사항이 있습니다"
    >
      {null}
    </OrbitDialog>
  );
}
