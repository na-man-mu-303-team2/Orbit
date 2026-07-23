import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { EditorExitConfirmModal } from "./EditorExitConfirmModal";

type DialogElementProps = {
  closeDisabled?: boolean;
  onClose: () => void;
};

describe("EditorExitConfirmModal", () => {
  it("닫기 동작은 변경사항 폐기 대신 모달 취소만 실행한다", () => {
    const onCancel = vi.fn();
    const onDiscard = vi.fn();
    const dialog = EditorExitConfirmModal({
      isSaving: false,
      onCancel,
      onDiscard,
      onSaveAndExit: vi.fn(),
    }) as ReactElement<DialogElementProps>;

    dialog.props.onClose();

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("저장 중에는 dialog 닫기 동작을 비활성화한다", () => {
    const dialog = EditorExitConfirmModal({
      isSaving: true,
      onCancel: vi.fn(),
      onDiscard: vi.fn(),
      onSaveAndExit: vi.fn(),
    }) as ReactElement<DialogElementProps>;

    expect(dialog.props.closeDisabled).toBe(true);
  });
});
