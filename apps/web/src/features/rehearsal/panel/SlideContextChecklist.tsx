import type { SlideContextItem } from "@orbit/shared";
import { useCallback, useState } from "react";

export type SlideContextChecklistProps = {
  items: readonly SlideContextItem[];
  currentSlideId: string | null;
  isLoading: boolean;
  isExtracting: boolean;
  errorMessage?: string | null;
  coveredItemIds: ReadonlySet<string>;
  exitWarningItemIds: ReadonlySet<string>;
  onExtract: () => void;
  onUpdate: (itemId: string, label: string, sentence: string) => Promise<void>;
  onDelete: (itemId: string) => Promise<void>;
};

type EditState = {
  itemId: string;
  label: string;
  sentence: string;
  isSaving: boolean;
};

export function SlideContextChecklist(props: SlideContextChecklistProps) {
  const [editState, setEditState] = useState<EditState | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const slideItems = props.currentSlideId
    ? props.items.filter((item) => item.slideId === props.currentSlideId)
    : [];

  const hasAnyItems = props.items.length > 0;

  const startEdit = useCallback((item: SlideContextItem) => {
    setEditState({ itemId: item.itemId, label: item.label, sentence: item.sentence, isSaving: false });
  }, []);

  const cancelEdit = useCallback(() => setEditState(null), []);

  const saveEdit = useCallback(async () => {
    if (!editState || editState.isSaving) return;
    const { itemId, label, sentence } = editState;
    if (!label.trim() || !sentence.trim()) return;
    setEditState((prev) => prev && { ...prev, isSaving: true });
    try {
      await props.onUpdate(itemId, label.trim(), sentence.trim());
      setEditState(null);
    } catch {
      setEditState((prev) => prev && { ...prev, isSaving: false });
    }
  }, [editState, props]);

  const handleDelete = useCallback(async (itemId: string) => {
    if (deletingIds.has(itemId)) return;
    setDeletingIds((prev) => new Set([...prev, itemId]));
    try {
      await props.onDelete(itemId);
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  }, [deletingIds, props]);

  return (
    <section className="rehearsal-panel-section" aria-label="필수 발화 항목">
      <div className="rehearsal-panel-section-heading">
        <span>필수 발화 항목</span>
        {hasAnyItems ? (
          <div className="slide-context-heading-actions">
            <strong>
              {slideItems.filter((i) => props.coveredItemIds.has(i.itemId)).length}/{slideItems.length}
            </strong>
            <button
              className="slide-context-reextract-button"
              type="button"
              onClick={props.onExtract}
              disabled={props.isExtracting}
              title="전체 슬라이드 항목 재추출"
            >
              {props.isExtracting ? "추출 중…" : "재추출"}
            </button>
          </div>
        ) : null}
      </div>

      {props.errorMessage ? (
        <p className="slide-context-error">{props.errorMessage}</p>
      ) : null}

      {props.isLoading ? (
        <p className="rehearsal-panel-empty">불러오는 중…</p>
      ) : !hasAnyItems ? (
        <div className="slide-context-empty">
          <p className="rehearsal-panel-empty">항목 없음</p>
          <button
            className="slide-context-extract-button"
            type="button"
            onClick={props.onExtract}
            disabled={props.isExtracting}
          >
            {props.isExtracting ? "추출 중…" : "항목 추출"}
          </button>
        </div>
      ) : slideItems.length === 0 ? (
        <p className="rehearsal-panel-empty">이 슬라이드에 항목 없음</p>
      ) : (
        <ul className="rehearsal-panel-keywords slide-context-list">
          {slideItems.map((item) => {
            const isEditing = editState?.itemId === item.itemId;
            const isDeleting = deletingIds.has(item.itemId);

            if (isEditing && editState) {
              return (
                <li key={item.itemId} className="slide-context-item slide-context-item-editing">
                  <div className="slide-context-edit-form">
                    <input
                      className="slide-context-label-input"
                      type="text"
                      value={editState.label}
                      maxLength={200}
                      disabled={editState.isSaving}
                      placeholder="레이블"
                      onChange={(e) =>
                        setEditState((prev) => prev && { ...prev, label: e.target.value })
                      }
                    />
                    <textarea
                      className="slide-context-sentence-input"
                      value={editState.sentence}
                      maxLength={1000}
                      rows={3}
                      disabled={editState.isSaving}
                      placeholder="비교 문장"
                      onChange={(e) =>
                        setEditState((prev) => prev && { ...prev, sentence: e.target.value })
                      }
                    />
                    <div className="slide-context-edit-actions">
                      <button
                        className="slide-context-save-button"
                        type="button"
                        disabled={editState.isSaving || !editState.label.trim() || !editState.sentence.trim()}
                        onClick={() => { void saveEdit(); }}
                      >
                        {editState.isSaving ? "저장 중…" : "저장"}
                      </button>
                      <button
                        className="slide-context-cancel-button"
                        type="button"
                        disabled={editState.isSaving}
                        onClick={cancelEdit}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                </li>
              );
            }

            const isCovered = props.coveredItemIds.has(item.itemId);
            const isExitWarning = !isCovered && props.exitWarningItemIds.has(item.itemId);
            return (
              <li
                key={item.itemId}
                className={[
                  "rehearsal-panel-keyword slide-context-item",
                  isCovered ? "rehearsal-panel-keyword-hit" : "",
                  isExitWarning ? "rehearsal-panel-keyword-missing" : "",
                  isDeleting ? "slide-context-item-deleting" : ""
                ].filter(Boolean).join(" ")}
              >
                <em>{isCovered ? "체크" : isExitWarning ? "누락" : "대기"}</em>
                <span className="slide-context-item-label" title={item.sentence}>
                  {item.label}
                </span>
                <div className="slide-context-item-actions">
                  <button
                    className="slide-context-edit-button"
                    type="button"
                    disabled={isDeleting || editState !== null}
                    onClick={() => startEdit(item)}
                    aria-label="수정"
                    title="수정"
                  >
                    ✎
                  </button>
                  <button
                    className="slide-context-delete-button"
                    type="button"
                    disabled={isDeleting || editState !== null}
                    onClick={() => { void handleDelete(item.itemId); }}
                    aria-label="삭제"
                    title="삭제"
                  >
                    {isDeleting ? "…" : "×"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
