import type { ButtonHTMLAttributes, ReactNode } from "react";

export type OrbitButtonVariant = "primary" | "secondary" | "quiet";

export function OrbitButton(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    icon?: ReactNode;
    variant?: OrbitButtonVariant;
  }
) {
  const { children, className = "", icon, variant = "primary", ...buttonProps } = props;
  return (
    <button
      className={`orbit-ds-button orbit-ds-button-${variant} ${className}`.trim()}
      type="button"
      {...buttonProps}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

export type OrbitStatusTone = "neutral" | "lilac" | "success" | "warning" | "info";

export function OrbitStatus(props: { children: ReactNode; tone?: OrbitStatusTone }) {
  const { children, tone = "neutral" } = props;
  return <span className={`orbit-ds-status orbit-ds-status-${tone}`}>{children}</span>;
}

export function OrbitColorBlock(props: {
  children: ReactNode;
  icon: ReactNode;
  tone: "lilac" | "lime" | "cream";
}) {
  return (
    <article className={`orbit-ds-color-block orbit-ds-color-block-${props.tone}`}>
      {props.icon}
      <div>{props.children}</div>
    </article>
  );
}
