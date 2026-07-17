import type { ComponentPropsWithoutRef } from "react";
import orbitSymbol from "../../assets/orbit-symbol-v2.png";
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
      <img alt="" src={orbitSymbol} />
      <span className="redesign-orbit-brand-wordmark">ORBIT</span>
    </span>
  );
}
