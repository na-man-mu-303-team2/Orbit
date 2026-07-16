import type {
  PresentationJourneyAction,
  PresentationJourneyActionId,
  PresentationJourneyViewModel,
} from "../presentationJourney";
import "./presentation-journey.css";

type PresentationJourneyPanelProps = {
  busy: boolean;
  model: PresentationJourneyViewModel;
  onAction: (action: PresentationJourneyAction) => void;
  statusMessage?: string | null;
};

const actionSelectors = {
  "edit-brief": "brief-edit",
  "view-brief": "brief-view",
  "open-validation": "validation-open",
  "focus-validation": "validation-focus",
  "start-rehearsal": "rehearsal-start",
  "start-presentation": "presentation-start",
} satisfies Record<PresentationJourneyActionId, string>;

export function PresentationJourneyPanel(props: PresentationJourneyPanelProps) {
  const statusMessage = props.statusMessage ?? "";

  return (
    <nav
      aria-busy={props.busy}
      aria-label="발표 준비 경로"
      className="presentation-journey-panel"
      data-testid="presentation-journey-panel"
    >
      <header className="presentation-journey-header">
        <strong>발표 준비 경로</strong>
        <span>브리프부터 발표까지 필요한 행동을 확인하세요.</span>
      </header>
      <ol className="presentation-journey-list">
        {props.model.steps.map((step) => {
          const action = step.action;
          const actionSelector = action ? actionSelectors[action.id] : null;

          return (
            <li
              className="presentation-journey-step"
              data-journey-step={step.id}
              key={step.id}
            >
              <div className="presentation-journey-step-content">
                <strong>{step.label}</strong>
                <span>{step.statusText}</span>
                {action && actionSelector ? (
                  <button
                    className="presentation-journey-action"
                    data-journey-action={actionSelector}
                    data-testid={`presentation-journey-${actionSelector}`}
                    disabled={props.busy}
                    onClick={() => props.onAction(action)}
                    type="button"
                  >
                    {action.label}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      <p
        aria-atomic="true"
        aria-live="polite"
        className={`presentation-journey-status${statusMessage ? "" : " is-empty"}`}
        data-testid="presentation-journey-status"
        role="status"
      >
        {statusMessage}
      </p>
    </nav>
  );
}
