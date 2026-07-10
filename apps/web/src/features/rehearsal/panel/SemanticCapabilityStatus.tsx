import { AlertCircle, CheckCircle2, TriangleAlert } from "lucide-react";

import type { SemanticCapabilityStatusItem } from "./semanticCapabilityStatusModel";

export function SemanticCapabilityStatus(props: {
  items: readonly SemanticCapabilityStatusItem[];
  onAction?: (item: SemanticCapabilityStatusItem) => void;
}) {
  if (props.items.length === 0) {
    return null;
  }

  return (
    <section
      className="semantic-capability-status"
      aria-label="시스템 상태 안내"
    >
      <header>
        <span>시스템 상태</span>
        <strong>{props.items.length}</strong>
      </header>
      <ul aria-live="polite">
        {props.items.map((item) => (
          <li
            className={`semantic-capability-status-row semantic-capability-status-row--${item.severity}`}
            key={item.key}
          >
            <StatusIcon item={item} />
            <div>
              <strong>{item.shortLabel}</strong>
              <p>{item.detail}</p>
              {item.affectedCount > 0 ? (
                <small>영향받은 Cue {item.affectedCount}개</small>
              ) : null}
            </div>
            {item.actionLabel && props.onAction ? (
              <button type="button" onClick={() => props.onAction?.(item)}>
                {item.actionLabel}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusIcon(props: { item: SemanticCapabilityStatusItem }) {
  if (props.item.recovered) {
    return <CheckCircle2 aria-hidden="true" size={17} />;
  }
  if (props.item.severity === "error") {
    return <AlertCircle aria-hidden="true" size={17} />;
  }
  return <TriangleAlert aria-hidden="true" size={17} />;
}
