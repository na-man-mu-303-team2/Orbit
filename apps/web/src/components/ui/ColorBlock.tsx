import type { ReactNode } from "react";
import "./color-block.css";

export function OrbitColorBlock(props: { children: ReactNode; icon: ReactNode; tone: "lilac" | "lime" | "cream" }) {
  return (
    <article className={`redesign-color-block redesign-color-block-${props.tone}`}>
      {props.icon}
      <div>{props.children}</div>
    </article>
  );
}
