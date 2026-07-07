import type { EditorValidationItem } from "./editorValidation";

export function ValidationPanel(props: {
  items: EditorValidationItem[];
  onHighlightElementIds?: (elementIds: string[]) => void;
}) {
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
            </div>
          ))
        ) : (
          <div className="stack-item compact">
            <span>현재 슬라이드에서 감지된 문제가 없습니다.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function elementIdsForValidationItem(item: EditorValidationItem): string[] {
  if (item.elementIds?.length) {
    return item.elementIds;
  }

  return item.elementId ? [item.elementId] : [];
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
