import type { ComponentPropsWithoutRef } from "react";
import "../../styles/tokens.css";
import "./gradient-button.css";

type GradientButtonProps = ComponentPropsWithoutRef<"button"> & {
  size?: "default" | "large";
};

export function GradientButton({
  children,
  className = "",
  size = "default",
  type = "button",
  ...buttonProps
}: GradientButtonProps) {
  return (
    <button
      className={`redesign-gradient-button redesign-gradient-button-${size} ${className}`.trim()}
      type={type}
      {...buttonProps}
    >
      {children}
    </button>
  );
}
