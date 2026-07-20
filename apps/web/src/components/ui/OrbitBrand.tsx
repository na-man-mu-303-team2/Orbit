import type { ComponentPropsWithoutRef } from "react";
import mainLogo from "../../assets/main-logo.png";
import "../../styles/tokens.css";
import "./orbit-brand.css";

type OrbitBrandProps = Omit<ComponentPropsWithoutRef<"span">, "children">;

export function OrbitBrand({ className = "", ...spanProps }: OrbitBrandProps) {
  return (
    <span
      aria-hidden="true"
      className={`redesign-orbit-brand ${className}`.trim()}
      {...spanProps}
    >
      <img alt="" src={mainLogo} />
    </span>
  );
}
