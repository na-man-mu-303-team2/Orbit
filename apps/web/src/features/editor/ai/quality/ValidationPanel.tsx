import type { EditorValidationItem } from "./editorValidation";

export function ValidationPanel(props: { items: EditorValidationItem[] }) {
  return (
    <section className="suggestion-card">
      <strong>검증</strong>
      <div className="stack-list">
        {props.items.length > 0 ? (
          props.items.map((item, index) => (
            <div className="stack-item compact" key={`${item.message}-${index}`}>
              <span>{item.severity === "risk" ? "export risk" : "warning"}</span>
              <strong>{item.message}</strong>
              {item.elementId ? <small>{item.elementId}</small> : null}
            </div>
          ))
        ) : (
          <div className="stack-item compact">
            <span>warning 없음</span>
          </div>
        )}
      </div>
    </section>
  );
}
