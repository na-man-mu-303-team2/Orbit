import type { HTMLAttributes } from "react";
import "./workspace-container.css";

type WorkspaceContainerElement = "div" | "main" | "section";

export type WorkspaceContainerProps = HTMLAttributes<HTMLElement> & {
  as?: WorkspaceContainerElement;
};

export function WorkspaceContainer({
  as: Element = "div",
  className = "",
  ...props
}: WorkspaceContainerProps) {
  const classes = ["redesign-workspace-container", className]
    .filter(Boolean)
    .join(" ");

  return <Element className={classes} {...props} />;
}
