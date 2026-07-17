import type { ComponentPropsWithoutRef } from "react";
import "./card.css";

export function OrbitCard({ className = "", ...props }: ComponentPropsWithoutRef<"article">) {
  return <article className={`redesign-card ${className}`.trim()} {...props} />;
}
