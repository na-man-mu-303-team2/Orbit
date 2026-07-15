import type { EditorValidationItem } from "./editorValidation";
import {
  IconArrowsHorizontal as MoveHorizontal,
  IconMaximize as Maximize2,
  IconMinimize as Minimize2
} from "@tabler/icons-react";

export type ValidationTextOverflowAction =
  | "shrinkText"
  | "expandTextBox"
  | "singleLineTextBox";

export function ValidationPanel(props: {
  items: EditorValidationItem[];
  onApplyAllTextOverflow?: () => void;
  onHighlightElementIds?: (elementIds: string[]) => void;
  onTextOverflowAction?: (
    item: EditorValidationItem,
    action: ValidationTextOverflowAction
  ) => void;
}) {
  const canApplyAllTextOverflow = props.items.some(
    (item) => isAutoFitTextIssue(item) && item.elementId
  );

  return (
    <section className="suggestion-card validation-card" data-testid="editor-validation-panel">
      <strong>AI 검증</strong>
      <div className="stack-list">
        {props.items.length > 0 ? (
          props.items.map((item, index) => (
            <div
              className={`stack-item compact validation-item validation-item-${item.severity}`}
              data-testid="editor-validation-item"
              key={`${item.message}-${index}`}
              onMouseEnter={() =>
                props.onHighlightElementIds?.(elementIdsForValidationItem(item))
              }
              onMouseLeave={() => props.onHighlightElementIds?.([])}
            >
              <span>{item.severity === "risk" ? "내보내기 위험" : "경고"}</span>
              <strong>{item.message}</strong>
              {elementLabelForValidationItem(item) ? (
                <small>{elementLabelForValidationItem(item)}</small>
              ) : null}
              {isAutoFitTextIssue(item) && item.elementId ? (
                <div className="validation-item-actions">
                  <button
                    className="validation-action-button"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      props.onTextOverflowAction?.(item, "shrinkText");
                    }}
                  >
                    <Minimize2 aria-hidden="true" size={13} />
                    <span>글자 줄이기</span>
                  </button>
                  <button
                    className="validation-action-button"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      props.onTextOverflowAction?.(item, "expandTextBox");
                    }}
                  >
                    <MoveHorizontal aria-hidden="true" size={13} />
                    <span>상자 넓히기</span>
                  </button>
                  <button
                    className="validation-action-button"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      props.onTextOverflowAction?.(item, "singleLineTextBox");
                    }}
                  >
                    <Maximize2 aria-hidden="true" size={13} />
                    <span>한 줄로 넓히기</span>
                  </button>
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className="stack-item compact">
            <span>현재 슬라이드에서 감지된 문제가 없습니다.</span>
          </div>
        )}
      </div>
      {canApplyAllTextOverflow ? (
        <button
          className="validation-apply-all-button"
          type="button"
          onClick={props.onApplyAllTextOverflow}
        >
          모두 반영하기
        </button>
      ) : null}
    </section>
  );
}

function elementIdsForValidationItem(item: EditorValidationItem): string[] {
  if (item.elementIds?.length) {
    return item.elementIds;
  }

  return item.elementId ? [item.elementId] : [];
}

function isAutoFitTextIssue(item: EditorValidationItem) {
  return (
    item.issue === "textOverflow" ||
    item.issue === "titleWrap" ||
    item.issue === "labelWrap"
  );
}

function elementLabelForValidationItem(item: EditorValidationItem): string {
  const elementIds = elementIdsForValidationItem(item);
  if (elementIds.length === 0) {
    return "";
  }

  return elementIds.length === 1
    ? elementIds[0]
    : `${elementIds.length}개 요소: ${elementIds.join(", ")}`;
}
