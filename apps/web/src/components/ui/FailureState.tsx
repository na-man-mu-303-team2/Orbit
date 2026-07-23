import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { OrbitButton } from "./Button";
import "./failure-state.css";

export type OrbitFailureStateProps = Omit<ComponentPropsWithoutRef<"section">, "title"> & {
  description: string;
  onRetry: () => void;
  recommendedAction: string;
  retryLabel?: string;
  secondaryAction?: ReactNode;
  title: string;
};

export function OrbitFailureState({
  className = "",
  description,
  onRetry,
  recommendedAction,
  retryLabel = "다시 시도",
  secondaryAction,
  title,
  ...sectionProps
}: OrbitFailureStateProps) {
  const titleId = useId();

  return (
    <section
      {...sectionProps}
      className={`redesign-failure-state ${className}`.trim()}
      role="alert"
      aria-labelledby={titleId}
    >
      <h2 id={titleId}>{title}</h2>
      <p className="redesign-failure-state-description">{description}</p>
      <div className="redesign-failure-state-guide">
        <strong>다음과 같이 해보세요</strong>
        <p>{recommendedAction}</p>
      </div>
      <div className="redesign-failure-state-actions">
        <OrbitButton onClick={onRetry} size="prominent" variant="primary">
          {retryLabel}
        </OrbitButton>
        {secondaryAction}
      </div>
    </section>
  );
}
