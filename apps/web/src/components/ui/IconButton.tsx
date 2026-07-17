import type { ButtonHTMLAttributes } from "react";
import "./icon-button.css";

export type OrbitIconButtonVariant = "surface" | "plain" | "inverse" | "primary";

export function OrbitIconButton(
  props: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
    "aria-label": string;
    variant?: OrbitIconButtonVariant;
  }
) {
  const { className = "", type = "button", variant = "surface", ...buttonProps } = props;
  return (
    <button
      className={`redesign-icon-button redesign-icon-button-${variant} ${className}`.trim()}
      type={type}
      {...buttonProps}
    />
  );
}
