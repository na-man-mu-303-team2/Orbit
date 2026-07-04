import type { ReactNode } from "react";

export function AnimationPanelSection(props: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  title: string;
}) {
  const { action, children, className, title } = props;

  return (
    <section
      className={
        className
          ? `animation-panel-section ${className}`
          : "animation-panel-section"
      }
    >
      <div className="animation-panel-section-header">
        <strong>{title}</strong>
        {action ? action : null}
      </div>
      {children}
    </section>
  );
}
