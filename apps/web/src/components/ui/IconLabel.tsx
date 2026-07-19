import type { ComponentPropsWithoutRef, ReactNode } from "react";
import "./icon-label.css";

export type OrbitIconLabelProps = ComponentPropsWithoutRef<"span"> & {
  icon: ReactNode;
};

export function OrbitIconLabel({
  children,
  className = "",
  icon,
  ...props
}: OrbitIconLabelProps) {
  return (
    <span className={`redesign-icon-label ${className}`.trim()} {...props}>
      <span aria-hidden="true" className="redesign-icon-label-icon">
        {icon}
      </span>
      <span className="redesign-icon-label-text">{children}</span>
    </span>
  );
}
