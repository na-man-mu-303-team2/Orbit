import type { HTMLAttributes } from "react";
import "./workspace-container.css";

type WorkspaceContainerElement = "div" | "main" | "section";

export type WorkspaceContainerProps = HTMLAttributes<HTMLElement> & {
  as?: WorkspaceContainerElement;
  width?: "wide" | "content";
};

export function WorkspaceContainer({
  as: Element = "div",
  className = "",
  width = "wide",
  ...props
}: WorkspaceContainerProps) {
  const classes = [
    "redesign-workspace-container",
    width === "content" ? "redesign-workspace-container--content" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <Element className={classes} {...props} />;
}
