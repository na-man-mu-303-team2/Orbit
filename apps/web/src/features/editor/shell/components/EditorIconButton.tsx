import type { ButtonHTMLAttributes, ReactNode } from "react";

type EditorIconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children"
> & {
  icon: ReactNode;
  label: string;
};

export function EditorIconButton(props: EditorIconButtonProps) {
  const { className = "", icon, label, title = label, ...buttonProps } = props;

  return (
    <button
      {...buttonProps}
      aria-label={label}
      className={`editor-icon-action ${className}`.trim()}
      title={title}
      type={props.type ?? "button"}
    >
      <span aria-hidden="true" className="editor-icon-action-glyph">
        {icon}
      </span>
    </button>
  );
}
